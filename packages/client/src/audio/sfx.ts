import type { EliminationReason, HazardKind } from "@neon/sim";
import { midiToFreq, noise, tone, type Out } from "./synth";
import { rng } from "./sequencer";

export interface EliminationOptions {
  you?: boolean;
  pan?: number;
}

export function click(o: Out, t: number) {
  tone(o, t, { type: "triangle", freq: 1500, to: 1100, peak: 0.18, decay: 0.035 });
  tone(o, t, { freq: 3000, peak: 0.04, decay: 0.02 });
}

export function countdownTick(o: Out, t: number) {
  tone(o, t, { type: "triangle", freq: midiToFreq(76), peak: 0.32, decay: 0.2 });
  tone(o, t, { type: "square", freq: midiToFreq(76), peak: 0.06, decay: 0.12, filter: { type: "lowpass", freq: 2200 } });
}

export function go(o: Out, t: number) {
  for (const [midi, detune] of [[69, -6], [76, 6], [81, 0], [88, 0]] as const) {
    tone(o, t, { type: "sawtooth", freq: midiToFreq(midi), detune, attack: 0.01, peak: 0.08, decay: 0.7, filter: { type: "lowpass", freq: 900, to: 4500, q: 2 } });
  }
  tone(o, t, { freq: 140, to: 50, peak: 0.5, decay: 0.3 });
  noise(o, t, { peak: 0.12, decay: 0.35, filter: { type: "bandpass", freq: 1200, to: 6000, q: 0.8 } });
}

export function boost(o: Out, t: number) {
  noise(o, t, { attack: 0.06, peak: 0.35, decay: 0.5, filter: { type: "bandpass", freq: 350, to: 3800, q: 1.6 } });
  tone(o, t, { type: "sawtooth", freq: 110, to: 440, glide: 0.35, attack: 0.04, peak: 0.08, decay: 0.45, filter: { type: "lowpass", freq: 600, to: 2400 } });
}

export function slipstream(o: Out, t: number) {
  noise(o, t, { attack: 0.12, peak: 0.16, decay: 0.45, filter: { type: "bandpass", freq: 2400, to: 700, q: 1.2 } });
  noise(o, t + 0.05, { attack: 0.08, peak: 0.06, decay: 0.3, filter: { type: "highpass", freq: 4500 } });
}

export function bump(o: Out, t: number, intensity = 1, pan = 0) {
  const k = Number.isFinite(intensity) ? Math.max(0.15, Math.min(1, intensity)) : 1;
  tone(o, t, { freq: 130 * (0.8 + k * 0.3), to: 42, glide: 0.14, peak: 0.75 * k, decay: 0.24, pan });
  noise(o, t, { peak: 0.35 * k, decay: 0.06 + 0.05 * k, filter: { type: "lowpass", freq: 500 + 900 * k }, pan });
  tone(o, t, { type: "square", freq: 210, to: 160, peak: 0.05 * k, decay: 0.06, filter: { type: "lowpass", freq: 900 }, pan });
}

export function hazardPlaced(o: Out, t: number) {
  tone(o, t, { type: "square", freq: 1250, peak: 0.08, decay: 0.045, filter: { type: "lowpass", freq: 3200 } });
  tone(o, t + 0.055, { type: "square", freq: 1660, peak: 0.08, decay: 0.06, filter: { type: "lowpass", freq: 3200 } });
}

export const ARMING_TICKS = [0, 0.24, 0.4, 0.5];

export function hazardArming(o: Out, t: number, duration = 0.6) {
  ARMING_TICKS.forEach((at, i) => {
    tone(o, t + at * (duration / 0.6), { type: "triangle", freq: 900 + i * 140, peak: 0.12 + i * 0.03, decay: 0.05 });
  });
}

export function hazardActivate(o: Out, t: number, kind: HazardKind, pan = 0) {
  switch (kind) {
    case "block":
      tone(o, t, { freq: 85, to: 36, glide: 0.3, peak: 0.95, decay: 0.5, pan });
      noise(o, t, { peak: 0.45, decay: 0.18, filter: { type: "lowpass", freq: 380 }, pan });
      tone(o, t, { type: "square", freq: 175, to: 150, peak: 0.12, decay: 0.16, filter: { type: "bandpass", freq: 700, q: 3 }, pan });
      break;
    case "slow":
      warble(o, t, pan);
      break;
    case "freeze":
      crackle(o, t, pan);
      break;
  }
}

function warble(o: Out, t: number, pan: number) {
  const out = o.ctx.createStereoPanner();
  out.pan.value = pan;
  out.connect(o.dest);
  const filter = o.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  filter.connect(out);
  const lfo = o.ctx.createOscillator();
  const depth = o.ctx.createGain();
  lfo.frequency.setValueAtTime(10, t);
  lfo.frequency.linearRampToValueAtTime(4, t + 0.9);
  depth.gain.value = 30;
  lfo.connect(depth);
  for (const detune of [-8, 8]) {
    const osc = o.ctx.createOscillator();
    const amp = o.ctx.createGain();
    osc.type = "triangle";
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.95);
    depth.connect(osc.frequency);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
    amp.gain.setValueAtTime(0.22, t + 0.6);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    osc.connect(amp).connect(filter);
    osc.start(t);
    osc.stop(t + 1.05);
  }
  lfo.start(t);
  lfo.stop(t + 1.05);
}

