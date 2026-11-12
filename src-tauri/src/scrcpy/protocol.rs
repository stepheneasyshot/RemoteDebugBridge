use tokio::io::{AsyncRead, AsyncReadExt};

pub const H264: u32 = 0x6832_3634;
pub const PCM: u32 = 0x0072_6177;
pub const MAX_PACKET: usize = 2 * 1024 * 1024;

/// Keep the original v5.0.1 header on IPC; a session record has NO payload.
pub async fn read_packet(
    reader: &mut (impl AsyncRead + Unpin),
    video: bool,
) -> Result<Vec<u8>, String> {
    let mut header = [0u8; 12];
    reader
        .read_exact(&mut header)
        .await
        .map_err(|e| format!("媒体连接已关闭：{e}"))?;
    if header[0] & 0x80 != 0 {
        if !video {
            return Err("音频流包含无效 session 记录".into());
        }
        let width = u32::from_be_bytes(header[4..8].try_into().unwrap());
        let height = u32::from_be_bytes(header[8..12].try_into().unwrap());
        if width == 0 || height == 0 || width > u16::MAX as u32 || height > u16::MAX as u32 {
            return Err("无效的视频尺寸".into());
        }
        return Ok(header.to_vec());
    }
    let length = u32::from_be_bytes(header[8..12].try_into().unwrap()) as usize;
    if length == 0 || length > MAX_PACKET || (!video && length % 4 != 0) {
        return Err(format!("无效的媒体包大小：{length}"));
    }
    let mut packet = vec![0; 12 + length];
    packet[..12].copy_from_slice(&header);
    reader
        .read_exact(&mut packet[12..])
        .await
        .map_err(|e| format!("媒体包不完整：{e}"))?;
    Ok(packet)
}

pub fn touch(action: u8, x: u32, y: u32, width: u16, height: u16) -> Result<Vec<u8>, String> {
    if !matches!(action, 0..=3)
        || width == 0
        || height == 0
        || x >= width as u32
        || y >= height as u32
    {
        return Err("无效的触控位置或动作".into());
    }
    let mut bytes = vec![0; 32];
    bytes[0] = 2;
    bytes[1] = action;
    bytes[2..10].copy_from_slice(&(-2i64).to_be_bytes()); // Generic finger, not mouse.
    bytes[10..14].copy_from_slice(&x.to_be_bytes());
    bytes[14..18].copy_from_slice(&y.to_be_bytes());
    bytes[18..20].copy_from_slice(&width.to_be_bytes());
    bytes[20..22].copy_from_slice(&height.to_be_bytes());
    if action == 0 || action == 2 {
        bytes[22..24].copy_from_slice(&u16::MAX.to_be_bytes());
    }
    Ok(bytes)
}

pub fn key(keycode: u32) -> Result<Vec<u8>, String> {
    if !matches!(keycode, 3 | 4 | 24 | 25 | 187) {
        return Err("不支持的按键".into());
    }
    let mut bytes = vec![0; 28];
    bytes[2..6].copy_from_slice(&keycode.to_be_bytes());
    bytes[15] = 1;
    bytes[16..20].copy_from_slice(&keycode.to_be_bytes());
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncWriteExt;

    #[tokio::test]
    async fn fragmented_session_does_not_consume_next_frame() {
        let session = [0x80, 0, 0, 0, 0, 0, 2, 0xd0, 0, 0, 5, 0];
        let frame = [0x20, 0, 0, 0, 0, 0, 0, 42, 0, 0, 0, 4, 0, 0, 0, 1];
        let (mut writer, mut reader) = tokio::io::duplex(3);
        let task = tokio::spawn(async move {
            writer.write_all(&session).await.unwrap();
            writer.write_all(&frame).await.unwrap();
        });
        assert_eq!(read_packet(&mut reader, true).await.unwrap(), session);
        assert_eq!(read_packet(&mut reader, true).await.unwrap(), frame);
        task.await.unwrap();
    }

    #[tokio::test]
    async fn rejects_oversized_truncated_and_invalid_audio_packets() {
        let too_large = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0];
        assert!(read_packet(&mut &too_large[..], true).await.is_err());
        let truncated = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 1];
        assert!(read_packet(&mut &truncated[..], true).await.is_err());
        let unaligned = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 3, 1, 2, 3];
        assert!(read_packet(&mut &unaligned[..], false).await.is_err());
    }

    #[test]
    fn touch_uses_network_order_and_rejects_letterbox_coordinates() {
        let bytes = touch(0, 100, 200, 720, 1280).unwrap();
        assert_eq!(&bytes[18..24], &[2, 0xd0, 5, 0, 0xff, 0xff]);
        assert_eq!(&bytes[2..10], &(-2i64).to_be_bytes());
        assert!(touch(0, 720, 0, 720, 1280).is_err());
        assert_eq!(&touch(1, 1, 1, 720, 1280).unwrap()[22..24], &[0, 0]);
    }
}
