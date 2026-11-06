import { INSTRUMENTS } from "./instruments";
import { impulse, type Out } from "./synth";
import { LAYERS, layerLevels, MOODS, nextBoundary, notesForStep, stepDuration, Transport, type Layer, type Mood, type PlayingMood } from "./sequencer";

const SENDS: Partial<Record<Layer, { reverb: number; delay: number }>> = {
  snare: { reverb: 0.3, delay: 0 },
  pad: { reverb: 0.5, delay: 0 },
  arp: { reverb: 0.25, delay: 0.35 },
  lead: { reverb: 0.3, delay: 0.3 },
};
const FADE_IN = 0.8;
const FADE_OUT = 0.5;
const STOP_AFTER = 3;
const INTENSITY_TAU = 1.5;
const LAYER_TAU = 0.35;
const LATE = 0.03;

export interface Music {
  setMood(mood: Mood): void;
  setIntensity(value: number): void;
  readonly mood: Mood;
  pump(until: number): void;
  dispose(): void;
}

export function createMusic(o: Out, now: () => number, seed = Math.floor(Math.random() * 1e6)): Music {
  const { ctx } = o;
  const master = ctx.createGain();
  master.gain.value = 0;
  const rumble = ctx.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 38;
  master.connect(rumble).connect(o.dest);
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 2.6);
  reverb.connect(master);
  const delay = ctx.createDelay(2);
  const feedback = ctx.createGain();
  const delayTone = ctx.createBiquadFilter();
  feedback.gain.value = 0.32;
  delayTone.type = "lowpass";
  delayTone.frequency.value = 2400;
  const echoSide = ctx.createStereoPanner();
  echoSide.pan.value = 0.45;
  delay.connect(delayTone).connect(feedback).connect(delay);
  delayTone.connect(echoSide).connect(master);

  const layers = {} as Record<Layer, GainNode>;
  for (const layer of LAYERS) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const sends = SENDS[layer];
    if (sends?.reverb) gain.connect(send(sends.reverb)).connect(reverb);
    if (sends?.delay) gain.connect(send(sends.delay)).connect(delay);
    layers[layer] = gain;
  }

  function send(level: number) {
    const g = ctx.createGain();
    g.gain.value = level;
    return g;
  }

  let target: Mood = "off";
  let playing: PlayingMood | null = null;
  let pending: { mood: PlayingMood; step: number } | null = null;
  let transport: Transport | null = null;
  let stopAt: number | null = null;
  let intensity = 0;
  let intensityTarget = 0;

  const setDelayTime = (bpm: number, at: number) => delay.delayTime.setTargetAtTime(stepDuration(bpm) * 3, at, 0.05);

  function apply(mood: PlayingMood, at: number) {
    playing = mood;
    transport!.setTempo(MOODS[mood].bpm);
    setDelayTime(MOODS[mood].bpm, at);
  }

  function play(step: number, time: number) {
    const mood = playing!;
    const dt = stepDuration(MOODS[mood].bpm);
    intensity += (intensityTarget - intensity) * (1 - Math.exp(-dt / INTENSITY_TAU));
    const levels = layerLevels(mood, intensity);
    for (const layer of LAYERS) layers[layer].gain.setTargetAtTime(MOODS[mood].mix[layer] * levels[layer], time, LAYER_TAU);
    for (const note of notesForStep(mood, step, seed, levels)) {
      INSTRUMENTS[note.layer]({ ctx, dest: layers[note.layer] }, time, note.midi, note.steps * dt, note.vel, mood);
    }
  }

  return {
    get mood() {
      return target;
    },
    setMood(mood) {
      if (mood === target) return;
      target = mood;
      const t = now();
      if (mood === "off") {
        pending = null;
        master.gain.setTargetAtTime(0, t, FADE_OUT);
        stopAt = t + STOP_AFTER;
        return;
      }
      stopAt = null;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(1, t, FADE_IN);
      if (!transport) {
        transport = new Transport(t + 0.05, MOODS[mood].bpm);
        apply(mood, t);
        return;
      }
      pending = { mood, step: nextBoundary(transport.step) };
    },
    setIntensity(value) {
      intensityTarget = Math.max(0, Math.min(1, value));
    },
    pump(until) {
      if (stopAt !== null && now() >= stopAt) {
        transport = null;
        playing = null;
        stopAt = null;
      }
      if (!transport) return;
      for (;;) {
        if (pending && transport.step >= pending.step) {
          apply(pending.mood, transport.timeOf(transport.step));
          pending = null;
        }
        const due = transport.due(until);
        if (!due) break;
        if (due.time >= now() - LATE) play(due.step, due.time);
      }
    },
    dispose() {
      transport = null;
      master.disconnect();
    },
  };
}
