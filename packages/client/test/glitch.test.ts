import { describe, expect, it } from "vitest";
import { buildTrack, pointAt, PRESET_TRACKS } from "@neon/sim";
import {
  burstLevel,
  CARD,
  corruptName,
  HACK_GLYPH_TIME,
  HACK_HOLD,
  HACK_TIME,
  HACK_WORDS,
  hackLevel,
  hackWord,
  kickTransition,
  LEADER_GAP,
  leaderIdle,
  leaderOf,
  NOISE,
  SIGNAL_TIME,
  signalLoss,
  SPLIT_TIME,
  stepLeader,
  stepTransition,
  transitionLevel,
  TRANSITION_TIME,
  typed,
  type LeaderGlitch,
} from "../src/render/glitch-math";

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe("burst envelope", () => {
  it("holds at full strength then falls to nothing by the end", () => {
    expect(burstLevel(0, 1, 0.2)).toBe(1);
    expect(burstLevel(0.2, 1, 0.2)).toBe(1);
    expect(burstLevel(0.6, 1, 0.2)).toBeCloseTo(0.25);
    expect(burstLevel(1, 1, 0.2)).toBe(0);
  });

  it("is silent before it starts or with nonsense input", () => {
    expect(burstLevel(-0.1, 1)).toBe(0);
    expect(burstLevel(Number.NaN, 1)).toBe(0);
  });

  it("never rises once it starts falling", () => {
    let prev = 1;
    for (let age = 0; age < 1.2; age += 0.01) {
      const level = burstLevel(age, 1, 0.1);
      expect(level).toBeLessThanOrEqual(prev);
      prev = level;
    }
  });
});

describe("hacker signature", () => {
  it("bursts for under half a second", () => {
    expect(hackLevel(0)).toBe(1);
    expect(hackLevel(HACK_HOLD)).toBe(1);
    expect(hackLevel(HACK_TIME / 2)).toBeGreaterThan(0);
    expect(hackLevel(HACK_TIME)).toBe(0);
    expect(HACK_TIME).toBeGreaterThanOrEqual(0.3);
    expect(HACK_TIME).toBeLessThanOrEqual(0.5);
  });

  it("picks one of the terminal words and keeps it for the same hazard", () => {
    const words = new Set(Array.from({ length: 40 }, (_, i) => hackWord(i)));
    expect([...words].sort()).toEqual([...HACK_WORDS].sort());
    expect(hackWord(7)).toBe(hackWord(7));
  });

  it("types the word out with a cursor, then clears it", () => {
    expect(typed("> INJECT", 0)).toBe(">_");
    expect(typed("> INJECT", 0.04)).toBe("> IN_");
    expect(typed("> INJECT", 0.2)).toBe("> INJECT");
    expect(typed("> INJECT", HACK_GLYPH_TIME)).toBe("");
    expect(HACK_GLYPH_TIME).toBeLessThanOrEqual(HACK_TIME);
  });
});

describe("signal loss", () => {
  it("spikes the RGB split first and lets it go before the corruption", () => {
    const early = signalLoss(0.02, 0);
    expect(early.split).toBe(1);
    expect(early.corrupt).toBe(1);
    expect(signalLoss(SPLIT_TIME, 0).split).toBe(0);
    expect(signalLoss(SPLIT_TIME, 0).corrupt).toBeGreaterThan(0);
  });

  it("shows the card after the first hit of noise and holds it", () => {
    expect(signalLoss(0, 0).card).toBe(0);
    expect(signalLoss(CARD.in, 0).card).toBe(1);
    expect(signalLoss(CARD.out - 0.01, 0).card).toBe(1);
  });

  it("flickers the card out and returns to the live view", () => {
    const fading = Array.from({ length: 200 }, (_, tick) => signalLoss((CARD.out + SIGNAL_TIME) / 2, tick).card);
    expect(fading.some((c) => c === 0)).toBe(true);
    expect(fading.some((c) => c > 0 && c < 1)).toBe(true);
    expect(signalLoss(SIGNAL_TIME, 0)).toEqual({ corrupt: 0, split: 0, card: 0 });
    expect(SIGNAL_TIME).toBeGreaterThanOrEqual(0.6);
    expect(SIGNAL_TIME).toBeLessThanOrEqual(0.9);
  });
});

