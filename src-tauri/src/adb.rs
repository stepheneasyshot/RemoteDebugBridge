use serde::Serialize;
use std::{process::Stdio, time::Duration};
use tokio::{process::Command, time::timeout};

#[derive(Clone)]
pub struct Adb(pub String);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub serial: String,
    pub state: String,
    pub model: String,
}

impl Adb {
    pub fn new(path: String) -> Self {
        Self(if path.trim().is_empty() {
            "adb".into()
        } else {
            path
        })
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
            let model = fields
                .find_map(|field| field.strip_prefix("model:"))
                .unwrap_or(serial)
                .replace('_', " ");
            Some(Device {
                serial: serial.into(),
                state: state.into(),
                model,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
