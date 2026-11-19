export type Mood = "lobby" | "race" | "suddenDeath" | "off";
export type PlayingMood = Exclude<Mood, "off">;
export type Layer = "kick" | "snare" | "hat" | "bass" | "pad" | "arp" | "lead";

export const LAYERS: Layer[] = ["kick", "snare", "hat", "bass", "pad", "arp", "lead"];
export const STEPS_PER_BAR = 16;
export const STEPS_PER_BEAT = 4;

export interface NoteEvent {
  layer: Layer;
  step: number;
  midi: number[];
  steps: number;
  vel: number;
}

interface MoodSpec {
  bpm: number;
  barsPerChord: number;
  progression: Chord[];
  thresholds: Record<Layer, number | null>;
  mix: Record<Layer, number>;
  bass: "pulse" | "octaves" | "drive";
  hats: 8 | 16;
  kick: "half" | "four";
  arp: 8 | 16;
}

export interface Chord {
  root: number;
  tones: number[];
}

const Am: Chord = { root: 45, tones: [57, 60, 64] };
const F: Chord = { root: 53, tones: [53, 57, 60] };
const C: Chord = { root: 48, tones: [55, 60, 64] };
const G: Chord = { root: 55, tones: [55, 59, 62] };
const Dm: Chord = { root: 50, tones: [57, 62, 65] };
const Bb: Chord = { root: 46, tones: [58, 62, 65] };
const Fmaj7: Chord = { root: 53, tones: [53, 57, 60, 64] };
const Am7: Chord = { root: 45, tones: [55, 57, 60, 64] };

export const MOODS: Record<PlayingMood, MoodSpec> = {
  lobby: {
    bpm: 88,
    barsPerChord: 2,
    progression: [Am7, Fmaj7, C, G],
    thresholds: { pad: 0, bass: 0, arp: 0, kick: 0.35, hat: 0.55, snare: null, lead: null },
    mix: { kick: 0.5, snare: 0, hat: 0.3, bass: 0.5, pad: 0.55, arp: 0.34, lead: 0 },
    bass: "pulse",
    hats: 8,
    kick: "half",
    arp: 8,
  },
  race: {
    bpm: 112,
    barsPerChord: 1,
    progression: [Am, F, C, G],
    thresholds: { kick: 0, bass: 0, pad: 0, hat: 0.2, snare: 0.35, arp: 0.55, lead: 0.8 },
    mix: { kick: 0.75, snare: 0.8, hat: 0.32, bass: 0.6, pad: 0.38, arp: 0.34, lead: 0.24 },
    bass: "octaves",
    hats: 8,
    kick: "four",
    arp: 16,
  },
  suddenDeath: {
    bpm: 128,
    barsPerChord: 1,
    progression: [Am, Bb, Am, G, Am, Bb, Dm, G],
    thresholds: { kick: 0, bass: 0, pad: 0, hat: 0, snare: 0, arp: 0, lead: 0.6 },
    mix: { kick: 0.8, snare: 0.8, hat: 0.32, bass: 0.62, pad: 0.32, arp: 0.32, lead: 0.22 },
    bass: "drive",
    hats: 16,
    kick: "four",
    arp: 16,
  },
};

const LAYER_FADE = 0.15;

export function layerLevels(mood: PlayingMood, intensity: number): Record<Layer, number> {
  const spec = MOODS[mood];
  const out = {} as Record<Layer, number>;
  for (const layer of LAYERS) {
    const threshold = spec.thresholds[layer];
    out[layer] = threshold === null ? 0 : threshold === 0 ? 1 : Math.min(1, Math.max(0, (intensity - threshold) / LAYER_FADE + 1));
  }
  return out;
}

export const stepDuration = (bpm: number) => 60 / bpm / STEPS_PER_BEAT;

export const nextBoundary = (step: number, every = STEPS_PER_BEAT) => Math.ceil(step / every) * every;

export class Transport {
  step = 0;
  private anchorTime: number;
  private anchorStep = 0;

  constructor(
    startTime: number,
    public bpm: number,
  ) {
    this.anchorTime = startTime;
  }

  timeOf(step: number): number {
    return this.anchorTime + (step - this.anchorStep) * stepDuration(this.bpm);
  }

  setTempo(bpm: number): void {
    this.anchorTime = this.timeOf(this.step);
    this.anchorStep = this.step;
    this.bpm = bpm;
  }

  /** Carry on after a pause: the next unplayed step plays at `time`. */
  resumeAt(time: number): void {
    this.anchorTime = time;
    this.anchorStep = this.step;
  }

