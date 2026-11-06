import { noiseBuffer, type Out } from "./synth";

const IDLE_STOP = 2;
const TAU = 0.12;

interface Chain {
  sources: AudioScheduledSourceNode[];
  out: GainNode;
  drones: OscillatorNode[];
  filter: BiquadFilterNode;
  pulse: OscillatorNode;
  riser: BiquadFilterNode;
  riserGain: GainNode;
}

export function createDanger(o: Out, now: () => number) {
  let chain: Chain | null = null;
  let quietSince: number | null = null;

  function build(): Chain {
    const { ctx } = o;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(o.dest);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 4;
    const trem = ctx.createGain();
    trem.gain.value = 0.75;
    const pulse = ctx.createOscillator();
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.25;
    pulse.connect(pulseDepth).connect(trem.gain);
    const drones = [-7, 7].map((detune) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.detune.value = detune;
      osc.connect(filter);
      return osc;
    });
    filter.connect(trem).connect(out);
    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuffer(ctx);
    hiss.loop = true;
    const riser = ctx.createBiquadFilter();
    riser.type = "bandpass";
    riser.Q.value = 3;
    const riserGain = ctx.createGain();
    riserGain.gain.value = 0;
    hiss.connect(riser).connect(riserGain).connect(trem);
    const sources = [...drones, pulse, hiss];
    for (const s of sources) s.start(now());
    return { sources, out, drones, filter, pulse, riser, riserGain };
  }

  return function danger(level: number) {
    const v = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
    const t = now();
    if (v === 0) {
      if (!chain) return;
      chain.out.gain.setTargetAtTime(0, t, TAU * 2);
      quietSince ??= t;
      if (t - quietSince > IDLE_STOP) {
        for (const s of chain.sources) s.stop(t);
        chain.out.disconnect();
        chain = null;
        quietSince = null;
      }
      return;
    }
    quietSince = null;
    chain ??= build();
    for (const d of chain.drones) d.frequency.setTargetAtTime(48 + v * 30, t, TAU);
    chain.filter.frequency.setTargetAtTime(160 + v * v * 1400, t, TAU);
    chain.pulse.frequency.setTargetAtTime(1.5 + v * 9, t, TAU);
    chain.riser.frequency.setTargetAtTime(300 + v * v * 2600, t, TAU);
    chain.riserGain.gain.setTargetAtTime(v * v * 0.4, t, TAU);
    chain.out.gain.setTargetAtTime(0.22 * v ** 1.5, t, TAU);
  };
}

export type Danger = ReturnType<typeof createDanger>;
