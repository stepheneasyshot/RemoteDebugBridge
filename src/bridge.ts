import { Channel, invoke } from "@tauri-apps/api/core";

export interface Device { serial: string; model: string; state: string; transport: "usb" | "wireless" | "emulator" | "unknown" }
export interface Environment { available: boolean; path: string; version: string | null; daemonReady: boolean; error: string | null }
export interface DeviceDetails { android: string | null; api: number | null; resolution: string | null; density: number | null;
  battery: number | null; charging: boolean | null; temperature: number | null; memoryMb: number | null }
export interface Status { sessionId: number; kind: string; message: string }
export interface ScreenSettings { size: string | null; density: string | null; rotation: number | null; locked: boolean | null; pointer: boolean | null; pendingRestore: boolean }
export type ScreenChange = { type: "size"; width: number; height: number } | { type: "density"; dpi: number } | { type: "rotation"; rotation: number; locked: boolean } | { type: "pointer"; enabled: boolean } | { type: "reset" | "resetSize" | "resetDensity" | "restoreRotation" | "restore" };
export interface CommandOutput { stdout: string; stderr: string; exitCode: number | null; durationMs: number; status: string; truncated: boolean }
export const setWorkbenchTarget = (adbPath: string, serial?: string) => invoke<{ id: number | null; warning: string | null }>("set_workbench_target", { adbPath, serial });
export const readScreen = (targetId: number) => invoke<ScreenSettings>("read_screen", { targetId });
export const changeScreen = (targetId: number, change: ScreenChange) => invoke<ScreenSettings>("change_screen", { targetId, change });
export const quickAction = (targetId: number, action: string) => invoke<string>("quick_action", { targetId, action });
export const runTerminal = (targetId: number, command: string) => invoke<CommandOutput>("run_terminal", { targetId, command });
export const cancelTerminal = (targetId: number) => invoke<void>("cancel_terminal", { targetId });
export const saveScreenshot = (targetId: number) => invoke<string | null>("save_screenshot", { targetId });
export type Input = { type: "touch"; action: number; x: number; y: number; width: number; height: number }
  | { type: "key"; keycode: number };

export const listDevices = (adbPath: string) => invoke<Device[]>("list_devices", { adbPath });
export const checkEnvironment = (adbPath: string) => invoke<Environment>("check_environment", { adbPath });
export const restartAdb = (adbPath: string) => invoke<void>("restart_adb", { adbPath });
export const deviceDetails = (adbPath: string, serial: string) => invoke<DeviceDetails>("device_details", { adbPath, serial });
export const connectWireless = (adbPath: string, host: string, port: number) => invoke<string>("connect_wireless", { adbPath, host, port });
export const pairWireless = (adbPath: string, host: string, port: number, code: string) => invoke<void>("pair_wireless", { adbPath, host, port, code });
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
