export interface Out {
  ctx: BaseAudioContext;
  dest: AudioNode;
}

export const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const SILENT = 0.0001;
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buffer);
  }
  return buffer;
}

export function impulse(ctx: BaseAudioContext, seconds: number, darkness = 0.6): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      lp = lp * darkness + (Math.random() * 2 - 1) * (1 - darkness);
      data[i] = lp * (1 - i / length) ** 3;
    }
  }
  return buffer;
}

export function envelope(param: AudioParam, t: number, attack: number, peak: number, decay: number): number {
  param.setValueAtTime(SILENT, t);
  param.exponentialRampToValueAtTime(Math.max(peak, SILENT * 2), t + attack);
  param.exponentialRampToValueAtTime(SILENT, t + attack + decay);
  return t + attack + decay;
}

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
}

function filtered(o: Out, t: number, length: number, spec: FilterSpec | undefined, dest: AudioNode): AudioNode {
  if (!spec) return dest;
  const filter = o.ctx.createBiquadFilter();
  filter.type = spec.type;
  filter.Q.value = spec.q ?? 0.7;
  filter.frequency.setValueAtTime(spec.freq, t);
  if (spec.to) filter.frequency.exponentialRampToValueAtTime(spec.to, t + length);
  filter.connect(dest);
  return filter;
}

function panned(o: Out, pan: number | undefined): AudioNode {
  if (!pan) return o.dest;
  const node = o.ctx.createStereoPanner();
  node.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(o.dest);
  return node;
}

export interface ToneSpec {
  type?: OscillatorType;
  freq: number;
  to?: number;
  glide?: number;
  attack?: number;
  peak: number;
  decay: number;
  filter?: FilterSpec;
  pan?: number;
  detune?: number;
}

export function tone(o: Out, t: number, spec: ToneSpec): void {
  const attack = spec.attack ?? 0.004;
  const end = t + attack + spec.decay;
  const osc = o.ctx.createOscillator();
  const amp = o.ctx.createGain();
  osc.type = spec.type ?? "sine";
  osc.detune.value = spec.detune ?? 0;
  osc.frequency.setValueAtTime(spec.freq, t);
  if (spec.to) osc.frequency.exponentialRampToValueAtTime(spec.to, t + (spec.glide ?? attack + spec.decay));
  envelope(amp.gain, t, attack, spec.peak, spec.decay);
  osc.connect(amp).connect(filtered(o, t, attack + spec.decay, spec.filter, panned(o, spec.pan)));
  osc.start(t);
  osc.stop(end + 0.02);
}

export interface NoiseSpec {
  attack?: number;
  peak: number;
  decay: number;
  filter?: FilterSpec;
  pan?: number;
}

export function noise(o: Out, t: number, spec: NoiseSpec): void {
  const attack = spec.attack ?? 0.002;
  const src = o.ctx.createBufferSource();
  src.buffer = noiseBuffer(o.ctx);
  src.loop = true;
  const amp = o.ctx.createGain();
  envelope(amp.gain, t, attack, spec.peak, spec.decay);
  src.connect(amp).connect(filtered(o, t, attack + spec.decay, spec.filter, panned(o, spec.pan)));
  src.start(t, Math.random() * 1.5);
  src.stop(t + attack + spec.decay + 0.02);
}
