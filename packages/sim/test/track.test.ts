import { describe, expect, it } from "vitest";
import { advanceProgress, buildTrack, gridSlots, isOnRoad, nearestOnTrack, ovalPoints, pointAt, TRACK_WIDTH } from "../src/track";

const circle = buildTrack(ovalPoints(0, 0, 1000, 1000));

describe("buildTrack", () => {
  it("produces a closed loop of roughly the drawn length", () => {
    expect(circle.length).toBeGreaterThan(2 * Math.PI * 1000 * 0.95);
    expect(circle.length).toBeLessThan(2 * Math.PI * 1000 * 1.02);
  });

  it("smooths a jagged drawing into evenly spaced samples", () => {
    const jagged = ovalPoints(0, 0, 1000, 600, 200).map(([x, y], i) => [x + (i % 2 ? 15 : -15), y] as [number, number]);
    const track = buildTrack(jagged);
    const gaps = track.xs.map((x, i) => {
      const j = (i + 1) % track.xs.length;
      return Math.hypot(track.xs[j]! - x, track.ys[j]! - track.ys[i]!);
    });
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(6);
  });
});

describe("nearestOnTrack", () => {
  it("measures distance from the centre line", () => {
    expect(nearestOnTrack(circle, 1000, 0).dist).toBeLessThan(2);
    expect(nearestOnTrack(circle, 1050, 0).dist).toBeCloseTo(50, -1);
  });

  it("reports arc position increasing along the drawing direction", () => {
    const a = nearestOnTrack(circle, ...pointAt(circle, 500).slice(0, 2) as [number, number]).s;
    const b = nearestOnTrack(circle, ...pointAt(circle, 1500).slice(0, 2) as [number, number]).s;
    expect(a).toBeCloseTo(500, -1);
    expect(b).toBeCloseTo(1500, -1);
  });
});

describe("isOnRoad", () => {
  it("is true within half the track width", () => {
    expect(isOnRoad(circle, 1000 + TRACK_WIDTH / 2 - 5, 0)).toBe(true);
    expect(isOnRoad(circle, 1000 + TRACK_WIDTH / 2 + 5, 0)).toBe(false);
  });
});

describe("advanceProgress", () => {
  it("accumulates across the lap boundary", () => {
    const L = circle.length;
    expect(advanceProgress({ s: L - 10, progress: 100 }, 10, L, 50).progress).toBeCloseTo(120);
  });

  it("ignores jumps too large to be driven in one step", () => {
    const L = circle.length;
    expect(advanceProgress({ s: 100, progress: 100 }, 900, L, 50).progress).toBe(100);
  });
});

describe("gridSlots", () => {
  it("lines cars up on the road behind the start, facing forward", () => {
    const slots = gridSlots(circle, 6);
    expect(slots).toHaveLength(6);
    for (const slot of slots) {
      expect(isOnRoad(circle, slot.x, slot.y)).toBe(true);
      expect(nearestOnTrack(circle, slot.x, slot.y).s).toBeGreaterThan(circle.length - 400);
    }
    const keys = new Set(slots.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`));
    expect(keys.size).toBe(6);
  });
});
