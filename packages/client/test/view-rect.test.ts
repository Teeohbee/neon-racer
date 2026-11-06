import { describe, expect, it } from "vitest";
import { viewRect } from "../src/view-rect";

describe("viewRect", () => {
  it("pillarboxes a wide window", () => {
    expect(viewRect(2000, 900)).toEqual({ x: 280, y: 0, w: 1440, h: 900, base: 0.9 });
  });

  it("letterboxes a tall window", () => {
    expect(viewRect(800, 1000)).toEqual({ x: 0, y: 250, w: 800, h: 500, base: 0.5 });
  });
});