describe("phase transition", () => {
  it("holds briefly at the kicked strength then clears within its duration", () => {
    let tr = kickTransition(null, 0.8);
    expect(transitionLevel(tr!)).toBe(0.8);
    for (let t = 0; t < TRANSITION_TIME + 0.02; t += 1 / 60) tr = stepTransition(tr, 1 / 60);
    expect(tr).toBeNull();
  });

  it("uses a custom duration", () => {
    const tr = kickTransition(null, 1, 1);
    expect(stepTransition(tr, 0.5)).not.toBeNull();
    expect(stepTransition(tr, 1)).toBeNull();
  });

  it("keeps a stronger glitch already running and ignores empty kicks", () => {
    const strong = kickTransition(null, 1);
    expect(kickTransition(strong, 0.3)).toBe(strong);
    expect(kickTransition(strong, 0)).toBe(strong);
    expect(kickTransition(null, Number.NaN)).toBeNull();
    const faded = stepTransition(strong, TRANSITION_TIME * 0.9);
    expect(kickTransition(faded, 0.5)!.strength).toBe(0.5);
  });

  it("clamps strength and survives a bad duration", () => {
    expect(kickTransition(null, 4)!.strength).toBe(1);
    expect(kickTransition(null, 1, Number.NaN)!.duration).toBe(TRANSITION_TIME);
  });
});

describe("leader name corruption", () => {
  const run = (state: LeaderGlitch, frames: number, rng: () => number, dt = 1 / 60) => {
    const corrupt: boolean[] = [];
    for (let i = 0; i < frames; i++) {
      state = stepLeader(state, dt, rng);
      corrupt.push(state.frames > 0);
    }
    return corrupt;
  };

  it("waits a random few seconds between corruptions", () => {
    expect(leaderIdle(() => 0).wait).toBe(LEADER_GAP.min);
    expect(leaderIdle(() => 1).wait).toBe(LEADER_GAP.max);
    const corrupt = run(leaderIdle(() => 0), 60 * LEADER_GAP.min - 2, () => 0);
    expect(corrupt.some(Boolean)).toBe(false);
  });

  it("corrupts for one or two frames at a time", () => {
    for (const roll of [0.2, 0.8]) {
      const corrupt = run({ wait: 0.01, frames: 0 }, 6, seq(roll, 0));
      const streak = corrupt.filter(Boolean).length;
      expect(streak).toBe(roll < 0.5 ? 1 : 2);
      expect(corrupt[0]).toBe(true);
    }
  });

  it("turns the name into glyph noise of the same length, keeping spaces", () => {
    const out = corruptName("Ada Lovelace", 3);
    expect(Array.from(out)).toHaveLength("Ada Lovelace".length);
    expect(out[3]).toBe(" ");
    for (const ch of Array.from(out.replace(" ", ""))) expect(NOISE).toContain(ch);
    expect(corruptName("Ada Lovelace", 3)).toBe(out);
    expect(corruptName("Ada Lovelace", 4)).not.toBe(out);
  });

  it("finds the alive car furthest ahead of the elimination line", () => {
    const track = buildTrack(PRESET_TRACKS[0]!.points);
    const at = (id: string, s: number, alive = true) => {
      const [x, y] = pointAt(track, s);
      return { id, x, y, alive };
    };
    const line = 100;
    expect(leaderOf([at("a", 400), at("b", 900), at("c", 1500, false)], track, line)).toBe("b");
    expect(leaderOf([at("a", 400), at("b", 60)], track, line)).toBe("b");
    expect(leaderOf([at("a", 400)], track, null)).toBeNull();
    expect(leaderOf([at("a", 400, false)], track, line)).toBeNull();
  });
});
