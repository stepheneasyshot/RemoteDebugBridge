mod protocol;

use crate::adb::Adb;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::VecDeque,
    process::Stdio,
    sync::{
        Arc, Mutex as StdMutex,
        atomic::{AtomicU32, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    Manager,
    ipc::{Channel, InvokeResponseBody},
    path::BaseDirectory,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    process::Child,
    sync::{Mutex, Notify, mpsc, watch},
    time::{sleep, timeout},
};

type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub struct MirrorState {
    active: Mutex<Option<Arc<Session>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    session_id: u32,
    kind: String,
    message: String,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Input {
    Touch {
        action: u8,
        x: u32,
        y: u32,
        width: u16,
        height: u16,
    },
    Key {
        keycode: u32,
    },
}

#[derive(Default)]
struct Flow {
    sent: AtomicU32,
    acknowledged: AtomicU32,
    changed: Notify,
}

impl Flow {
    fn acknowledge(&self, sequence: u32) {
        if sequence <= self.sent.load(Ordering::SeqCst) {
            self.acknowledged.fetch_max(sequence, Ordering::SeqCst);
            self.changed.notify_one();
        }
    }

    async fn send(
        &self,
        channel: &Channel<InvokeResponseBody>,
        packet: Vec<u8>,
        limit: u32,
    ) -> Result<()> {
        while self.sent.load(Ordering::SeqCst) - self.acknowledged.load(Ordering::SeqCst) >= limit {
            timeout(Duration::from_secs(5), self.changed.notified())
                .await
                .map_err(|_| "前端停止消费媒体数据，请重新开始投屏".to_string())?;
        }
        let sequence = self.sent.fetch_add(1, Ordering::SeqCst) + 1;
        let mut data = Vec::with_capacity(4 + packet.len());
        data.extend_from_slice(&sequence.to_be_bytes());
        data.extend_from_slice(&packet);
        channel
            .send(InvokeResponseBody::Raw(data))
            .map_err(|e| e.to_string())
    }
}

struct Session {
    id: u32,
    cancel: watch::Sender<bool>,
    done: watch::Sender<bool>,
    input: mpsc::Sender<Vec<u8>>,
    video: Flow,
    audio: Flow,
    status: Channel<Status>,
}

impl Session {
    fn report(&self, kind: &str, message: impl Into<String>) {
        let _ = self.status.send(Status {
            session_id: self.id,
            kind: kind.into(),
            message: message.into(),
        });
    }
}

struct Resources {
    adb: Adb,
    serial: String,
    remote: String,
    port: Option<u16>,
    forward: Option<tokio::task::JoinHandle<Result<u16>>>,
    child: Option<Child>,
    log_tasks: Vec<tokio::task::JoinHandle<()>>,
    log: Arc<StdMutex<VecDeque<u8>>>,
    pushed: bool,
}

impl Resources {
    async fn cleanup(&mut self) -> Vec<String> {
        let mut warnings = Vec::new();
        // ADB may create the tunnel just as startup is cancelled. Keep and join
        // that operation so its allocated port is still removed below.
        if let Some(forward) = self.forward.take() {
            match forward.await {
                Ok(Ok(port)) => self.port = Some(port),
                Ok(Err(error)) => warnings.push(error),
                Err(error) => warnings.push(error.to_string()),
            }
        }
        // Closing the sockets terminates scrcpy; allow the server's own cleanup first.
        if let Some(child) = self.child.as_mut() {
            if timeout(Duration::from_secs(2), child.wait()).await.is_err() {
                let _ = child.kill().await;
            }
        }
        for task in self.log_tasks.drain(..) {
            task.abort();
            let _ = task.await;
        }
        if let Some(port) = self.port.take() {
            let port = format!("tcp:{port}");
            if let Err(error) = self
                .adb
                .run(&["-s", &self.serial, "forward", "--remove", &port])
                .await
            {
                warnings.push(error);
            }
        }
        if self.pushed {
            // The server usually unlinks itself. Only remove our unique fallback path.
            let _ = timeout(
                Duration::from_secs(2),
                self.adb
                    .run(&["-s", &self.serial, "shell", "rm", "-f", &self.remote]),
            )
            .await;
        }
        warnings
    }
}

impl MirrorState {
    pub async fn stop(&self, id: Option<u32>) -> Result<()> {
        let session = self.active.lock().await.clone();
        if let Some(session) = session {
            if id.is_some_and(|id| id != session.id) {
                return Ok(());
            }
            session.cancel.send_replace(true);
            let mut done = session.done.subscribe();
            while !*done.borrow_and_update() {
                done.changed()
                    .await
                    .map_err(|_| "会话清理异常".to_string())?;
            }
            let mut active = self.active.lock().await;
            if active
                .as_ref()
                .is_some_and(|current| current.id == session.id)
            {
                *active = None;
            }
        }
        Ok(())
    }

    async fn get(&self, id: u32) -> Result<Arc<Session>> {
        self.active
            .lock()
            .await
            .as_ref()
            .filter(|s| s.id == id && !*s.done.borrow() && !*s.cancel.borrow())
            .cloned()
            .ok_or_else(|| "投屏会话已结束".into())
    }
}

#[tauri::command]
pub async fn list_devices(adb_path: String) -> Result<Vec<crate::adb::Device>> {
    Adb::new(adb_path).devices().await
}

#[tauri::command]
pub async fn start_mirror(
    app: tauri::AppHandle,
    state: tauri::State<'_, MirrorState>,
    adb_path: String,
    serial: String,
    video: Channel<InvokeResponseBody>,
    audio: Channel<InvokeResponseBody>,
    status: Channel<Status>,
) -> Result<u32> {
    if serial.is_empty() || serial.len() > 256 || serial.chars().any(char::is_control) {
        return Err("请选择有效设备".into());
    }
    let mut active = state.active.lock().await;
    if active.as_ref().is_some_and(|s| !*s.done.borrow()) {
        return Err("请先停止当前会话".into());
    }
    static SEQUENCE: AtomicU32 = AtomicU32::new(1);
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let id = (seed ^ std::process::id() ^ SEQUENCE.fetch_add(1, Ordering::Relaxed)) & 0x7fff_ffff;
    let (cancel, _) = watch::channel(false);
    let (done, _) = watch::channel(false);
    let (input, input_rx) = mpsc::channel(64);
    let session = Arc::new(Session {
        id,
        cancel,
        done,
        input,
        video: Flow::default(),
        audio: Flow::default(),
        status,
    });
    *active = Some(session.clone());
    tauri::async_runtime::spawn(async move {
        let mut resources = Resources {
            adb: Adb::new(adb_path),
            serial,
            remote: format!("/data/local/tmp/rdb-scrcpy-{id:08x}.jar"),
            port: None,
            forward: None,
            child: None,
            log_tasks: Vec::new(),
            log: Arc::new(StdMutex::new(VecDeque::new())),
            pushed: false,
        };
        session.report("starting", "正在连接设备…");
        let mut cancel = session.cancel.subscribe();
        let result = if *cancel.borrow() {
            Ok(())
        } else {
            tokio::select! {
                _ = cancel.changed() => Ok(()),
                result = run_session(&app, &session, &mut resources, video, audio, input_rx) => result,
            }
        };
        let warnings = resources.cleanup().await;
        let cancelled = *session.cancel.borrow();
        match result {
            Err(error) if !cancelled => {
                let bytes: Vec<u8> = resources.log.lock().unwrap().iter().copied().collect();
                session.report(
                    "error",
                    format!("{error}\n{}", String::from_utf8_lossy(&bytes).trim()),
                );
            }
            _ => session.report("stopped", "投屏已停止"),
        }
        for warning in warnings {
            session.report("warning", format!("清理提示：{warning}"));
        }
        session.done.send_replace(true);
    });
    Ok(id)
}

#[tauri::command]
pub async fn stop_mirror(
    state: tauri::State<'_, MirrorState>,
    session_id: Option<u32>,
) -> Result<()> {
    state.stop(session_id).await
}

#[tauri::command]
pub async fn acknowledge_media(
    state: tauri::State<'_, MirrorState>,
    session_id: u32,
    video: u32,
    audio: u32,
) -> Result<()> {
    if let Ok(session) = state.get(session_id).await {
        session.video.acknowledge(video);
        session.audio.acknowledge(audio);
    }
    Ok(())
}

#[tauri::command]
pub async fn send_input(
    state: tauri::State<'_, MirrorState>,
    session_id: u32,
    input: Input,
) -> Result<()> {
    let session = state.get(session_id).await?;
    let bytes = match input {
        Input::Touch {
            action,
            x,
            y,
            width,
            height,
        } => protocol::touch(action, x, y, width, height)?,
        Input::Key { keycode } => protocol::key(keycode)?,
    };
    timeout(Duration::from_secs(1), session.input.send(bytes))
        .await
        .map_err(|_| "输入队列繁忙".to_string())?
        .map_err(|_| "控制连接已关闭".into())
}

async fn run_session(
    app: &tauri::AppHandle,
    session: &Session,
    resources: &mut Resources,
    video_channel: Channel<InvokeResponseBody>,
    audio_channel: Channel<InvokeResponseBody>,
    input: mpsc::Receiver<Vec<u8>>,
) -> Result<()> {
    let manifest: serde_json::Value =
        serde_json::from_str(include_str!("../../resources/scrcpy/manifest.json"))
            .map_err(|e| e.to_string())?;
    let asset = &manifest["assets"][0];
    let file = asset["file"].as_str().ok_or("资源清单缺少 server")?;
    let version = manifest["version"].as_str().ok_or("资源清单缺少版本")?;
    let path = app
        .path()
        .resolve(format!("resources/scrcpy/{file}"), BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("无法读取 server 资源 {}：{e}", path.display()))?;
    let digest = format!("{:x}", Sha256::digest(&data));
    if asset["sha256"].as_str() != Some(&digest) {
        return Err("server 校验失败，请运行资源准备脚本".into());
    }
    if !resources
        .adb
        .devices()
        .await?
        .iter()
        .any(|d| d.serial == resources.serial && d.state == "device")
    {
        return Err("目标设备未连接或未授权".into());
    }
    let path_string = path.to_string_lossy();
    // Mark before awaiting, so a cancelled partial push is also cleaned up.
    resources.pushed = true;
    resources
        .adb
        .run(&[
            "-s",
            &resources.serial,
            "push",
            &path_string,
            &resources.remote,
        ])
        .await?;
    let socket = format!("localabstract:scrcpy_{:08x}", session.id);
    let adb = resources.adb.clone();
    let serial = resources.serial.clone();
    resources.forward = Some(tokio::spawn(async move {
        adb.run(&["-s", &serial, "forward", "tcp:0", &socket])
            .await?
            .parse::<u16>()
            .map_err(|_| "ADB 未返回有效转发端口".to_string())
    }));
    let result = resources.forward.as_mut().unwrap().await;
    resources.forward = None;
    let port = result.map_err(|e| e.to_string())??;
    resources.port = Some(port);
    let mut child = resources
        .adb
        .command()
        .args([
            "-s",
            &resources.serial,
            "shell",
            &format!("CLASSPATH={}", resources.remote),
            "app_process",
            "/",
            "com.genymobile.scrcpy.Server",
            version,
            &format!("scid={:08x}", session.id),
            "tunnel_forward=true",
            "video_codec=h264",
            "audio_codec=raw",
            "max_size=1280",
            "max_fps=30",
            "video_bit_rate=4000000",
            "clipboard_autosync=false",
            "power_on=false",
            "log_level=info",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    resources.log_tasks.push(tokio::spawn(drain_log(
        child.stdout.take().unwrap(),
        resources.log.clone(),
    )));
    resources.log_tasks.push(tokio::spawn(drain_log(
        child.stderr.take().unwrap(),
        resources.log.clone(),
    )));
    resources.child = Some(child);
    let mut video = timeout(
        Duration::from_secs(10),
        connect_video(port, resources.child.as_mut().unwrap()),
    )
    .await
    .map_err(|_| "等待 scrcpy-server 连接超时".to_string())??;
    let mut audio = connect(port).await?;
    let control = connect(port).await?;
    let mut name = [0u8; 64];
    timeout(Duration::from_secs(10), video.read_exact(&mut name))
        .await
        .map_err(|_| "读取设备信息超时".to_string())?
        .map_err(|e| e.to_string())?;
    session.report(
        "connected",
        String::from_utf8_lossy(&name).trim_end_matches('\0'),
    );
    tokio::try_join!(
        read_media(&mut video, true, session, &video_channel),
        read_media(&mut audio, false, session, &audio_channel),
        control_loop(control, input),
    )?;
    Ok(())
}

async fn connect(port: u16) -> Result<TcpStream> {
    let stream = timeout(
        Duration::from_secs(2),
        TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port)),
    )
    .await
    .map_err(|_| "连接转发端口超时".to_string())?
    .map_err(|e| e.to_string())?;
    stream.set_nodelay(true).map_err(|e| e.to_string())?;
    Ok(stream)
}

async fn connect_video(port: u16, child: &mut Child) -> Result<TcpStream> {
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Err(format!("scrcpy-server 启动退出：{status}"));
        }
        if let Ok(mut stream) = connect(port).await {
            if let Ok(Ok(0)) = timeout(Duration::from_millis(500), stream.read_u8()).await {
                return Ok(stream);
            }
        }
        sleep(Duration::from_millis(100)).await;
    }
}

