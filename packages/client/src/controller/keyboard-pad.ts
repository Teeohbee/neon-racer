import { isTyping } from "../input";
import { BUTTON, emptyPad, type ButtonName, type PadSnapshot } from "./pad";
import type { PadSource } from "./poller";
import { KEYBOARD_CONTROLLER_ID } from "./menu-bridge";

/**
 * The keyboard dressed up as a controller, so Local play can be tried on a laptop. Development
 * builds only: Local play is for controllers.
 */

const KEY_BUTTONS: Record<string, ButtonName[]> = {
  KeyW: ["rightTrigger"],
  ArrowUp: ["rightTrigger"],
  KeyS: ["leftTrigger"],
  ArrowDown: ["leftTrigger"],
  ShiftLeft: ["a"],
  ShiftRight: ["a"],
  Escape: ["b"],
  Enter: ["start"],
  KeyQ: ["leftBumper"],
  KeyE: ["rightBumper"],
  KeyR: ["select"],
  KeyN: ["y"],
  Digit4: ["dpadUp"],
  Digit5: ["dpadRight"],
  Digit6: ["dpadDown"],
  Digit7: ["dpadLeft"],
};

const KEY_STICK: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function keyboardPad(held: ReadonlySet<string>): PadSnapshot {
  const pad = emptyPad();
  let x = 0;
  let y = 0;
  for (const code of held) {
    for (const button of KEY_BUTTONS[code] ?? []) pad.buttons[BUTTON[button]] = 1;
    const [dx, dy] = KEY_STICK[code] ?? [0, 0];
    x += dx;
    y += dy;
  }
  pad.axes[0] = Math.max(-1, Math.min(1, x));
  pad.axes[1] = Math.max(-1, Math.min(1, y));
  return pad;
}

export function keyboardPadSource(): PadSource {
  const held = new Set<string>();
  window.addEventListener("keydown", (e) => {
    if (!isTyping(e.target)) held.add(e.code);
  });
  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => held.clear());
  return () => new Map([[KEYBOARD_CONTROLLER_ID, keyboardPad(held)]]);
}

export function combinePadSources(...sources: PadSource[]): PadSource {
  return () => new Map(sources.flatMap((source) => [...source()]));
}
