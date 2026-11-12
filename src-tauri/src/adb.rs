use serde::Serialize;
use std::{
    net::{IpAddr, SocketAddr},
    process::Stdio,
    sync::OnceLock,
    time::Duration,
};
use tauri::Manager;
use tokio::{io::AsyncWriteExt, process::Command, time::timeout};

static BUNDLED_ADB: OnceLock<String> = OnceLock::new();

pub fn initialize(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let resource = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64" | "x86_64") => "resources/adb/macos/adb",
        ("linux", "x86_64") => "resources/adb/linux/adb",
        ("windows", "x86_64") => "resources/adb/windows/adb.exe",
        _ => return Err("当前系统或 CPU 架构尚无内置 ADB".into()),
    };
    let path = app.path().resolve(resource, tauri::path::BaseDirectory::Resource)?;
    BUNDLED_ADB
        .set(path.to_string_lossy().into_owned())
        .map_err(|_| "内置 ADB 已初始化")?;
    Ok(())
}

#[derive(Clone)]
pub struct Adb(pub String);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub serial: String,
    pub state: String,
    pub model: String,
    pub transport: String,
}

impl Adb {
    // Keep the existing IPC argument compatible, but never execute a caller-supplied
    // path in the application. Only unit tests may inject a fake executable.
    pub fn new(_legacy_path: String) -> Self {
        #[cfg(test)]
        if !_legacy_path.is_empty() {
            return Self(_legacy_path);
        }
        Self(
            BUNDLED_ADB
                .get()
                .expect("ADB initialized during Tauri setup")
                .clone(),
        )
    }

