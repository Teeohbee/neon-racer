import { PRESET_TRACKS } from "@neon/sim";
import { describe, expect, it } from "vitest";
import { cupMessages, modeWin, RANDOM_TRACK, stepOption, trackChoice, trackChoices, tracksFor } from "../src/local/lobby-choices";

const ALL = PRESET_TRACKS.map((t) => t.name);

describe("stepping a left/right selector", () => {
  it("moves to the next or previous option", () => {
    expect(stepOption([2, 3, 5], 3, 1)).toBe(5);
    expect(stepOption([2, 3, 5], 3, -1)).toBe(2);
  });

  it("wraps round the ends by default", () => {
    expect(stepOption(["a", "b", "c"], "c", 1)).toBe("a");
    expect(stepOption(["a", "b", "c"], "a", -1)).toBe("c");
  });

  it("stops at the ends when told not to wrap", () => {
    expect(stepOption([0, 1, 2], 2, 1, { wrap: false })).toBe(2);
    expect(stepOption([0, 1, 2], 0, -1, { wrap: false })).toBe(0);
  });

  it("starts from the first option when the current value is not one of them", () => {
    expect(stepOption([0, 1, 2], 7, 1)).toBe(0);
  });
});

describe("the Mode row", () => {
  it("starts each mode at its default count", () => {
    expect(modeWin("laps")).toEqual({ kind: "laps", laps: 3 });
    expect(modeWin("score")).toEqual({ kind: "score", target: 8 });
  });
});

describe("the Track row", () => {
  it("offers Random, then every track", () => {
    expect(trackChoices(0)).toEqual([RANDOM_TRACK, ...ALL]);
  });

  it("offers only Random during a cup", () => {
    expect(trackChoices(3)).toEqual([RANDOM_TRACK]);
  });

  it("reads one selected track as that track, and anything more as Random", () => {
    expect(trackChoice([ALL[4]!])).toBe(ALL[4]);
    expect(trackChoice(ALL)).toBe(RANDOM_TRACK);
    expect(trackChoice(ALL.slice(0, 5))).toBe(RANDOM_TRACK);
  });

  it("sends every track for Random and just the one otherwise", () => {
    expect(tracksFor(RANDOM_TRACK)).toEqual({ t: "tracks", names: ALL });
    expect(tracksFor(ALL[2]!)).toEqual({ t: "tracks", names: [ALL[2]] });
  });
});

describe("the Cup row", () => {
  it("puts the Track row back to Random when a cup starts on a single track", () => {
    expect(cupMessages(3, [ALL[0]!])).toEqual([
      { t: "cup", legs: 3 },
      { t: "tracks", names: ALL },
    ]);
  });

  it("leaves the tracks alone otherwise", () => {
    expect(cupMessages(5, ALL)).toEqual([{ t: "cup", legs: 5 }]);
    expect(cupMessages(0, [ALL[0]!])).toEqual([{ t: "cup", legs: 0 }]);
  });
});
