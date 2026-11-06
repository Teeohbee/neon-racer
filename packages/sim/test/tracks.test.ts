import { describe, expect, it } from "vitest";
import { buildTrack, dropAt, gridSlots, nearestOnTrack } from "../src/track";
import { PRESET_TRACKS } from "../src/tracks";
import { validateDrawing } from "../src/validate";

describe("preset tracks", () => {
  it("has ten uniquely named tracks", () => {
    expect(PRESET_TRACKS).toHaveLength(10);
    expect(new Set(PRESET_TRACKS.map((t) => t.name)).size).toBe(10);
  });

  it("no longer includes Clover", () => {
    expect(PRESET_TRACKS.map((t) => t.name)).not.toContain("Clover");
  });

  it.each(PRESET_TRACKS)("$name is a valid track", ({ points }) => {
    expect(validateDrawing(points)).toEqual([]);
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
