import { describe, expect, it } from "vitest";
import { PRESET_TRACKS } from "../src/tracks";
import { validateDrawing } from "../src/validate";

describe("preset tracks", () => {
  it("has ten uniquely named tracks", () => {
    expect(new Set(PRESET_TRACKS.map((t) => t.name)).size).toBe(10);
  });

  it.each(PRESET_TRACKS)("$name is a valid track", ({ points }) => {
    expect(validateDrawing(points)).toEqual([]);
  });
});
