import { describe, expect, it } from "vitest";
import { anyInput, BUTTON, carInputFromPad, emptyPad, type PadSnapshot } from "../src/controller/pad";

function pad(changes: { buttons?: Partial<Record<keyof typeof BUTTON, number>>; leftStickX?: number; leftStickY?: number } = {}): PadSnapshot {
  const snapshot = emptyPad();
  for (const [name, value] of Object.entries(changes.buttons ?? {})) snapshot.buttons[BUTTON[name as keyof typeof BUTTON]] = value;
  snapshot.axes[0] = changes.leftStickX ?? 0;
  snapshot.axes[1] = changes.leftStickY ?? 0;
  return snapshot;
}

describe("carInputFromPad", () => {
  it("does nothing when the pad is at rest", () => {
    expect(carInputFromPad(pad())).toEqual({ throttle: false, brake: false, left: false, right: false, handbrake: false });
  });

  it("throttles on the right trigger and brakes on the left trigger", () => {
    expect(carInputFromPad(pad({ buttons: { rightTrigger: 1 } }))).toMatchObject({ throttle: true, brake: false });
    expect(carInputFromPad(pad({ buttons: { leftTrigger: 1 } }))).toMatchObject({ throttle: false, brake: true });
  });

  it("ignores a trigger that is only resting lightly", () => {
    expect(carInputFromPad(pad({ buttons: { rightTrigger: 0.1 } })).throttle).toBe(false);
    expect(carInputFromPad(pad({ buttons: { rightTrigger: 0.5 } })).throttle).toBe(true);
  });

  it("steers when the left stick is pushed past the deadzone", () => {
    expect(carInputFromPad(pad({ leftStickX: -0.6 }))).toMatchObject({ left: true, right: false });
    expect(carInputFromPad(pad({ leftStickX: 0.6 }))).toMatchObject({ left: false, right: true });
  });

  it("does not steer when the left stick is inside the deadzone", () => {
    expect(carInputFromPad(pad({ leftStickX: 0.39 }))).toMatchObject({ left: false, right: false });
    expect(carInputFromPad(pad({ leftStickX: -0.39 }))).toMatchObject({ left: false, right: false });
  });

  it("steers with the d-pad", () => {
    expect(carInputFromPad(pad({ buttons: { dpadLeft: 1 } }))).toMatchObject({ left: true, right: false });
    expect(carInputFromPad(pad({ buttons: { dpadRight: 1 } }))).toMatchObject({ left: false, right: true });
  });

  it("pulls the handbrake on A", () => {
    expect(carInputFromPad(pad({ buttons: { a: 1 } })).handbrake).toBe(true);
  });

  it("copes with a pad that reports fewer buttons and axes than the standard layout", () => {
    expect(carInputFromPad({ buttons: [1], axes: [] })).toEqual({ throttle: false, brake: false, left: false, right: false, handbrake: true });
  });
});

describe("anyInput", () => {
  it("presses whatever any of the inputs presses", () => {
    const none = carInputFromPad(pad());
    expect(anyInput([])).toEqual(none);
    expect(anyInput([{ ...none, throttle: true }, { ...none, left: true }, none])).toEqual({ ...none, throttle: true, left: true });
  });
});
