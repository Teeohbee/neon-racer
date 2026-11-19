import { describe, expect, it } from "vitest";
import { GLYPH_NAMES, glyphLabel, glyphSvg } from "../src/controller/glyphs";

describe("controller glyphs", () => {
  it("draws every glyph as a labelled SVG", () => {
    for (const name of GLYPH_NAMES) {
      const svg = glyphSvg(name);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain(`aria-label="${glyphLabel(name)}"`);
    }
  });

  it("uses Steam Deck names for the shoulder buttons and menu buttons", () => {
    expect(glyphLabel("leftBumper")).toBe("L1");
    expect(glyphLabel("rightTrigger")).toBe("R2");
    expect(glyphLabel("start")).toBe("Menu");
    expect(glyphLabel("select")).toBe("View");
  });

  it("highlights the pressed arm of the d-pad", () => {
    expect(glyphSvg("dpadUp")).not.toBe(glyphSvg("dpadDown"));
    expect(glyphSvg("dpad")).not.toBe(glyphSvg("dpadUp"));
  });
});
