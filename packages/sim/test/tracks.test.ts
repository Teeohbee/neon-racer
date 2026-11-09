import { describe, expect, it } from "vitest";
import { boostAt, bridgeAt, buildTrack, crossings, dropAt, gridSlots, nearestOnTrack, type Track } from "../src/track";
import { PRESET_TRACKS } from "../src/tracks";
import { validateDrawing } from "../src/validate";

describe("preset tracks", () => {
  it("has twelve uniquely named tracks", () => {
    expect(PRESET_TRACKS).toHaveLength(12);
    expect(new Set(PRESET_TRACKS.map((t) => t.name)).size).toBe(12);
  });

  it("includes two tracks that cross themselves", () => {
    const crossing = PRESET_TRACKS.filter(({ points, features }) => crossings(buildTrack(points, features)).length > 0).map((t) => t.name);
    expect(crossing).toEqual(["Interchange", "Pretzel"]);
  });

  it("no longer includes Clover", () => {
    expect(PRESET_TRACKS.map((t) => t.name)).not.toContain("Clover");
  });

  it.each(PRESET_TRACKS)("$name is a valid track, only overlapping itself where it bridges", ({ points, features }) => {
    const bridged = features.some((f) => f.kind === "bridge");
    expect(validateDrawing(points)).toEqual(bridged ? ["overlapping"] : []);
  });

  const gap = (track: Track, a: number, b: number) => {
    const d = Math.abs(a - b) % track.length;
    return Math.min(d, track.length - d);
  };

  it.each(PRESET_TRACKS)("$name crosses itself only at steep angles, with one pass bridged", ({ points, features }) => {
    const track = buildTrack(points, features);
    for (const c of crossings(track)) {
      expect(c.angle).toBeGreaterThan(Math.PI / 3);
      expect([bridgeAt(track, c.a), bridgeAt(track, c.b)].filter(Boolean)).toHaveLength(1);
    }
    expect(track.bridges).toHaveLength(crossings(track).length);
  });

  it.each(PRESET_TRACKS)("$name keeps drops, boosts and the grid clear of crossings and bridges", ({ points, features }) => {
    const track = buildTrack(points, features);
    const passes = crossings(track).flatMap((c) => [c.a, c.b]);
    const clear = (s: number) => !bridgeAt(track, s) && passes.every((p) => gap(track, p, s) > 600);
    for (let s = 0; s < track.length; s += 20) {
      if (dropAt(track, s) || boostAt(track, s)) expect(clear(s)).toBe(true);
    }
    for (const slot of gridSlots(track, 6)) expect(clear(slot.s)).toBe(true);
    expect(clear(0)).toBe(true);
  });

  it.each(PRESET_TRACKS)("$name has drops and boosts anchored on the road", ({ points, features }) => {
    const track = buildTrack(points);
    expect(features.some((f) => f.kind === "drop")).toBe(true);
    expect(features.some((f) => f.kind === "boost")).toBe(true);
    for (const f of features) expect(nearestOnTrack(track, f.at[0], f.at[1]).dist).toBeLessThan(50);
  });

  it.each(PRESET_TRACKS)("$name starts its grid on solid ground", ({ points, features }) => {
    const track = buildTrack(points, features);
    for (const slot of gridSlots(track, 6)) expect(dropAt(track, nearestOnTrack(track, slot.x, slot.y).s)).toBe(false);
    expect(dropAt(track, 0)).toBe(false);
  });
});
