import workletUrl from "./pcm-worklet.ts?worker&url";

export interface MediaStats {
  frames: number; dropped: number; width: number; height: number; audioPackets: number;
  audioPeak: number; audioBufferMs: number; underruns: number; overruns: number; decodeQueue: number;
}

function nalUnits(bytes: Uint8Array): Uint8Array[] {
  const starts: { prefix: number; data: number }[] = [];
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 0 && bytes[i + 1] === 0) {
      if (bytes[i + 2] === 1) { starts.push({ prefix: i, data: i + 3 }); i += 2; }
      else if (bytes[i + 2] === 0 && bytes[i + 3] === 1) { starts.push({ prefix: i, data: i + 4 }); i += 3; }
    }
  }
  return starts.map((start, i) => bytes.slice(start.data, starts[i + 1]?.prefix ?? bytes.length));
}

export class MediaPlayer {
  readonly stats: MediaStats = { frames: 0, dropped: 0, width: 0, height: 0, audioPackets: 0,
    audioPeak: 0, audioBufferMs: 0, underruns: 0, overruns: 0, decodeQueue: 0 };
  private decoder: VideoDecoder | null = null;
  private audioContext: AudioContext | null = null;
  private audioNode: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private config = new Map<number, Uint8Array>();
  private needsKey = true;
  private frames: VideoFrame[] = [];
  private animation = 0;
  private audioClock: { pts: number; at: number } | null = null;
  private audioAcks = new Map<number, (sequence: number) => void>();
  private disposed = false;
  private videoChain = Promise.resolve();
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement,
    private readonly fail: (error: unknown) => void,
    private readonly audioNotice: (message: string) => void) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("此 WebView 不支持 Canvas");
    this.ctx = ctx;
  }

  async prepare(): Promise<void> {
    if (!window.isSecureContext || !("VideoDecoder" in window)) {
      throw new Error("当前 WebView 不支持安全上下文中的 WebCodecs 视频解码");
    }
    // Called directly from the user's click so audio activation is retained.
    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      this.audioContext = context;
      await context.resume();
      await context.audioWorklet.addModule(workletUrl);
      if (this.disposed) { await context.close(); return; }
      const node = new AudioWorkletNode(context, "rdb-pcm", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      this.audioNode = node;
      this.gain = context.createGain();
      node.connect(this.gain).connect(context.destination);
      node.onprocessorerror = () => this.disableAudio("音频处理器异常；视频仍可继续");
      node.port.onmessage = ({ data }) => {
        if (typeof data.accepted === "number") {
          this.audioAcks.get(data.accepted)?.(data.accepted);
          this.audioAcks.delete(data.accepted);
          return;
        }
        this.stats.audioPeak = data.peak;
        this.stats.audioBufferMs = data.bufferedMs;
        this.stats.underruns = data.underruns;
        this.stats.overruns = data.overruns;
        const latency = (context.outputLatency || context.baseLatency || 0) * 1e6;
        this.audioClock = data.pts === null ? null : { pts: data.pts - latency, at: performance.now() };
      };
    } catch (error) { this.disableAudio(`本机音频不可用：${String(error)}；视频仍可继续`); }
    this.animation = requestAnimationFrame(() => this.render());
  }

  video(buffer: ArrayBuffer, consumed: (sequence: number) => void): void {
    const packet = new DataView(buffer);
    this.videoChain = this.videoChain.then(async () => {
      if (this.disposed) return;
      try { await this.decode(buffer); }
      finally { consumed(packet.getUint32(0)); }
    }).catch((error) => { if (!this.disposed) this.fail(error); });
  }

  audio(buffer: ArrayBuffer, consumed: (sequence: number) => void): void {
    const packet = new DataView(buffer);
    const sequence = packet.getUint32(0);
    let submitted = false;
    try {
      if (this.disposed || !this.audioNode) return;
      const length = packet.getUint32(12);
      if (length % 4 || length + 16 !== buffer.byteLength) throw new Error("无效 PCM 数据");
      const pts = Number(packet.getBigUint64(4) & ((1n << 61n) - 1n));
      const samples = new Float32Array(length / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = packet.getInt16(16 + i * 2, true) / 32768;
      this.audioAcks.set(sequence, consumed);
      this.audioNode.port.postMessage({ samples, pts, sequence }, [samples.buffer]);
      submitted = true;
      this.stats.audioPackets++;
    } catch (error) { this.disableAudio(String(error)); }
    finally { if (!submitted) consumed(sequence); }
  }

  setVolume(value: number): void { if (this.gain) this.gain.gain.value = value; }

  disableAudio(message: string): void {
    this.audioClock = null;
    this.audioNode?.disconnect();
    this.audioNode?.port.close();
    this.audioNode = null;
    if (this.audioContext) void this.audioContext.close().catch(() => {});
    this.audioContext = null;
    for (const [sequence, consumed] of this.audioAcks) consumed(sequence);
    this.audioAcks.clear();
    this.audioNotice(message);
  }

  close(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animation);
    if (this.decoder?.state !== "closed") this.decoder?.close();
    this.decoder = null;
    this.frames.splice(0).forEach((frame) => frame.close());
    this.audioNode?.disconnect();
    this.audioNode?.port.close();
    this.audioNode = null;
    if (this.audioContext?.state !== "closed") void this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.audioAcks.clear();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private async decode(buffer: ArrayBuffer): Promise<void> {
    const packet = new DataView(buffer);
    const flags = packet.getUint8(4);
    if (flags & 0x80) {
      this.stats.width = this.canvas.width = packet.getUint32(8);
      this.stats.height = this.canvas.height = packet.getUint32(12);
      this.canvas.style.aspectRatio = `${this.canvas.width} / ${this.canvas.height}`;
      if (this.decoder?.state !== "closed") this.decoder?.close();
      this.decoder = null;
      this.config.clear();
      this.frames.splice(0).forEach((frame) => frame.close());
      this.needsKey = true;
      return;
    }
    const bytes = new Uint8Array(buffer, 16);
    if (flags & 0x40) {
      for (const nal of nalUnits(bytes)) {
        if ((nal[0] & 31) === 7 || (nal[0] & 31) === 8) this.config.set(nal[0] & 31, nal);
      }
      const sps = this.config.get(7);
      if (!sps || !this.config.has(8)) return;
      const codec = `avc1.${Array.from(sps.slice(1, 4), (n) => n.toString(16).padStart(2, "0")).join("")}`;
      const config: VideoDecoderConfig = { codec, optimizeForLatency: true };
      if (!(await VideoDecoder.isConfigSupported(config)).supported) throw new Error(`WebView 不支持设备编码 ${codec}`);
      if (this.disposed) return;
      if (this.decoder?.state !== "closed") this.decoder?.close();
      this.decoder = new VideoDecoder({
        output: (frame) => {
          if (this.disposed) { frame.close(); return; }
          this.frames.push(frame);
          while (this.frames.length > 4) { this.frames.shift()!.close(); this.stats.dropped++; }
        }, error: (error) => this.fail(error),
      });
      this.decoder.configure(config);
      this.needsKey = true;
      return;
    }
    const key = (flags & 0x20) !== 0;
    if (!this.decoder || (this.needsKey && !key)) return;
    const decoder = this.decoder;
    // ACK only after the decoder has capacity, so the IPC window stays bounded.
    const deadline = performance.now() + 2000;
    while (decoder.decodeQueueSize > 4) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (this.disposed || decoder.state === "closed") return;
      if (performance.now() > deadline) throw new Error("视频解码器停止消费帧");
    }
    let data: Uint8Array<ArrayBuffer> = bytes.slice();
    if (key) {
      const parameters = [...this.config.values()];
      const total = parameters.reduce((n, nal) => n + 4 + nal.length, 0);
      data = new Uint8Array(total + bytes.length);
      let offset = 0;
      for (const nal of parameters) { data.set([0, 0, 0, 1], offset); data.set(nal, offset + 4); offset += 4 + nal.length; }
      data.set(bytes, offset);
    }
    const timestamp = Number(packet.getBigUint64(4) & ((1n << 61n) - 1n));
    decoder.decode(new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp, data }));
    this.needsKey = false;
    this.stats.decodeQueue = decoder.decodeQueueSize;
  }

  private render(): void {
    if (this.disposed) return;
    const clock = this.audioClock && performance.now() - this.audioClock.at < 400
      ? this.audioClock.pts + (performance.now() - this.audioClock.at) * 1000 : null;
    let frame: VideoFrame | undefined;
    while (this.frames.length) {
      if (clock !== null && this.frames[0].timestamp > clock + 20000) break;
      if (frame) { frame.close(); this.stats.dropped++; }
      frame = this.frames.shift();
    }
    if (frame) {
      this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
      frame.close();
      this.stats.frames++;
    }
    this.animation = requestAnimationFrame(() => this.render());
  }
}