    pub fn command(&self) -> Command {
        let mut command = Command::new(&self.0);
        command.kill_on_drop(true).stdin(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        command
    }

    pub async fn run(&self, args: &[&str]) -> Result<String, String> {
        let output = timeout(Duration::from_secs(15), self.command().args(args).output())
            .await
            .map_err(|_| "ADB 操作超时（15 秒）".to_string())?
            .map_err(|e| format!("无法执行 ADB（{}）：{e}", self.0))?;
        if !output.status.success() {
            return Err(format!(
                "ADB 执行失败：{}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
    }

    pub async fn devices(&self) -> Result<Vec<Device>, String> {
        Ok(parse_devices(&self.run(&["devices", "-l"]).await?))
    }
}

fn parse_devices(output: &str) -> Vec<Device> {
    output
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let serial = fields.next()?;
            let state = fields.next()?;
            if !matches!(
                state,
                "device" | "offline" | "unauthorized" | "recovery" | "sideload" | "no"
            ) {
                return None;
            }
            let fields: Vec<_> = fields.collect();
            let model = fields
                .iter()
                .find_map(|field| field.strip_prefix("model:"))
                .unwrap_or(serial)
                .replace('_', " ");
            Some(Device {
                serial: serial.into(),
                state: state.into(),
                model,
                transport: if serial.starts_with("emulator-") {
                    "emulator"
                } else if serial.contains(':') || serial.contains("._tcp") {
                    "wireless"
                } else if fields.iter().any(|field| field.starts_with("usb:")) {
                    "usb"
                } else {
                    "unknown"
                }
                .into(),
            })
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    available: bool,
    path: String,
    version: Option<String>,
    daemon_ready: bool,
    error: Option<String>,
}

#[tauri::command]
pub async fn check_environment(adb_path: String) -> Environment {
    let adb = Adb::new(adb_path);
    match adb.run(&["version"]).await {
        Ok(version) => {
            let path = version
                .lines()
                .find_map(|line| line.strip_prefix("Installed as "))
                .unwrap_or(&adb.0)
                .to_string();
            let server = adb.run(&["start-server"]).await;
            Environment {
                available: true,
                path,
                version: Some(version),
                daemon_ready: server.is_ok(),
                error: server.err(),
            }
        }
        Err(error) => Environment {
            available: false,
            path: adb.0,
            version: None,
            daemon_ready: false,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub async fn restart_adb(
    adb_path: String,
    state: tauri::State<'_, crate::scrcpy::MirrorState>,
) -> Result<(), String> {
    state.stop(None).await?;
    let adb = Adb::new(adb_path);
    adb.run(&["kill-server"]).await?;
    adb.run(&["start-server"]).await?;
    Ok(())
}

fn endpoint(host: &str, port: u16) -> Result<String, String> {
    if port == 0 {
        return Err("端口必须为 1–65535".into());
    }
    let ip: IpAddr = host
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse()
        .map_err(|_| "请输入有效的 IPv4 或 IPv6 地址".to_string())?;
    Ok(SocketAddr::new(ip, port).to_string())
}

#[tauri::command]
pub async fn connect_wireless(adb_path: String, host: String, port: u16) -> Result<String, String> {
    let address = endpoint(&host, port)?;
    let adb = Adb::new(adb_path);
    let output = adb.run(&["connect", &address]).await?;
    // `adb connect` may exit 0 even when connection fails. Require a real transport.
    for attempt in 0..3 {
        if adb
            .devices()
            .await?
            .iter()
            .any(|device| device.serial == address && device.state == "device")
        {
            return Ok(address);
        }
        if attempt < 2 {
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
    }
    Err(format!(
        "设备尚未在线，请检查连接端口和手机授权。ADB：{output}"
    ))
}

#[tauri::command]
pub async fn pair_wireless(
    adb_path: String,
    host: String,
    port: u16,
    code: String,
) -> Result<(), String> {
    let address = endpoint(&host, port)?;
    if code.len() != 6 || !code.bytes().all(|c| c.is_ascii_digit()) {
        return Err("配对码必须为 6 位数字".into());
    }
    let adb = Adb::new(adb_path);
    // Keep the pairing code out of argv, history and returned output.
    let result = timeout(Duration::from_secs(30), async {
        let mut child = adb
            .command()
            .args(["pair", &address])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        let mut stdin = child.stdin.take().ok_or("无法写入配对码")?;
        stdin
            .write_all(format!("{code}\n").as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        drop(stdin);
        let output = child.wait_with_output().await.map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        if output.status.success() && stdout.contains("Successfully paired to") {
            Ok(())
        } else {
            Err(format!(
                "配对失败：{} {}",
                stdout.trim(),
                String::from_utf8_lossy(&output.stderr).trim()
            ))
        }
    })
    .await
    .map_err(|_| "配对超时，请重新打开手机上的配对码窗口".to_string())?;
    result.map_err(|error| error.replace(&code, "******"))
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDetails {
    android: Option<String>,
    api: Option<u32>,
    resolution: Option<String>,
    density: Option<u32>,
    battery: Option<f64>,
    charging: Option<bool>,
    temperature: Option<f64>,
    memory_mb: Option<u64>,
}

fn nonempty(value: Result<String, String>) -> Option<String> {
    value.ok().filter(|value| !value.is_empty())
}

fn display_value(output: &str) -> Option<String> {
    output.lines().rev().find_map(|line| {
        line.split_once(": ")
            .map(|(_, value)| value.trim().to_string())
    })
}

fn property<'a>(output: &'a str, name: &str) -> Option<&'a str> {
    output
        .lines()
        .filter_map(|line| line.trim().split_once(':'))
        .find_map(|(key, value)| (key == name).then_some(value.trim()))
}

#[tauri::command]
pub async fn device_details(adb_path: String, serial: String) -> Result<DeviceDetails, String> {
    let adb = Adb::new(adb_path);
    if !adb
        .devices()
        .await?
        .iter()
        .any(|d| d.serial == serial && d.state == "device")
    {
        return Err("设备未在线或未授权，无法读取详情".into());
    }
    let (android, api, size, density, battery, memory) = tokio::join!(
        async {
            adb.run(&[
                "-s",
                &serial,
                "shell",
                "getprop",
                "ro.build.version.release",
            ])
            .await
        },
        async {
            adb.run(&["-s", &serial, "shell", "getprop", "ro.build.version.sdk"])
                .await
        },
        async { adb.run(&["-s", &serial, "shell", "wm", "size"]).await },
        async { adb.run(&["-s", &serial, "shell", "wm", "density"]).await },
        async {
            adb.run(&["-s", &serial, "shell", "dumpsys", "battery"])
                .await
        },
        async {
            adb.run(&["-s", &serial, "shell", "cat", "/proc/meminfo"])
                .await
        },
    );
    let battery = battery.unwrap_or_default();
    let level = property(&battery, "level").and_then(|v| v.parse::<f64>().ok());
    let scale = property(&battery, "scale").and_then(|v| v.parse::<f64>().ok());
    let percentage = level
        .zip(scale)
        .filter(|(level, scale)| *scale > 0.0 && *level >= 0.0 && level <= scale)
        .map(|(level, scale)| level / scale * 100.0);
    Ok(DeviceDetails {
        android: nonempty(android),
        api: nonempty(api).and_then(|v| v.parse().ok()),
        resolution: nonempty(size).and_then(|v| display_value(&v)),
        density: nonempty(density)
            .and_then(|v| display_value(&v))
            .and_then(|v| v.parse().ok()),
        battery: percentage,
        charging: property(&battery, "status")
            .and_then(|v| v.parse::<u8>().ok())
            .filter(|v| (2..=5).contains(v))
            .map(|v| matches!(v, 2 | 5)),
        temperature: property(&battery, "temperature")
            .and_then(|v| v.parse::<f64>().ok())
            .map(|v| v / 10.0),
        memory_mb: nonempty(memory)
            .and_then(|v| {
                property(&v, "MemTotal")
                    .and_then(|value| value.split_whitespace().next())
                    .and_then(|v| v.parse::<u64>().ok())
            })
            .map(|kb| kb / 1024),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    struct FakeAdb(std::path::PathBuf);

    #[cfg(unix)]
    impl FakeAdb {
        fn new(body: &str) -> Self {
            use std::os::unix::fs::PermissionsExt;
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path =
                std::env::temp_dir().join(format!("rdb-adb-test-{}-{nonce}", std::process::id()));
            std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
            Self(path)
        }
        fn path(&self) -> String {
            self.0.to_string_lossy().into_owned()
        }
    }

    #[cfg(unix)]
    impl Drop for FakeAdb {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn connect_requires_online_transport_even_after_success_exit() {
        let offline = FakeAdb::new(
            "case \"$1\" in connect) echo 'connected to 127.0.0.1:5555';; devices) echo '127.0.0.1:5555 offline';; esac",
        );
        assert!(
            connect_wireless(offline.path(), "127.0.0.1".into(), 5555)
                .await
                .is_err()
        );
        let online = FakeAdb::new(
            "case \"$1\" in connect) echo 'connected to 127.0.0.1:5555';; devices) echo '127.0.0.1:5555 device';; esac",
        );
        assert_eq!(
            connect_wireless(online.path(), "127.0.0.1".into(), 5555)
                .await
                .unwrap(),
            "127.0.0.1:5555"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn pairing_code_uses_stdin_and_is_redacted_from_failures() {
        let success = FakeAdb::new(
            "[ \"$#\" = 2 ] || exit 1\nread -r code\n[ \"$code\" = 123456 ] || exit 1\necho 'Successfully paired to 127.0.0.1:37001'",
        );
        assert!(
            pair_wireless(success.path(), "127.0.0.1".into(), 37001, "123456".into())
                .await
                .is_ok()
        );
        let failure = FakeAdb::new("read -r code\necho \"wrong pairing code $code\" >&2\nexit 1");
        let error = pair_wireless(failure.path(), "127.0.0.1".into(), 37001, "123456".into())
            .await
            .unwrap_err();
        assert!(!error.contains("123456"));
        assert!(error.contains("******"));
    }

    #[test]
    fn preserves_unavailable_devices_and_ignores_daemon_messages() {
        let devices = parse_devices(
            "* daemon started successfully\nList of devices attached\na device model:Pixel_9 transport_id:4\nb unauthorized\nc offline\n",
        );
        assert_eq!(devices.len(), 3);
        assert_eq!(devices[0].model, "Pixel 9");
        assert_eq!(devices[1].state, "unauthorized");
        assert_eq!(devices[2].state, "offline");
    }

    #[test]
    fn identifies_transports_and_no_permissions() {
        let devices = parse_devices(
            "usb-device device usb:1-1 model:Pixel_9\n192.168.1.2:38117 device\nadb-serial._adb-tls-connect._tcp device\nemulator-5554 offline\nblocked no permissions\n",
        );
        assert_eq!(
            devices
                .iter()
                .map(|d| d.transport.as_str())
                .collect::<Vec<_>>(),
            ["usb", "wireless", "wireless", "emulator", "unknown"]
        );
        assert_eq!(devices[4].state, "no");
    }

    #[test]
    fn validates_wireless_endpoint_and_display_override() {
        assert_eq!(endpoint("192.168.1.5", 37123).unwrap(), "192.168.1.5:37123");
        assert_eq!(endpoint("::1", 37123).unwrap(), "[::1]:37123");
        assert!(endpoint("127.0.0.1; reboot", 5555).is_err());
        assert!(endpoint("127.0.0.1", 0).is_err());
        assert_eq!(
            display_value("Physical size: 1080x2400\nOverride size: 720x1600"),
            Some("720x1600".into())
        );
        assert_eq!(
            property(
                "Current Battery Service state:\n  level: 82\n  scale: 100",
                "level"
            ),
            Some("82")
        );
    }
}