function crackle(o: Out, t: number, pan: number) {
  const r = rng(7);
  for (let i = 0; i < 16; i++) {
    const at = t + r() * 0.5 * (i / 16) ** 0.7;
    noise(o, at, { peak: 0.22 * (1 - i / 20), decay: 0.008 + r() * 0.02, filter: { type: "highpass", freq: 3500 + r() * 4000 }, pan: pan + (r() - 0.5) * 0.6 });
  }
  for (const [midi, delay] of [[96, 0], [103, 0.06], [100, 0.13], [108, 0.2]] as const) {
    tone(o, t + delay, { freq: midiToFreq(midi), peak: 0.05, decay: 0.5, pan });
  }
  noise(o, t, { attack: 0.02, peak: 0.08, decay: 0.45, filter: { type: "highpass", freq: 6000 }, pan });
}

export function eliminated(o: Out, t: number, reason: EliminationReason, opts: EliminationOptions = {}) {
  const g = opts.you === false ? 0.45 : 1;
  const pan = opts.pan ?? 0;
  switch (reason) {
    case "fell":
      tone(o, t, { freq: 1500, to: 240, glide: 0.9, attack: 0.03, peak: 0.16 * g, decay: 0.9, pan });
      tone(o, t, { type: "triangle", freq: 1508, to: 242, glide: 0.9, attack: 0.03, peak: 0.05 * g, decay: 0.9, pan });
      tone(o, t + 0.95, { freq: 95, to: 38, glide: 0.25, peak: 0.55 * g, decay: 0.45, filter: { type: "lowpass", freq: 300 }, pan });
      noise(o, t + 0.95, { peak: 0.2 * g, decay: 0.25, filter: { type: "lowpass", freq: 260 }, pan });
      break;
    case "line":
      zap(o, t, g, pan);
      break;
    case "left":
      tone(o, t, { type: "triangle", freq: 520, to: 300, peak: 0.15 * g, decay: 0.18, pan });
      break;
  }
}

function zap(o: Out, t: number, g: number, pan: number) {
  const out = o.ctx.createStereoPanner();
  out.pan.value = pan;
  out.connect(o.dest);
  const osc = o.ctx.createOscillator();
  const lfo = o.ctx.createOscillator();
  const depth = o.ctx.createGain();
  const amp = o.ctx.createGain();
  const filter = o.ctx.createBiquadFilter();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(1100, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.35);
  lfo.type = "square";
  lfo.frequency.value = 55;
  depth.gain.setValueAtTime(500, t);
  depth.gain.exponentialRampToValueAtTime(20, t + 0.35);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(5000, t);
  filter.frequency.exponentialRampToValueAtTime(500, t + 0.4);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.16 * g, t + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  lfo.connect(depth).connect(osc.frequency);
  osc.connect(filter).connect(amp).connect(out);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 0.45);
  lfo.stop(t + 0.45);
  noise(o, t, { peak: 0.2 * g, decay: 0.22, filter: { type: "highpass", freq: 2500 }, pan });
  noise(o, t + 0.08, { peak: 0.12 * g, decay: 0.1, filter: { type: "bandpass", freq: 5000, q: 2 }, pan });
  tone(o, t, { type: "sawtooth", freq: 55, peak: 0.1 * g, decay: 0.3, filter: { type: "lowpass", freq: 400 }, pan });
}

export function roundWin(o: Out, t: number) {
  [69, 73, 76, 81].forEach((midi, i) => {
    const at = t + i * 0.1;
    const last = i === 3;
    tone(o, at, { type: "triangle", freq: midiToFreq(midi), peak: 0.22, decay: last ? 0.6 : 0.16 });
    tone(o, at, { type: "square", freq: midiToFreq(midi + 12), peak: 0.035, decay: last ? 0.4 : 0.1, filter: { type: "lowpass", freq: 3500 } });
    if (last) tone(o, at + 0.2, { type: "triangle", freq: midiToFreq(midi + 12), peak: 0.06, decay: 0.5 });
  });
}

export function matchWin(o: Out, t: number) {
  const chords: [number, number[], number][] = [
    [0, [65, 69, 72], 0.22],
    [0.26, [67, 71, 74], 0.22],
    [0.52, [69, 73, 76, 81], 1.6],
  ];
  for (const [at, notes, length] of chords) {
    for (const midi of notes) {
      for (const detune of [-7, 7]) {
        tone(o, t + at, {
          type: "sawtooth",
          freq: midiToFreq(midi),
          detune,
          attack: 0.03,
          peak: 0.05,
          decay: length,
          filter: { type: "lowpass", freq: 3200, to: 900, q: 1.5 },
        });
      }
    }
    tone(o, t + at, { freq: midiToFreq(notes[0]! - 24), peak: 0.35, decay: length * 0.8 });
  }
  tone(o, t + 0.52, { freq: 120, to: 45, peak: 0.6, decay: 0.4 });
  noise(o, t + 0.52, { attack: 0.01, peak: 0.08, decay: 1.2, filter: { type: "highpass", freq: 7000 } });
  [93, 97, 100, 105, 100, 105, 109].forEach((midi, i) => {
    tone(o, t + 0.62 + i * 0.07, { type: "triangle", freq: midiToFreq(midi), peak: 0.05, decay: 0.25 });
  });
}