async fn read_media(
    stream: &mut TcpStream,
    video: bool,
    session: &Session,
    channel: &Channel<InvokeResponseBody>,
) -> Result<()> {
    let result = async {
        let codec = timeout(Duration::from_secs(10), stream.read_u32())
            .await
            .map_err(|_| "读取媒体格式超时".to_string())?
            .map_err(|e| e.to_string())?;
        if codec == 0 {
            return Err("设备无法捕获该媒体流，请检查 Android 版本、授权及锁屏状态".into());
        }
        if codec != if video { protocol::H264 } else { protocol::PCM } {
            return Err(format!("不支持的媒体格式：0x{codec:08x}"));
        }
        if !video {
            session.report("audio_ready", "设备音频已连接");
        }
        let flow = if video {
            &session.video
        } else {
            &session.audio
        };
        loop {
            let packet = protocol::read_packet(stream, video).await?;
            flow.send(channel, packet, if video { 8 } else { 24 })
                .await?;
        }
    }
    .await;
    if video {
        result
    } else {
        if let Err(error) = result {
            session.report("audio_unavailable", error);
        }
        Ok(())
    }
}

async fn control_loop(stream: TcpStream, mut input: mpsc::Receiver<Vec<u8>>) -> Result<()> {
    let (mut reader, mut writer) = stream.into_split();
    let read = async {
        let mut bytes = [0; 1024];
        loop {
            let count = reader.read(&mut bytes).await.map_err(|e| e.to_string())?;
            if count == 0 {
                return Err::<(), String>("设备控制连接已断开".into());
            }
        }
    };
    let write = async {
        while let Some(bytes) = input.recv().await {
            timeout(Duration::from_secs(2), writer.write_all(&bytes))
                .await
                .map_err(|_| "发送输入超时".to_string())?
                .map_err(|e| e.to_string())?;
        }
        Ok::<(), String>(())
    };
    tokio::try_join!(read, write)?;
    Ok(())
}

async fn drain_log(mut stream: impl AsyncRead + Unpin, log: Arc<StdMutex<VecDeque<u8>>>) {
    let mut bytes = [0; 1024];
    while let Ok(size) = stream.read(&mut bytes).await {
        if size == 0 {
            break;
        }
        let mut log = log.lock().unwrap();
        log.extend(&bytes[..size]);
        while log.len() > 4096 {
            log.pop_front();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_or_reordered_ack_does_not_release_unsent_packets() {
        let flow = Flow::default();
        flow.sent.store(4, Ordering::SeqCst);
        flow.acknowledge(5);
        assert_eq!(flow.acknowledged.load(Ordering::SeqCst), 0);
        flow.acknowledge(3);
        flow.acknowledge(2);
        assert_eq!(flow.acknowledged.load(Ordering::SeqCst), 3);
    }
}
