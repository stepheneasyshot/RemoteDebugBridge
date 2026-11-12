import { acknowledge, listDevices, sendInput, startMirror, stopMirror, type Input, type Status } from "./bridge";
import { MediaPlayer } from "./media";
import "./styles.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header><div><span class="logo">R</span><strong>Remote Debug Bridge</strong><span class="badge">设备投屏</span></div><span id="state" role="status">未连接</span></header>
<main><aside><h1>连接设备</h1><p class="hint">选择已授权的 Android 设备，在右侧观看画面并直接操作。</p>
<label for="adb-path">ADB 路径</label><input id="adb-path" placeholder="留空使用 PATH 中的 adb" spellcheck="false" />
<div class="label-row"><label for="devices">目标设备</label><button id="refresh" class="text">刷新</button></div>
<select id="devices"><option value="">正在检测…</option></select>
<div class="actions"><button id="start" class="primary" disabled>开始投屏</button><button id="stop" disabled>停止</button></div>
<p id="device-help" class="hint">请开启 USB 调试，并在手机上确认授权。</p>
<section><h2>设备控制</h2><div class="key-grid"><button data-key="4" disabled>返回</button><button data-key="3" disabled>桌面</button><button data-key="187" disabled>最近任务</button><button data-key="25" disabled>音量 −</button><button data-key="24" disabled>音量 +</button></div><p class="hint">点击画面模拟触摸，按住拖动模拟滑动。</p></section>
<section><h2>声音</h2><label class="check"><input type="checkbox" id="mute" /> 静音</label><input type="range" id="volume" min="0" max="100" value="80" aria-label="播放音量" /><p id="audio-state" class="hint">尚未接收音频</p></section>
<section><h2>运行状态</h2><dl><dt>画面尺寸</dt><dd id="dimensions">—</dd><dt>已显示帧</dt><dd id="frames">0</dd><dt>显示帧率</dt><dd id="fps">—</dd><dt>音频缓冲</dt><dd id="audio-buffer">—</dd><dt>解码队列</dt><dd id="decode-queue">0</dd></dl></section></aside>
<article><div class="viewer-bar"><div><span class="dot"></span><span id="device-name">等待设备</span></div><button id="fullscreen">全屏</button></div>
<div id="viewport"><canvas id="screen" width="720" height="1280" aria-label="设备实时画面" tabindex="0"></canvas><div id="placeholder"><span class="screen-icon">▱</span><h2>画面将在这里显示</h2><p>连接设备后点击“开始投屏”</p></div></div>
<footer><span id="stream-info">画面和声音将在当前窗口播放</span><span>USB / 无线 ADB</span></footer><pre id="message" role="log" aria-live="polite">正在检测本地环境…</pre></article></main>`;

function element<T extends HTMLElement>(id: string) { return document.getElementById(id) as T; }
const adb = element<HTMLInputElement>("adb-path");
const devices = element<HTMLSelectElement>("devices");
const start = element<HTMLButtonElement>("start");
const stop = element<HTMLButtonElement>("stop");
const refresh = element<HTMLButtonElement>("refresh");
const canvas = element<HTMLCanvasElement>("screen");
const placeholder = element<HTMLDivElement>("placeholder");
const mute = element<HTMLInputElement>("mute");
const volume = element<HTMLInputElement>("volume");
const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-key]")];
const message = element<HTMLPreElement>("message");
let player: MediaPlayer | null = null;
let sessionId: number | undefined;
let generation = 0;
let busy = false;
let connected = false;
let stopping = false;
let videoAck = 0;
let audioAck = 0;
let ackPending = false;
let lastFrames = 0;
let pointer: number | null = null;
let lastPoint = { x: 0, y: 0 };
let move: Input | null = null;
let moveFrame = 0;
let inputChain = Promise.resolve();
let pendingInputs = 0;
let inputError = false;
try { adb.value = localStorage.getItem("adb-path") ?? ""; } catch { /* Optional storage. */ }
function log(value: unknown) { message.textContent = String(value); }
function state(value: string) { element("state").textContent = value; }
function controls() {
  start.disabled = busy || !devices.value;
  stop.disabled = !busy || stopping;
  refresh.disabled = busy;
  devices.disabled = busy;
  adb.disabled = busy;
  buttons.forEach((button) => { button.disabled = !connected || stopping; });
}
async function discover() {
  refresh.disabled = start.disabled = true;
  try {
    const selected = devices.value;
    const found = await listDevices(adb.value);
    devices.replaceChildren(new Option("请选择设备", ""));
    for (const device of found) {
      const option = new Option(`${device.model} · ${device.state}`, device.serial);
      option.disabled = device.state !== "device";
      devices.add(option);
    }
    const online = found.filter((device) => device.state === "device");
    if (online.some((device) => device.serial === selected)) devices.value = selected;
    else if (online.length === 1) devices.value = online[0].serial;
    element("device-help").textContent = online.length ? `已发现 ${online.length} 台可用设备` : "未发现已授权设备，请连接手机并确认 USB 调试授权。";
    log(found.length ? "设备列表已更新。" : "ADB 可用，暂未发现设备。");
  } catch (error) { devices.replaceChildren(new Option("检测失败", "")); log(error); }
  finally { refresh.disabled = false; controls(); }
}
async function end(error?: unknown) {
  if (stopping) return;
  releasePointer();
  stopping = true;
  connected = false;
  controls();
  const id = sessionId;
  // Deliver the release before invalidating this session's queued input.
  await inputChain;
  generation++;
  player?.close();
  player = null;
  placeholder.hidden = false;
  state(error ? "投屏出错" : "正在停止…");
  try { await stopMirror(id); } catch (stopError) { log(stopError); }
  finally {
    sessionId = undefined;
    busy = stopping = false;
    state(error ? "投屏出错" : "已停止");
    element("audio-state").textContent = "音频已停止";
    controls();
    if (error) log(error);
  }
}
function onStatus(status: Status, current: number) {
  if (current !== generation) return;
  sessionId = status.sessionId;
  if (status.kind === "connected") {
    element("device-name").textContent = status.message;
    state("等待首帧…");
    log("设备已连接，正在接收音视频。");
  } else if (status.kind === "audio_ready") element("audio-state").textContent = "设备音频已连接";
  else if (status.kind === "audio_unavailable") player?.disableAudio(status.message);
  else if (status.kind === "error") void end(status.message);
  else if (status.kind === "stopped") void end();
  else log(status.message);
}
start.addEventListener("click", async () => {
  if (busy || !devices.value) return;
  busy = true;
  inputError = false;
  inputChain = Promise.resolve();
  pendingInputs = 0;
  controls();
  state("正在连接…");
  videoAck = audioAck = lastFrames = 0;
  const current = ++generation;
  try {
    try { localStorage.setItem("adb-path", adb.value); } catch { /* Optional setting. */ }
    const media = new MediaPlayer(canvas, (error) => { if (current === generation) void end(error); },
      (notice) => { if (current === generation) element("audio-state").textContent = notice; });
    player = media;
    await media.prepare();
    if (current !== generation) { media.close(); return; }
    media.setVolume(mute.checked ? 0 : Number(volume.value) / 100);
    const id = await startMirror(adb.value, devices.value, {
      video: (packet) => { if (current === generation) media.video(packet, (seq) => { if (current === generation) videoAck = seq; }); },
      audio: (packet) => { if (current === generation) media.audio(packet, (seq) => { if (current === generation) audioAck = seq; }); },
      status: (status) => onStatus(status, current),
    });
    if (current !== generation) { await stopMirror(id); return; }
    sessionId = id;
  } catch (error) { if (current === generation) await end(error); }
});
setInterval(() => {
  if (sessionId === undefined || !busy || stopping || ackPending) return;
  const current = generation;
  ackPending = true;
  void acknowledge(sessionId, videoAck, audioAck).catch((error) => { if (current === generation && !stopping) void end(error); })
    .finally(() => { ackPending = false; });
}, 40);
setInterval(() => {
  if (!player) return;
  const stats = player.stats;
  element("dimensions").textContent = stats.width ? `${stats.width} × ${stats.height}` : "—";
  element("frames").textContent = String(stats.frames);
  element("fps").textContent = `${stats.frames - lastFrames} fps`;
  lastFrames = stats.frames;
  element("audio-buffer").textContent = stats.audioPackets ? `${stats.audioBufferMs.toFixed(0)} ms` : "—";
  element("decode-queue").textContent = String(stats.decodeQueue);
  element("stream-info").textContent = `丢弃过期画面 ${stats.dropped} · 音频包 ${stats.audioPackets} · 欠载 ${stats.underruns} · 超载 ${stats.overruns} · 电平 ${stats.audioPeak.toFixed(3)}`;
  if (stats.frames > 0 && !connected) { connected = true; state("投屏中"); placeholder.hidden = true; controls(); }
}, 1000);
function enqueue(input: Input) {
  if (sessionId === undefined || !connected || stopping) return;
  if (input.type === "touch" && input.action === 2 && pendingInputs >= 2) return;
  if (pendingInputs >= 32) { void end("输入队列繁忙，请重新连接"); return; }
  const id = sessionId;
  const current = generation;
  pendingInputs++;
  inputChain = inputChain.then(async () => {
    if (current !== generation || inputError) return;
    await sendInput(id, input);
  }).catch((error) => { inputError = true; if (current === generation) void end(error); })
    .finally(() => { if (current === generation) pendingInputs--; });
}
function flushMove() { cancelAnimationFrame(moveFrame); if (move) { enqueue(move); move = null; } }
function releasePointer() {
  if (pointer === null) return;
  const id = pointer;
  pointer = null;
  flushMove();
  enqueue({ type: "touch", action: 1, x: Math.min(lastPoint.x, canvas.width - 1), y: Math.min(lastPoint.y, canvas.height - 1), width: canvas.width, height: canvas.height });
  if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
}
function point(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - rect.left) / rect.width * canvas.width))),
    y: Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - rect.top) / rect.height * canvas.height))) };
}
canvas.addEventListener("pointerdown", (event) => {
  if (!connected || pointer !== null || event.button !== 0) return;
  event.preventDefault(); canvas.focus(); pointer = event.pointerId; lastPoint = point(event); canvas.setPointerCapture(pointer);
  enqueue({ type: "touch", action: 0, ...lastPoint, width: canvas.width, height: canvas.height });
});
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== pointer) return;
  lastPoint = point(event);
  move = { type: "touch", action: 2, ...lastPoint, width: canvas.width, height: canvas.height };
  cancelAnimationFrame(moveFrame); moveFrame = requestAnimationFrame(flushMove);
});
canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
canvas.addEventListener("lostpointercapture", releasePointer);
window.addEventListener("blur", releasePointer);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("keydown", (event) => {
  const keycode = ({ Escape: 4, Home: 3, PageUp: 24, PageDown: 25 } as Record<string, number>)[event.key];
  if (keycode) { event.preventDefault(); enqueue({ type: "key", keycode }); }
});
buttons.forEach((button) => button.addEventListener("click", () => enqueue({ type: "key", keycode: Number(button.dataset.key) })));
refresh.addEventListener("click", () => void discover()); devices.addEventListener("change", controls);
stop.addEventListener("click", () => void end());
const updateVolume = () => player?.setVolume(mute.checked ? 0 : Number(volume.value) / 100);
mute.addEventListener("change", updateVolume); volume.addEventListener("input", updateVolume);
element("fullscreen").addEventListener("click", () => {
  void (document.fullscreenElement ? document.exitFullscreen() : element("viewport").requestFullscreen()).catch(log);
});
window.addEventListener("pagehide", () => { player?.close(); void stopMirror(sessionId); });
// A reload must not strand the old webview's native session.
void stopMirror().then(discover).catch(log);
