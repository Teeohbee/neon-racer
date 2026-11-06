import { describe, expect, it } from "vitest";
import { countdownLabel } from "../src/ui/countdown";

describe("countdownLabel", () => {
  it("counts whole seconds down from the top", () => {
    expect(countdownLabel(3)).toBe("3");
    expect(countdownLabel(2.4)).toBe("3");
    expect(countdownLabel(2)).toBe("2");
    expect(countdownLabel(0.01)).toBe("1");
  });

  it("says GO once time is up", () => {
    expect(countdownLabel(0)).toBe("GO");
    expect(countdownLabel(-0.5)).toBe("GO");
  });
});
