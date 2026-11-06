import { describe, expect, it } from "vitest";
import { chordAt, layerLevels, MOODS, nextBoundary, notesForStep, stepDuration, STEPS_PER_BAR, Transport, type Layer, type PlayingMood } from "../src/audio/sequencer";

const all = (on: number): Record<Layer, number> => ({ kick: on, snare: on, hat: on, bass: on, pad: on, arp: on, lead: on });
const bar = (mood: PlayingMood, layer: Layer, barIndex = 0, seed = 1) =>
  Array.from({ length: STEPS_PER_BAR }, (_, i) => notesForStep(mood, barIndex * STEPS_PER_BAR + i, seed, all(1)))
    .flat()
    .filter((n) => n.layer === layer);

describe("Transport", () => {
  it("schedules every step inside the lookahead window exactly once", () => {
    const t = new Transport(10, 120);
    const first: number[] = [];
    for (let due = t.due(10.3); due; due = t.due(10.3)) first.push(due.time);
    expect(first.map((x) => +x.toFixed(4))).toEqual([10, 10.125, 10.25]);
    const second: number[] = [];
    for (let due = t.due(10.5); due; due = t.due(10.5)) second.push(due.step);
    expect(second).toEqual([3]);
  });

  it("does not drift over long runs", () => {
    const t = new Transport(0, 112);
    let last = { step: 0, time: 0 };
    for (let due = t.due(600); due; due = t.due(600)) last = due;
    expect(last.time).toBeCloseTo(last.step * stepDuration(112), 9);
  });

  it("changes tempo from the next unscheduled step without a gap", () => {
    const t = new Transport(0, 120);
    while (t.due(1)) {}
    const before = t.timeOf(t.step);
    t.setTempo(60);
    expect(t.timeOf(t.step)).toBeCloseTo(before);
    expect(t.timeOf(t.step + 1) - t.timeOf(t.step)).toBeCloseTo(stepDuration(60));
  });

  it("quantises mood switches to the next beat", () => {
    expect(nextBoundary(0)).toBe(0);
    expect(nextBoundary(5)).toBe(8);
    expect(nextBoundary(8)).toBe(8);
  });
});

describe("intensity layers", () => {
  it("adds race layers as intensity rises", () => {
    const low = layerLevels("race", 0);
    const high = layerLevels("race", 1);
    expect(low.kick).toBe(1);
    expect(low.bass).toBe(1);
    expect(low.lead).toBe(0);
    expect(low.arp).toBe(0);
    expect(high.lead).toBe(1);
    expect(high.arp).toBe(1);
  });

  it("fades a layer in over a small band rather than snapping", () => {
    const threshold = MOODS.race.thresholds.arp!;
    expect(layerLevels("race", threshold - 0.2).arp).toBe(0);
    const mid = layerLevels("race", threshold - 0.05).arp;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("never plays layers a mood does not have", () => {
    expect(layerLevels("lobby", 1).snare).toBe(0);
    expect(layerLevels("lobby", 1).lead).toBe(0);
  });

  it("leaves silent layers out of the schedule", () => {
    const levels = layerLevels("race", 0);
    const layers = new Set(Array.from({ length: 64 }, (_, i) => notesForStep("race", i, 1, levels)).flat().map((n) => n.layer));
    expect(layers.has("lead")).toBe(false);
    expect(layers.has("kick")).toBe(true);
  });
});

describe("patterns", () => {
  it("drives four-on-the-floor in a race but not in the lobby", () => {
    expect(bar("race", "kick").map((n) => n.step)).toEqual([0, 4, 8, 12]);
    expect(bar("lobby", "kick").length).toBeLessThan(4);
  });

  it("puts snare on the backbeat", () => {
    expect(bar("race", "snare").map((n) => n.step % STEPS_PER_BAR)).toEqual([4, 12]);
  });

  it("is tenser in sudden death", () => {
    expect(MOODS.suddenDeath.bpm).toBeGreaterThan(MOODS.race.bpm);
    expect(MOODS.race.bpm).toBeGreaterThan(MOODS.lobby.bpm);
    expect(bar("suddenDeath", "hat").length).toBeGreaterThan(bar("race", "hat").length);
  });

  it("plays bass on the chord root", () => {
    for (let b = 0; b < 4; b++) {
      const root = chordAt("race", b * STEPS_PER_BAR).root;
      expect(bar("race", "bass", b)[0]!.midi[0]).toBe(root);
    }
  });

  it("repeats lead phrases for the same seed and varies them across seeds", () => {
    const phrase = (seed: number) => [0, 1, 2].flatMap((b) => bar("race", "lead", b, seed).map((n) => `${n.step}:${n.midi[0]}`));
    expect(phrase(3)).toEqual(phrase(3));
    expect(new Set([1, 2, 3, 4, 5].map((s) => phrase(s).join())).size).toBeGreaterThan(1);
  });

  it("rests the lead in the fourth bar of each phrase", () => {
    expect(bar("race", "lead", 3)).toEqual([]);
  });
});
