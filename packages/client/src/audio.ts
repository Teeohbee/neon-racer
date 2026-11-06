let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "square", gain = 0.06, slideTo?: number, delay = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const amp = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(amp).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration);
}

export const sfx = {
  tick: () => tone(440, 0.12),
  go: () => tone(880, 0.35, "square", 0.07),
  blip: () => tone(660, 0.1, "triangle", 0.05),
  out: () => tone(400, 0.6, "sawtooth", 0.06, 60),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "square", 0.05, undefined, i * 0.1)),
};

export function createEngineSound() {
  const a = audio();
  if (!a) return { update: (_speed: number) => {}, stop: () => {} };
  const osc = a.createOscillator();
  const filter = a.createBiquadFilter();
  const amp = a.createGain();
  osc.type = "sawtooth";
  filter.type = "lowpass";
  filter.frequency.value = 600;
  amp.gain.value = 0;
  osc.connect(filter).connect(amp).connect(a.destination);
  osc.start();
  return {
    update(speed: number) {
      const t = a.currentTime;
      osc.frequency.setTargetAtTime(45 + speed * 0.18, t, 0.05);
      amp.gain.setTargetAtTime(speed > 5 ? 0.025 : 0.008, t, 0.1);
    },
    stop() {
      amp.gain.setTargetAtTime(0, a.currentTime, 0.05);
      osc.stop(a.currentTime + 0.3);
    },
  };
}
