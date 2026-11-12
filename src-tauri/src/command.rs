use crate::adb::Adb;
use serde::Serialize;
use std::{
    process::Stdio,
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    sync::watch,
    time::timeout,
};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u128,
    pub status: String,
    pub truncated: bool,
}
async fn capture(
    mut pipe: impl AsyncRead + Unpin,
    limit: usize,
) -> Result<(Vec<u8>, bool), String> {
    let mut output = Vec::new();
    let mut buffer = [0; 8192];
    let mut truncated = false;
    loop {
        let count = pipe.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if count == 0 {
            return Ok((output, truncated));
        }
        let keep = count.min(limit.saturating_sub(output.len()));
        output.extend_from_slice(&buffer[..keep]);
        truncated |= keep < count;
    }
}
// The host never evaluates a shell command. Only adb receives the remote args.
pub async fn run(
    adb: &Adb,
    args: &[&str],
    mut cancel: watch::Receiver<bool>,
    seconds: u64,
    limit: usize,
) -> Result<(Output, Vec<u8>), String> {
    if *cancel.borrow() {
        return Err("目标会话已结束".into());
    }
    let start = Instant::now();
    let mut child = adb
        .command()
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let out = tokio::spawn(capture(child.stdout.take().unwrap(), limit));
    let err = tokio::spawn(capture(child.stderr.take().unwrap(), limit));
    let (status, exit_code) = tokio::select! {
        biased;
        _ = cancel.changed() => ("cancelled", None),
        _ = tokio::time::sleep(Duration::from_secs(seconds)) => ("timeout", None),
        code = child.wait() => { let code = code.map_err(|e| e.to_string())?; (if code.success() { "success" } else { "failed" }, code.code()) },
    };
    if exit_code.is_none() {
        let _ = child.kill().await;
        let _ = child.wait().await;
    }
    async fn finish(
        mut task: tokio::task::JoinHandle<Result<(Vec<u8>, bool), String>>,
    ) -> (Vec<u8>, bool) {
        match timeout(Duration::from_secs(1), &mut task).await {
            Ok(Ok(Ok(value))) => value,
            _ => {
                task.abort();
                (Vec::new(), true)
            }
        }
    }
    let (stdout, truncated_out) = finish(out).await;
    let (stderr, truncated_err) = finish(err).await;
    Ok((
        Output {
            stdout: String::from_utf8_lossy(&stdout).into_owned(),
            stderr: String::from_utf8_lossy(&stderr).into_owned(),
            exit_code,
            duration_ms: start.elapsed().as_millis(),
            status: status.into(),
            truncated: truncated_out || truncated_err,
        },
        stdout,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn capture_drains_but_bounds_output() {
        let input = vec![42; 20000];
        let (bytes, truncated) = capture(&input[..], 128).await.unwrap();
        assert_eq!(bytes.len(), 128);
        assert!(truncated);
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn handles_exit_timeout_and_cancel() {
        let adb = Adb("/bin/sh".into());
        let (cancel, rx) = watch::channel(false);
        let (output, _) = run(
            &adb,
            &["-c", "printf hello; printf error >&2; exit 7"],
            rx.clone(),
            2,
            100,
        )
        .await
        .unwrap();
        assert_eq!(output.exit_code, Some(7));
        assert_eq!(output.stdout, "hello");
        assert_eq!(output.stderr, "error");
        let (output, _) = run(&adb, &["-c", "exec sleep 5"], rx.clone(), 0, 100)
            .await
            .unwrap();
        assert_eq!(output.status, "timeout");
        let task =
            tokio::spawn(async move { run(&adb, &["-c", "exec sleep 5"], rx, 10, 100).await });
        tokio::time::sleep(Duration::from_millis(30)).await;
        cancel.send_replace(true);
        assert_eq!(task.await.unwrap().unwrap().0.status, "cancelled");
    }
}