  due(until: number): { step: number; time: number } | null {
    const time = this.timeOf(this.step);
    if (time >= until) return null;
    return { step: this.step++, time };
  }
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chordAt(mood: PlayingMood, step: number): Chord {
  const spec = MOODS[mood];
  const bar = Math.floor(step / STEPS_PER_BAR);
  return spec.progression[Math.floor(bar / spec.barsPerChord) % spec.progression.length]!;
}

const PENTATONIC = [0, 3, 5, 7, 10];
const LEAD_RHYTHMS = [
  [0, 3, 6, 8, 10, 14],
  [0, 2, 4, 7, 10, 12],
  [0, 6, 8, 11, 14],
  [0, 3, 6, 10, 12, 13],
];

function leadPhrase(seed: number, phrase: number): { at: number; len: number; degree: number }[] {
  const r = rng(seed * 7919 + phrase * 104729);
  const rhythm = LEAD_RHYTHMS[Math.floor(r() * LEAD_RHYTHMS.length)]!;
  let degree = 5 + Math.floor(r() * 3);
  return rhythm.map((at, i) => {
    degree = Math.max(2, Math.min(9, degree + Math.round((r() - 0.5) * 3.2)));
    const next = rhythm[i + 1] ?? 16;
    return { at, len: Math.max(1, next - at - (r() < 0.3 ? 1 : 0)), degree };
  });
}

const pentatonicMidi = (degree: number) => 57 + Math.floor(degree / 5) * 12 + PENTATONIC[degree % 5]!;

function arpOrder(seed: number, block: number): number[] {
  const r = rng(seed * 31 + block * 977);
  const shapes = [
    [0, 1, 2, 3],
    [0, 2, 1, 3],
    [0, 1, 2, 1],
    [3, 2, 1, 0],
    [0, 2, 3, 2],
  ];
  return shapes[Math.floor(r() * shapes.length)]!;
}

export function notesForStep(mood: PlayingMood, step: number, seed: number, levels: Record<Layer, number>): NoteEvent[] {
  const spec = MOODS[mood];
  const chord = chordAt(mood, step);
  const bassRoot = chord.root;
  const pos = step % STEPS_PER_BAR;
  const bar = Math.floor(step / STEPS_PER_BAR);
  const out: NoteEvent[] = [];
  const on = (layer: Layer) => levels[layer] > 0;
  const add = (layer: Layer, midi: number[], steps: number, vel: number) => out.push({ layer, step, midi, steps, vel });

  if (on("kick")) {
    if (spec.kick === "four" ? pos % 4 === 0 : pos === 0 || pos === 8 || (pos === 10 && bar % 2 === 1)) add("kick", [], 1, pos === 0 ? 1 : 0.85);
  }
  if (on("snare") && (pos === 4 || pos === 12)) add("snare", [], 1, pos === 12 ? 1 : 0.9);
  if (on("snare") && mood === "suddenDeath" && bar % 4 === 3 && pos >= 13) add("snare", [], 1, 0.35 + (pos - 13) * 0.15);
  if (on("hat")) {
    if (spec.hats === 16) add("hat", [], 1, pos % 4 === 2 ? 1 : pos % 2 === 0 ? 0.55 : 0.35);
    else if (pos % 2 === 0) add("hat", [], 1, pos % 4 === 2 ? 1 : 0.45);
  }
  if (on("bass")) {
    if (spec.bass === "pulse") {
      if (pos === 0) add("bass", [bassRoot], 6, 1);
      else if (pos === 6 || pos === 10) add("bass", [bassRoot + (pos === 10 ? 12 : 0)], 3, 0.7);
    } else if (spec.bass === "octaves") {
      if (pos % 2 === 0) add("bass", [bassRoot + (pos % 4 === 2 ? 12 : 0)], 1.6, pos % 4 === 0 ? 1 : 0.75);
    } else {
      add("bass", [bassRoot + (pos % 8 === 6 ? 12 : 0)], 0.8, pos % 4 === 0 ? 1 : 0.6);
    }
  }
  if (on("pad") && pos === 0 && bar % spec.barsPerChord === 0) add("pad", chord.tones, STEPS_PER_BAR * spec.barsPerChord, 1);
  if (on("arp") && pos % (16 / spec.arp) === 0) {
    const tones = [...chord.tones.slice(-3), chord.tones.at(-3)! + 12];
    const order = arpOrder(seed, Math.floor(bar / 2));
    const i = (pos / (16 / spec.arp)) % order.length;
    const lift = mood === "lobby" ? 12 : bar % 2 === 1 && pos >= 8 ? 24 : 12;
    add("arp", [tones[order[i]!]! + lift], 16 / spec.arp, i === 0 ? 1 : 0.7);
  }
  if (on("lead")) {
    const phrase = Math.floor(bar / 4);
    const notes = leadPhrase(seed, phrase);
    const motifBar = bar % 4;
    if (motifBar !== 3) {
      const note = notes.find((n) => n.at === pos);
      if (note) add("lead", [pentatonicMidi(note.degree + (motifBar === 2 ? 1 : 0))], note.len, 1);
    }
  }
  return out;
}
