// This module runs in AudioWorkletGlobalScope, not in the DOM thread.
declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class PcmPlayer extends AudioWorkletProcessor {
  private readonly capacity = 24000;
  private readonly samples = new Float32Array(this.capacity * 2);
  private read = 0;
  private write = 0;
  private basePts = 0;
  private buffering = true;
  private elapsed = 0;
  private underruns = 0;
  private overruns = 0;
  private peak = 0;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<{ samples: Float32Array; pts: number; sequence: number }>) => {
      const count = data.samples.length / 2;
      if (count < 1 || count > this.capacity) return;
      if (this.write === 0 || Math.abs(data.pts - (this.basePts + this.write / 48000 * 1e6)) > 100000) {
        this.basePts = data.pts;
        this.read = this.write = 0;
        this.buffering = true;
      }
      if (this.write + count - this.read > this.capacity) {
        this.read = Math.max(0, this.write - 4800);
        this.overruns++;
      }
      for (let i = 0; i < count; i++) {
        const offset = ((this.write + i) % this.capacity) * 2;
        this.samples[offset] = data.samples[i * 2];
        this.samples[offset + 1] = data.samples[i * 2 + 1];
      }
      this.write += count;
      this.port.postMessage({ accepted: data.sequence });
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (!output?.[0]) return true;
    const buffered = this.write - this.read;
    if (this.buffering && buffered >= 3840) this.buffering = false;
    // Correct small clock drift without allowing the queue to grow indefinitely.
    const correction = Math.max(-0.003, Math.min(0.003, (buffered - 4800) / 48000 * 0.02));
    const rate = 48000 / sampleRate * (1 + correction);
    for (let i = 0; i < output[0].length; i++) {
      if (this.buffering || this.read + 1 >= this.write) {
        if (!this.buffering) this.underruns++;
        this.buffering = true;
        for (const channel of output) channel[i] = 0;
        continue;
      }
      const position = Math.floor(this.read);
      const fraction = this.read - position;
      for (let channel = 0; channel < output.length; channel++) {
        const left = this.samples[(position % this.capacity) * 2 + Math.min(channel, 1)];
        const right = this.samples[((position + 1) % this.capacity) * 2 + Math.min(channel, 1)];
        const value = left + (right - left) * fraction;
        output[channel][i] = value;
        this.peak = Math.max(this.peak, Math.abs(value));
      }
      this.read += rate;
    }
    this.elapsed += output[0].length;
    if (this.elapsed >= sampleRate / 10) {
      this.port.postMessage({
        pts: this.buffering ? null : this.basePts + this.read / 48000 * 1e6,
        bufferedMs: (this.write - this.read) / 48,
        underruns: this.underruns, overruns: this.overruns, peak: this.peak,
      });
      this.elapsed = 0;
      this.peak = 0;
    }
    return true;
  }
}

registerProcessor("rdb-pcm", PcmPlayer);
export {};
