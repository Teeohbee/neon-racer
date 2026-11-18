import { describe, expect, it } from "vitest";
import { carInputFromPad, isHeld } from "../src/controller/pad";
import { combinePadSources, keyboardPad } from "../src/controller/keyboard-pad";
import { emptyPad } from "../src/controller/pad";

describe("keyboard as a controller", () => {
  it("drives like the keyboard does outside Local play", () => {
    expect(carInputFromPad(keyboardPad(new Set(["KeyW", "KeyA", "ShiftLeft"])))).toEqual({ throttle: true, brake: false, left: true, right: false, handbrake: true });
    expect(carInputFromPad(keyboardPad(new Set(["ArrowDown", "ArrowRight"])))).toEqual({ throttle: false, brake: true, left: false, right: true, handbrake: false });
  });

  it("joins with Shift, leaves with Escape, and starts or pauses with Enter", () => {
    expect(isHeld(keyboardPad(new Set(["ShiftRight"])), "a")).toBe(true);
    expect(isHeld(keyboardPad(new Set(["Escape"])), "b")).toBe(true);
    expect(isHeld(keyboardPad(new Set(["Enter"])), "start")).toBe(true);
  });

  it("cycles hazards with Q and E and emotes with 4-7 like the d-pad", () => {
    const pad = keyboardPad(new Set(["KeyQ", "KeyE", "Digit4", "Digit7"]));
    expect(["leftBumper", "rightBumper", "dpadUp", "dpadLeft", "dpadDown"].map((b) => isHeld(pad, b as never))).toEqual([true, true, true, true, false]);
  });

  it("moves a hazard cursor with the same keys that steer", () => {
    expect(keyboardPad(new Set(["KeyD", "KeyS"])).axes.slice(0, 2)).toEqual([1, 1]);
  });

  it("merges several sources into one set of controllers", () => {
    const merged = combinePadSources(() => new Map([["pad-0", emptyPad()]]), () => new Map([["keyboard", emptyPad()]]));
    expect([...merged().keys()]).toEqual(["pad-0", "keyboard"]);
  });
});
