use crate::{
    adb::Adb,
    command::{self, Output},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::{Mutex, watch};
type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub struct WorkbenchState {
    active: Mutex<Option<Arc<Target>>>,
    transition: Mutex<()>,
}
struct Target {
    id: u32,
    serial: String,
    adb: Adb,
    journal: PathBuf,
    cancel: watch::Sender<bool>,
    actions: Mutex<()>,
    terminal: Mutex<Option<watch::Sender<bool>>>,
}
impl Target {
    fn check(&self) -> Result<()> {
        if *self.cancel.borrow() {
            Err("目标会话已结束，请重新选择设备".into())
        } else {
            Ok(())
        }
    }
    async fn shell(&self, args: &[&str]) -> Result<String> {
        self.check()?;
        let mut command = vec!["-s", &self.serial, "shell"];
        command.extend_from_slice(args);
        let (out, _) =
            command::run(&self.adb, &command, self.cancel.subscribe(), 10, 256 * 1024).await?;
        if out.status != "success" {
            return Err(format!(
                "{}：{} {}",
                out.status,
                out.stderr.trim(),
                out.stdout.trim()
            ));
        }
        Ok(out.stdout.trim().into())
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    id: Option<u32>,
    warning: Option<String>,
}
impl WorkbenchState {
    async fn target(&self, id: u32) -> Result<Arc<Target>> {
        let target = self
            .active
            .lock()
            .await
            .as_ref()
            .filter(|t| t.id == id)
            .cloned()
            .ok_or("目标已切换")?;
        target.check()?;
        Ok(target)
    }
    pub async fn close(&self) -> Result<()> {
        let _transition = self.transition.lock().await;
        self.close_inner().await
    }
    async fn close_inner(&self) -> Result<()> {
        if let Some(target) = self.active.lock().await.take() {
            target.cancel.send_replace(true);
            if let Some(job) = target.terminal.lock().await.as_ref() {
                job.send_replace(true);
            }
            let _guard = target.actions.lock().await;
            restore(&target).await?;
        }
        Ok(())
    }
    pub async fn restore_device(&self, serial: &str) -> Result<()> {
        let target = self.active.lock().await.clone();
        if let Some(target) = target.filter(|t| t.serial == serial) {
            let _guard = target.actions.lock().await;
            restore(&target).await?;
        }
        Ok(())
    }
}
#[tauri::command]
pub async fn set_workbench_target(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkbenchState>,
    adb_path: String,
    serial: Option<String>,
) -> Result<Opened> {
    let _transition = state.transition.lock().await;
    let warning = state.close_inner().await.err();
    let Some(serial) = serial else {
        return Ok(Opened { id: None, warning });
    };
    let adb = Adb::new(adb_path);
    if !adb
        .devices()
        .await?
        .iter()
        .any(|d| d.serial == serial && d.state == "device")
    {
        return Err("目标设备未在线或未授权".into());
    }
    use sha2::{Digest, Sha256};
    let folder = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("restore");
    tokio::fs::create_dir_all(&folder)
        .await
        .map_err(|e| e.to_string())?;
    static IDS: AtomicU32 = AtomicU32::new(1);
    let id = IDS.fetch_add(1, Ordering::Relaxed);
    let (cancel, _) = watch::channel(false);
    let target = Target {
        id,
        journal: folder.join(format!("{:x}.json", Sha256::digest(serial.as_bytes()))),
        serial,
        adb,
        cancel,
        actions: Mutex::new(()),
        terminal: Mutex::new(None),
    };
    *state.active.lock().await = Some(Arc::new(target));
    Ok(Opened {
        id: Some(id),
        warning,
    })
}

#[derive(Serialize, Deserialize, Default)]
struct Journal {
    values: BTreeMap<String, String>,
}
async fn journal(target: &Target) -> Result<Journal> {
    match tokio::fs::read(&target.journal).await {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|e| format!("恢复记录损坏，已阻止修改：{e}"))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Journal::default()),
        Err(e) => Err(e.to_string()),
    }
}
async fn save(target: &Target, record: &Journal) -> Result<()> {
    let temp = target.journal.with_extension("tmp");
    tokio::fs::write(
        &temp,
        serde_json::to_vec(record).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;
    tokio::fs::rename(temp, &target.journal)
        .await
        .map_err(|e| e.to_string())
}
fn wm_value(output: &str, name: &str) -> Result<(String, String)> {
    let physical = output
        .lines()
        .find_map(|line| line.strip_prefix(&format!("Physical {name}: ")))
        .ok_or("无法读取设备默认显示参数")?;
    let over = output
        .lines()
        .find_map(|line| line.strip_prefix(&format!("Override {name}: ")))
        .unwrap_or("reset");
    Ok((
        if over == "reset" { physical } else { over }.into(),
        over.into(),
    ))
}
async fn original(target: &Target, key: &str) -> Result<String> {
    if matches!(key, "size" | "density") {
        return Ok(wm_value(&target.shell(&["wm", key]).await?, key)?.1);
    }
    let value = target
        .shell(&["settings", "--user", "current", "get", "system", key])
        .await?;
    if value == "null" || value.parse::<u8>().is_ok() {
        Ok(value)
    } else {
        Err(format!("无法读取 {key} 原值"))
    }
}
fn setting_args(key: &str, value: &str) -> Vec<String> {
    if matches!(key, "size" | "density") {
        vec!["wm".into(), key.into(), value.into()]
    } else if value == "null" {
        vec!["settings", "--user", "current", "delete", "system", key]
            .into_iter()
            .map(str::to_owned)
            .collect()
    } else {
        vec!["settings", "--user", "current", "put", "system", key, value]
            .into_iter()
            .map(str::to_owned)
            .collect()
    }
}
async fn restore(target: &Target) -> Result<()> {
    restore_keys(target, None).await
}
async fn restore_keys(target: &Target, keys: Option<&[&str]>) -> Result<()> {
    let mut record = journal(target).await?;
    if record.values.is_empty() {
        return Ok(());
    }
    // Restoring has its own lifetime: closing the target cancels user commands, not cleanup.
    let (_cancel, rx) = watch::channel(false);
    let mut errors = Vec::new();
    for (key, value) in record.values.clone() {
        if keys.is_some_and(|keys| !keys.contains(&key.as_str())) {
            continue;
        }
        let args = setting_args(&key, &value);
        let mut command = vec!["-s", target.serial.as_str(), "shell"];
        command.extend(args.iter().map(String::as_str));
        match command::run(&target.adb, &command, rx.clone(), 3, 8192).await {
            Ok((out, _)) if out.status == "success" => {
                // Read back before removing the recovery entry.
                let query = if matches!(key.as_str(), "size" | "density") {
                    vec!["wm", key.as_str()]
                } else {
                    vec![
                        "settings",
                        "--user",
                        "current",
                        "get",
                        "system",
                        key.as_str(),
                    ]
                };
                let mut command = vec!["-s", target.serial.as_str(), "shell"];
                command.extend(query);
                let verified = command::run(&target.adb, &command, rx.clone(), 3, 8192)
                    .await
                    .ok()
                    .and_then(|(out, _)| {
                        if out.status != "success" {
                            return None;
                        }
                        if matches!(key.as_str(), "size" | "density") {
                            wm_value(out.stdout.trim(), &key).ok().map(|v| v.1)
                        } else {
                            Some(out.stdout.trim().into())
                        }
                    });
                if verified.as_deref() == Some(value.as_str()) {
                    record.values.remove(&key);
                } else {
                    errors.push(format!("{key} 回读未确认"));
                }
            }
            _ => {
                errors.push(format!("{key} 恢复失败"));
                break;
            }
        }
    }
    save(target, &record).await?;
    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "{}；已保留恢复记录，下次连接同一设备可重试",
            errors.join("；")
        ))
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Screen {
    size: Option<String>,
    density: Option<String>,
    rotation: Option<u8>,
    locked: Option<bool>,
    pointer: Option<bool>,
    pending_restore: bool,
}
async fn screen(target: &Target) -> Result<Screen> {
    let size = target
        .shell(&["wm", "size"])
        .await
        .ok()
        .and_then(|s| wm_value(&s, "size").ok())
        .map(|v| v.0);
    let density = target
        .shell(&["wm", "density"])
        .await
        .ok()
        .and_then(|s| wm_value(&s, "density").ok())
        .map(|v| v.0);
    let rotation = original(target, "user_rotation")
        .await
        .ok()
        .and_then(|v| v.parse().ok());
    let locked = original(target, "accelerometer_rotation")
        .await
        .ok()
        .and_then(|v| match v.as_str() {
            "0" => Some(true),
            "1" => Some(false),
            _ => None,
        });
    let pointer = original(target, "pointer_location")
        .await
        .ok()
        .and_then(|v| match v.as_str() {
            "0" | "null" => Some(false),
            "1" => Some(true),
            _ => None,
        });
    Ok(Screen {
        size,
        density,
        rotation,
        locked,
        pointer,
        pending_restore: !journal(target).await?.values.is_empty(),
    })
}
#[tauri::command]
pub async fn read_screen(
    state: tauri::State<'_, WorkbenchState>,
    target_id: u32,
) -> Result<Screen> {
    let target = state.target(target_id).await?;
    let _guard = target.actions.lock().await;
    screen(&target).await
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ScreenChange {
    Size { width: u32, height: u32 },
    Density { dpi: u32 },
    Rotation { rotation: u8, locked: bool },
    Pointer { enabled: bool },
    Reset,
    ResetSize,
    ResetDensity,
    RestoreRotation,
    Restore,
}
fn changes(change: ScreenChange) -> Result<Vec<(String, String)>> {
    Ok(match change {
        ScreenChange::Size { width, height }
            if (200..=7680).contains(&width) && (200..=7680).contains(&height) =>
        {
            vec![("size".into(), format!("{width}x{height}"))]
        }
        ScreenChange::Density { dpi } if (72..=1000).contains(&dpi) => {
            vec![("density".into(), dpi.to_string())]
        }
        ScreenChange::Rotation { rotation, locked } if rotation <= 3 => vec![
            ("user_rotation".into(), rotation.to_string()),
            (
                "accelerometer_rotation".into(),
                if locked { "0" } else { "1" }.into(),
            ),
        ],
        ScreenChange::Pointer { enabled } => vec![(
            "pointer_location".into(),
            if enabled { "1" } else { "0" }.into(),
        )],
        ScreenChange::Reset => vec![
            ("size".into(), "reset".into()),
            ("density".into(), "reset".into()),
        ],
        ScreenChange::ResetSize => vec![("size".into(), "reset".into())],
        ScreenChange::ResetDensity => vec![("density".into(), "reset".into())],
        _ => return Err("参数超出允许范围".into()),
    })
}
#[tauri::command]
pub async fn change_screen(
    state: tauri::State<'_, WorkbenchState>,
    target_id: u32,
    change: ScreenChange,
) -> Result<Screen> {
    let target = state.target(target_id).await?;
    let _guard = target.actions.lock().await;
    target.check()?;
    if matches!(change, ScreenChange::Restore) {
        restore(&target).await?;
        return screen(&target).await;
    }
    if matches!(change, ScreenChange::RestoreRotation) {
        restore_keys(&target, Some(&["user_rotation", "accelerometer_rotation"])).await?;
        return screen(&target).await;
    }
    let updates = changes(change)?;
    let mut record = journal(&target).await?;
    for (key, _) in &updates {
        if !record.values.contains_key(key) {
            record
                .values
                .insert(key.clone(), original(&target, key).await?);
        }
    }
    save(&target, &record).await?;
    let mut applied = Vec::new();
    for (key, value) in updates {
        let args = setting_args(&key, &value);
        target
            .shell(&args.iter().map(String::as_str).collect::<Vec<_>>())
            .await
            .map_err(|e| format!("已完成 {:?}；{key} 失败：{e}。恢复记录已保留", applied))?;
        if original(&target, &key).await? != value {
            return Err(format!(
                "{key} 已发送，但回读未确认；已完成 {:?}，请刷新或恢复本次修改",
                applied
            ));
        }
        applied.push(key);
    }
    screen(&target).await
}
fn viewport(output: &str) -> Result<(u32, u32)> {
    for line in output.lines().filter(|line| line.contains("displayId=0,")) {
        if let Some(tail) = line.split("logicalFrame=[").nth(1) {
            let values: Vec<u32> = tail
                .split(']')
                .next()
                .unwrap_or("")
                .split(',')
                .filter_map(|v| v.trim().parse().ok())
                .collect();
            if values.len() == 4 && values[2] > values[0] && values[3] > values[1] {
                return Ok((values[2] - values[0], values[3] - values[1]));
            }
        }
    }
    Err("无法读取当前显示区域，已停止发送手势".into())
}
fn gesture(name: &str, width: u32, height: u32) -> Result<[u32; 5]> {
    let w = width as f64;
    let h = height as f64;
    let (x1, y1, x2, y2, ms) = match name {
        "homeSwipe" => (w * 0.5, h * 0.97, w * 0.5, h * 0.45, 250),
        "shortSwipe" => (w * 0.5, h * 0.65, w * 0.5, h * 0.50, 200),
        "mediumSwipe" => (w * 0.5, h * 0.80, w * 0.5, h * 0.35, 300),
        "longSwipe" => (w * 0.5, h * 0.90, w * 0.5, h * 0.15, 150),
        "topSwipe" => (w * 0.5, h * 0.03, w * 0.5, h * 0.55, 250),
        "shortSwipeDown" => (w * 0.5, h * 0.50, w * 0.5, h * 0.65, 200),
        "mediumSwipeDown" => (w * 0.5, h * 0.35, w * 0.5, h * 0.80, 300),
        "longSwipeDown" => (w * 0.5, h * 0.15, w * 0.5, h * 0.90, 150),
        "leftBack" => (w * 0.01, h * 0.5, w * 0.35, h * 0.5, 250),
        "rightBack" => (w * 0.99, h * 0.5, w * 0.65, h * 0.5, 250),
        _ => return Err("未知手势".into()),
    };
    Ok([x1 as u32, y1 as u32, x2 as u32, y2 as u32, ms])
}
#[tauri::command]
pub async fn quick_action(
    state: tauri::State<'_, WorkbenchState>,
    target_id: u32,
    action: String,
) -> Result<String> {
    let target = state.target(target_id).await?;
    let _guard = target.actions.lock().await;
    target.check()?;
    let key = match action.as_str() {
        "wake" => Some("224"),
        "sleep" => Some("223"),
        "power" => Some("26"),
        "home" => Some("3"),
        "recent" => Some("187"),
        "back" => Some("4"),
        "volumeUp" => Some("24"),
        "volumeDown" => Some("25"),
        "muteDevice" => Some("164"),
        _ => None,
    };
    if let Some(key) = key {
        target.shell(&["input", "keyevent", key]).await?;
    } else {
        match action.as_str() {
            "powerLong" => {
                target
                    .shell(&["input", "keyevent", "--longpress", "26"])
                    .await?;
            }
            "notifications" => {
                target
                    .shell(&["cmd", "statusbar", "expand-notifications"])
                    .await?;
            }
            "backThree" => {
                for _ in 0..3 {
                    target.shell(&["input", "keyevent", "4"]).await?;
                    tokio::time::sleep(std::time::Duration::from_millis(120)).await;
                }
            }
            "reboot" => {
                restore(&target).await?;
                let (out, _) = command::run(
                    &target.adb,
                    &["-s", &target.serial, "reboot"],
                    target.cancel.subscribe(),
                    10,
                    8192,
                )
                .await?;
                if out.status != "success" {
                    return Err(format!("重启请求失败：{}", out.stderr));
                }
                return Ok("重启请求已发送，设备将暂时断开连接".into());
            }
            name => {
                let (w, h) = viewport(&target.shell(&["dumpsys", "input"]).await?)?;
                let points = gesture(name, w, h)?;
                let values = points.map(|v| v.to_string());
                target
                    .shell(&[
                        "input", "swipe", &values[0], &values[1], &values[2], &values[3],
                        &values[4],
                    ])
                    .await?;
            }
        }
    }
    Ok("命令执行完成，请以设备实际响应为准".into())
}
#[tauri::command]
pub async fn run_terminal(
    state: tauri::State<'_, WorkbenchState>,
    target_id: u32,
    command: String,
) -> Result<Output> {
    if command.trim().is_empty() || command.len() > 8192 || command.contains('\0') {
        return Err("命令不能为空，且不能超过 8192 字节或包含空字符".into());
    }
    let target = state.target(target_id).await?;
    let (cancel, rx) = watch::channel(false);
    {
        let mut slot = target.terminal.lock().await;
        target.check()?;
        if slot.is_some() {
            return Err("已有命令正在运行".into());
        }
        *slot = Some(cancel);
    }
    let result = command::run(
        &target.adb,
        &["-s", &target.serial, "shell", &command],
        rx,
        30,
        256 * 1024,
    )
    .await;
    *target.terminal.lock().await = None;
    result.map(|v| v.0)
}
#[tauri::command]
pub async fn cancel_terminal(
    state: tauri::State<'_, WorkbenchState>,
    target_id: u32,
) -> Result<()> {
    let target = state.target(target_id).await?;
    if let Some(cancel) = target.terminal.lock().await.as_ref() {
        cancel.send_replace(true);
    }
    Ok(())
}
#[tauri::command]
pub async fn save_screenshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkbenchState>,
    target_id: u32,
) -> Result<Option<String>> {
    let target = state.target(target_id).await?;
    // The dialog callback does not hold an action lock or block the main thread.
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("PNG image", &["png"])
        .set_file_name("android-screenshot.png")
        .save_file(move |path| {
            let _ = sender.send(path);
        });
    let Some(path) = receiver.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    let _guard = target.actions.lock().await;
    target.check()?;
    let (out, bytes) = command::run(
        &target.adb,
        &["-s", &target.serial, "exec-out", "screencap", "-p"],
        target.cancel.subscribe(),
        15,
        32 * 1024 * 1024,
    )
    .await?;
    if out.status != "success" || out.truncated || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err(format!("截图失败或数据不完整：{}", out.stderr));
    }
    target.check()?;
    tokio::fs::write(&path, bytes)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    #[tokio::test]
    async fn restoration_survives_cancel_and_retains_failed_entries() {
        use std::os::unix::fs::PermissionsExt;
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let folder = std::env::temp_dir().join(format!("rdb-restore-test-{nonce}"));
        std::fs::create_dir_all(&folder).unwrap();
        let binary = folder.join("adb");
        std::fs::write(&binary, "#!/bin/sh\n[ \"$4\" = wm ] && [ \"$5\" = density ] || exit 1\nif [ \"$#\" = 6 ]; then [ \"$6\" = reset ]; else echo 'Physical density: 420'; fi\n").unwrap();
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700)).unwrap();
        let (cancel, _) = watch::channel(true);
        let target = Target {
            id: 1,
            serial: "test".into(),
            adb: Adb(binary.to_string_lossy().into()),
            journal: folder.join("restore.json"),
            cancel,
            actions: Mutex::new(()),
            terminal: Mutex::new(None),
        };
        let mut record = Journal::default();
        record.values.insert("density".into(), "reset".into());
        save(&target, &record).await.unwrap();
        restore(&target).await.unwrap();
        assert!(journal(&target).await.unwrap().values.is_empty());
        record.values.insert("size".into(), "720x1600".into());
        save(&target, &record).await.unwrap();
        assert!(restore(&target).await.is_err());
        assert_eq!(
            journal(&target).await.unwrap().values.get("size").unwrap(),
            "720x1600"
        );
        std::fs::remove_dir_all(folder).unwrap();
    }
    #[test]
    fn parameters_and_geometry_are_validated() {
        assert!(
            changes(ScreenChange::Size {
                width: 0,
                height: 1280
            })
            .is_err()
        );
        assert!(changes(ScreenChange::Density { dpi: 5000 }).is_err());
        assert_eq!(
            wm_value("Physical size: 1080x2400\nOverride size: 720x1600", "size").unwrap(),
            ("720x1600".into(), "720x1600".into())
        );
        assert_eq!(
            wm_value("Physical density: 420", "density").unwrap().1,
            "reset"
        );
        assert_eq!(
            viewport(
                "Viewport INTERNAL: displayId=0, orientation=1, logicalFrame=[0, 0, 2424, 1080]"
            )
            .unwrap(),
            (2424, 1080)
        );
        assert!(viewport("unknown display").is_err());
        assert_eq!(
            gesture("leftBack", 1000, 2000).unwrap(),
            [10, 1000, 350, 1000, 250]
        );
        assert_eq!(
            setting_args("pointer_location", "null"),
            vec![
                "settings",
                "--user",
                "current",
                "delete",
                "system",
                "pointer_location"
            ]
        );
    }
}
