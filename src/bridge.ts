import { Channel, invoke } from "@tauri-apps/api/core";

export interface Device { serial: string; model: string; state: string }
export interface Status { sessionId: number; kind: string; message: string }
export type Input = { type: "touch"; action: number; x: number; y: number; width: number; height: number }
  | { type: "key"; keycode: number };

export const listDevices = (adbPath: string) => invoke<Device[]>("list_devices", { adbPath });
export const stopMirror = (sessionId?: number) => invoke<void>("stop_mirror", { sessionId });
export const sendInput = (sessionId: number, input: Input) => invoke<void>("send_input", { sessionId, input });
export const acknowledge = (sessionId: number, video: number, audio: number) =>
  invoke<void>("acknowledge_media", { sessionId, video, audio });

export function startMirror(adbPath: string, serial: string, callbacks: {
  video: (packet: ArrayBuffer) => void;
  audio: (packet: ArrayBuffer) => void;
  status: (status: Status) => void;
}) {
  return invoke<number>("start_mirror", {
    adbPath, serial,
    video: new Channel<ArrayBuffer>(callbacks.video),
    audio: new Channel<ArrayBuffer>(callbacks.audio),
    status: new Channel<Status>(callbacks.status),
  });
}
