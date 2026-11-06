import { describe, expect, it } from "vitest";
import { awardDelay, finalStandings, nameFit, podiumOrder } from "../src/ui/podium";
import { formatDelta, formatScore } from "../src/ui/format";

const player = (id: string, score: number) => ({ id, name: id, color: 0, ready: true, score, bot: false });

describe("podiumOrder", () => {
  it("puts the winner in the middle, second on the left and third on the right", () => {
    expect(podiumOrder(["a", "b", "c", "d"])).toEqual([
      { item: "b", place: 2 },
      { item: "a", place: 1 },
      { item: "c", place: 3 },
    ]);
  });

  it("leaves empty steps out", () => {
    expect(podiumOrder(["a", "b"])).toEqual([
      { item: "b", place: 2 },
      { item: "a", place: 1 },
    ]);
  });
});

describe("finalStandings", () => {
  it("ranks by score", () => {
    expect(finalStandings([player("a", 2), player("b", 5), player("c", 3)], "b").map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("puts the match winner first when scores tie", () => {
    expect(finalStandings([player("a", 3), player("b", 3)], "b").map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("awardDelay", () => {
  it("reveals awards one at a time after the podium has landed", () => {
    expect(awardDelay(0)).toBeGreaterThan(1);
    expect(awardDelay(1) - awardDelay(0)).toBeGreaterThan(1);
    expect(awardDelay(2) - awardDelay(1)).toBeCloseTo(awardDelay(1) - awardDelay(0));
  });
});

describe("format", () => {
  it("shows half points", () => {
    expect(formatScore(3)).toBe("3");
    expect(formatScore(2.5)).toBe("2½");
    expect(formatScore(0.5)).toBe("½");
  });

  it("signs deltas", () => {
    expect(formatDelta(2)).toBe("+2");
    expect(formatDelta(0)).toBe("0");
    expect(formatDelta(-1)).toBe("-1");
  });
});

describe("nameFit", () => {
  it("leaves short names at full size", () => {
    expect(nameFit("Toby")).toBe("");
  });

  it("shrinks longer names a step at a time", () => {
    expect(nameFit("Glitch (h)")).toBe("long");
    expect(nameFit("Glitch (hard) 22")).toBe("very-long");
  });

  it("counts characters rather than UTF-16 units", () => {
    expect(nameFit("🏎️🏎️🏎️🏎️")).toBe("");
  });
});
