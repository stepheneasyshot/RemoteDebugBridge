import { acknowledge, sendInput, startMirror, stopMirror, type Device, type Input, type Status } from "./bridge";
import { MediaPlayer } from "./media";

export function createMirror(onStopped: () => void = () => {}) {
  function element<T extends HTMLElement>(id: string) { return document.getElementById(id) as T; }
  const start = element<HTMLButtonElement>("start");
  const stop = element<HTMLButtonElement>("stop");
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
  let target: Device | undefined;
  let adbPath = "";
  let stopTask: Promise<void> | null = null;
  let cleanupWarnings: string[] = [];
  function log(value: unknown) { message.textContent = String(value); }
  function state(value: string) { element("state").textContent = value; }
  function controls() {
    start.disabled = busy || target?.state !== "device";
    stop.disabled = !busy || stopping;
    buttons.forEach((button) => { button.disabled = !connected || stopping; });
  }
  function end(error?: unknown): Promise<void> {
    if (stopTask) return stopTask;
    stopTask = finish(error).finally(() => { stopTask = null; });
    return stopTask;
  }
  async function finish(error?: unknown) {
    releasePointer();
    stopping = true;
    cleanupWarnings = [];
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
    try { await stopMirror(id); } catch (stopError) { cleanupWarnings.push(String(stopError)); }
    finally {
      sessionId = undefined;
      busy = stopping = false;
      state(error ? "投屏出错" : "已停止");
      element("audio-state").textContent = "音频已停止";
      controls();
      log([error ? String(error) : "投屏已停止", ...cleanupWarnings].join("\n"));
      onStopped();
    }
  }
  function onStatus(status: Status, current: number) {
    if (stopping && status.sessionId === sessionId && status.kind === "warning") {
      cleanupWarnings.push(status.message); return;
    }
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
    if (busy || target?.state !== "device") return;
    const serial = target.serial;
    busy = true;
    inputError = false;
    inputChain = Promise.resolve();
    pendingInputs = 0;
    controls();
    state("正在连接…");
    videoAck = audioAck = lastFrames = 0;
    const current = ++generation;
    try {
      const media = new MediaPlayer(canvas, (error) => { if (current === generation) void end(error); },
        (notice) => { if (current === generation) element("audio-state").textContent = notice; });
      player = media;
      await media.prepare();
      if (current !== generation) { media.close(); return; }
      media.setVolume(mute.checked ? 0 : Number(volume.value) / 100);
      const id = await startMirror(adbPath, serial, {
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
  stop.addEventListener("click", () => void end());
  const updateVolume = () => player?.setVolume(mute.checked ? 0 : Number(volume.value) / 100);
  mute.addEventListener("change", updateVolume); volume.addEventListener("input", updateVolume);
  element("fullscreen").addEventListener("click", () => {
    void (document.fullscreenElement ? document.exitFullscreen() : element("viewport").requestFullscreen()).catch(log);
  });
  const scale = element<HTMLSelectElement>("view-scale");
  const updateScale = () => {
    const fit = scale.value === "fit";
    canvas.style.width = fit ? "auto" : `${canvas.width * Number(scale.value)}px`;
    canvas.style.height = fit ? "auto" : `${canvas.height * Number(scale.value)}px`;
    canvas.style.maxWidth = canvas.style.maxHeight = fit ? "100%" : "none";
    canvas.style.flexShrink = "0";
    element("viewport").classList.toggle("zoomed", !fit);
  };
  scale.addEventListener("change", updateScale);
  new MutationObserver(updateScale).observe(canvas, { attributes: true, attributeFilter: ["width", "height"] });
  window.addEventListener("pagehide", () => { player?.close(); void stopMirror(sessionId); });
  // A reload must not strand the old webview's native session.
  const ready = stopMirror().catch(log);
  return {
    stop: end,
    async setTarget(device: Device | undefined, path: string) {
      await ready;
      if (busy || stopping) await end();
      target = device;
      adbPath = path;
      element("device-name").textContent = device?.model ?? "等待设备";
      controls();
    },
  };

}
