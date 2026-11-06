import type { Camera } from "@neon/sim";
import { noiseBuffer, type Out } from "./synth";
import { diffVoices, planVoices, type AudibleCar, type VoicePlan } from "./voices";

const YOU_LEVEL = 0.2;
const OTHER_LEVEL = 0.12;
const YOU_SCREECH = 0.1;
const OTHER_SCREECH = 0.06;
const FADE = 0.12;
const SMOOTH = 0.05;

interface Voice {
  sources: AudioScheduledSourceNode[];
  out: GainNode;
  pan: StereoPannerNode;
  saw: OscillatorNode;
  sub: OscillatorNode;
  lfo: OscillatorNode;
  filter: BiquadFilterNode;
  screech: GainNode;
  screechBand: BiquadFilterNode;
}

export interface Engines {
  update(cars: AudibleCar[], camera: Camera): void;
  stop(): void;
}

export function createEngines(o: Out, now: () => number): Engines {
  const voices = new Map<string, Voice>();
  const gears = new Map<string, number>();

  function create(): Voice {
    const { ctx } = o;
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = ctx.createStereoPanner();
    out.connect(pan).connect(o.dest);

    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    const sub = ctx.createOscillator();
    sub.type = "square";
    const subLevel = ctx.createGain();
    subLevel.gain.value = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2.5;
    const throb = ctx.createGain();
    throb.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.3;
    lfo.connect(lfoDepth).connect(throb.gain);
    saw.connect(filter);
    sub.connect(subLevel).connect(filter);
    filter.connect(throb).connect(out);

    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuffer(ctx);
    hiss.loop = true;
    const screechBand = ctx.createBiquadFilter();
    screechBand.type = "bandpass";
    screechBand.Q.value = 9;
    screechBand.frequency.value = 2100;
    const wobble = ctx.createOscillator();
    const wobbleDepth = ctx.createGain();
    wobble.frequency.value = 6;
    wobbleDepth.gain.value = 220;
    wobble.connect(wobbleDepth).connect(screechBand.frequency);
    const screechTone = ctx.createBiquadFilter();
    screechTone.type = "lowpass";
    screechTone.frequency.value = 3200;
    const screech = ctx.createGain();
    screech.gain.value = 0;
    hiss.connect(screechBand).connect(screechTone).connect(screech).connect(pan);

    const sources = [saw, sub, lfo, hiss, wobble];
    const t = now();
    for (const s of sources) s.start(t);
    return { sources, out, pan, saw, sub, lfo, filter, screech, screechBand };
  }

  function apply(voice: Voice, plan: VoicePlan, t: number) {
    const f = plan.freq;
    voice.saw.frequency.setTargetAtTime(f, t, SMOOTH);
    voice.sub.frequency.setTargetAtTime(f / 2, t, SMOOTH);
    voice.lfo.frequency.setTargetAtTime(f / 4, t, SMOOTH);
    voice.filter.frequency.setTargetAtTime(220 + f * 6, t, SMOOTH);
    voice.pan.pan.setTargetAtTime(plan.pan, t, SMOOTH);
    voice.out.gain.setTargetAtTime(plan.gain * (plan.isYou ? YOU_LEVEL : OTHER_LEVEL), t, FADE);
    voice.screech.gain.setTargetAtTime(plan.screech * (plan.isYou ? YOU_SCREECH : OTHER_SCREECH), t, plan.screech > 0 ? 0.03 : 0.08);
    voice.screechBand.frequency.setTargetAtTime(1800 + plan.screech * 700, t, SMOOTH);
  }

  function release(id: string, t: number) {
    const voice = voices.get(id);
    if (!voice) return;
    voices.delete(id);
    voice.out.gain.setTargetAtTime(0, t, FADE);
    voice.screech.gain.setTargetAtTime(0, t, FADE / 2);
    for (const s of voice.sources) s.stop(t + FADE * 6);
  }

  return {
    update(cars, camera) {
      const t = now();
      for (const id of gears.keys()) if (!cars.some((c) => c.id === id)) gears.delete(id);
      const plans = planVoices(cars, camera, gears);
      const diff = diffVoices(voices.keys(), plans);
      for (const id of diff.release) release(id, t);
      for (const plan of diff.create) voices.set(plan.id, create());
      for (const plan of plans) apply(voices.get(plan.id)!, plan, t);
    },
    stop() {
      const t = now();
      for (const id of [...voices.keys()]) release(id, t);
      gears.clear();
    },
  };
}
