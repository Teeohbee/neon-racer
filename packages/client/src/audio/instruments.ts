import type { Layer, PlayingMood } from "./sequencer";
import { envelope, midiToFreq, noiseBuffer, type Out } from "./synth";

export type Instrument = (o: Out, t: number, midi: number[], length: number, vel: number, mood: PlayingMood) => void;

const SILENT = 0.0001;

function osc(o: Out, type: OscillatorType, freq: number, detune = 0): OscillatorNode {
  const node = o.ctx.createOscillator();
  node.type = type;
  node.frequency.value = freq;
  node.detune.value = detune;
  return node;
}

function sustain(param: AudioParam, t: number, attack: number, level: number, hold: number, release: number): number {
  param.setValueAtTime(SILENT, t);
  param.exponentialRampToValueAtTime(level, t + attack);
  param.setValueAtTime(level, t + Math.max(attack, hold));
  param.exponentialRampToValueAtTime(SILENT, t + Math.max(attack, hold) + release);
  return t + Math.max(attack, hold) + release;
}

function play(sources: AudioScheduledSourceNode[], t: number, end: number) {
  for (const s of sources) {
    s.start(t);
    s.stop(end + 0.05);
  }
}

const kick: Instrument = (o, t, _midi, _length, vel) => {
  const body = osc(o, "sine", 150);
  const amp = o.ctx.createGain();
  body.frequency.setValueAtTime(150, t);
  body.frequency.exponentialRampToValueAtTime(52, t + 0.11);
  const end = envelope(amp.gain, t, 0.003, 0.9 * vel, 0.38);
  body.connect(amp).connect(o.dest);
  const knock = osc(o, "triangle", 320);
  const knockAmp = o.ctx.createGain();
  knock.frequency.setValueAtTime(320, t);
  knock.frequency.exponentialRampToValueAtTime(110, t + 0.03);
  envelope(knockAmp.gain, t, 0.001, 0.2 * vel, 0.035);
  knock.connect(knockAmp).connect(o.dest);
  play([body, knock], t, end);
};

function noiseSource(o: Out): AudioBufferSourceNode {
  const src = o.ctx.createBufferSource();
  src.buffer = noiseBuffer(o.ctx);
  src.loop = true;
  return src;
}

const snare: Instrument = (o, t, _midi, _length, vel) => {
  const src = noiseSource(o);
  const band = o.ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1700;
  band.Q.value = 0.7;
  const amp = o.ctx.createGain();
  const end = envelope(amp.gain, t, 0.002, 1.4 * vel, 0.2);
  src.connect(band).connect(amp).connect(o.dest);
  const body = osc(o, "triangle", 200);
  body.frequency.setValueAtTime(200, t);
  body.frequency.exponentialRampToValueAtTime(150, t + 0.08);
  const bodyAmp = o.ctx.createGain();
  envelope(bodyAmp.gain, t, 0.002, 0.7 * vel, 0.1);
  body.connect(bodyAmp).connect(o.dest);
  src.start(t, Math.random());
  src.stop(end + 0.05);
  play([body], t, end);
};

const hat: Instrument = (o, t, _midi, _length, vel) => {
  const src = noiseSource(o);
  const high = o.ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 7500;
  const low = o.ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 11000;
  const amp = o.ctx.createGain();
  const end = envelope(amp.gain, t, 0.001, 1 * vel, 0.045);
  src.connect(high).connect(low).connect(amp).connect(o.dest);
  src.start(t, Math.random());
  src.stop(end + 0.05);
};

const bass: Instrument = (o, t, midi, length, vel, mood) => {
  const f = midiToFreq(midi[0]!);
  const filter = o.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = mood === "lobby" ? 1 : 3;
  const top = mood === "lobby" ? 500 : 700 + vel * 900;
  filter.frequency.setValueAtTime(top, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(180, top * 0.3), t + Math.min(length, 0.3));
  const amp = o.ctx.createGain();
  const release = mood === "lobby" ? 0.25 : 0.06;
  const end = sustain(amp.gain, t, 0.006, 0.15 * vel, length, release);
  const saws = [osc(o, "sawtooth", f, -6), osc(o, "sawtooth", f, 6)];
  const sub = osc(o, "sine", f / 2);
  const subAmp = o.ctx.createGain();
  subAmp.gain.value = 0.6;
  for (const s of saws) s.connect(filter);
  sub.connect(subAmp).connect(amp);
  filter.connect(amp).connect(o.dest);
  play([...saws, sub], t, end);
};

const pad: Instrument = (o, t, midi, length, vel, mood) => {
  const filter = o.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.8;
  const base = mood === "suddenDeath" ? 1400 : 1000;
  filter.frequency.setValueAtTime(base * 0.6, t);
  filter.frequency.linearRampToValueAtTime(base, t + length * 0.5);
  filter.frequency.linearRampToValueAtTime(base * 0.7, t + length);
  const amp = o.ctx.createGain();
  const end = sustain(amp.gain, t, 0.7, (0.2 * vel) / Math.sqrt(midi.length), length, 1.6);
  filter.connect(amp).connect(o.dest);
  const sources: OscillatorNode[] = [];
  midi.forEach((m, i) => {
    for (const side of [-1, 1]) {
      const voice = osc(o, "sawtooth", midiToFreq(m), side * (6 + i));
      const pan = o.ctx.createStereoPanner();
      pan.pan.value = side * 0.45;
      voice.connect(pan).connect(filter);
      sources.push(voice);
    }
  });
  play(sources, t, end);
};

const arp: Instrument = (o, t, midi, length, vel, mood) => {
  const voice = osc(o, mood === "lobby" ? "triangle" : "square", midiToFreq(midi[0]!));
  const filter = o.ctx.createBiquadFilter();
  filter.type = "lowpass";
  const top = mood === "lobby" ? 1800 : 3000;
  filter.frequency.setValueAtTime(top, t);
  filter.frequency.exponentialRampToValueAtTime(top * 0.4, t + 0.18);
  const amp = o.ctx.createGain();
  const end = envelope(amp.gain, t, 0.004, 0.4 * vel, Math.min(0.28, length * 0.12 + 0.12));
  voice.connect(filter).connect(amp).connect(o.dest);
  play([voice], t, end);
};

const lead: Instrument = (o, t, midi, length, vel) => {
  const f = midiToFreq(midi[0]!);
  const filter = o.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2200;
  filter.Q.value = 1;
  const amp = o.ctx.createGain();
  const end = sustain(amp.gain, t, 0.025, 0.2 * vel, length * 0.9, 0.22);
  const vibrato = osc(o, "sine", 5.5);
  const depth = o.ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(8, t + 0.3);
  vibrato.connect(depth);
  const voices = [osc(o, "sawtooth", f, -5), osc(o, "sawtooth", f, 5), osc(o, "triangle", f * 2)];
  for (const v of voices) {
    depth.connect(v.detune);
    v.connect(filter);
  }
  filter.connect(amp).connect(o.dest);
  play([...voices, vibrato], t, end);
};

export const INSTRUMENTS: Record<Layer, Instrument> = { kick, snare, hat, bass, pad, arp, lead };
