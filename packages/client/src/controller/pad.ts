import type { CarInput } from "@neon/sim";

/**
 * Button indices in the browser's "standard" gamepad layout, which is what Steam Input presents
 * (an Xbox-style pad) whatever controller is really plugged in.
 */
export const BUTTON = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  leftBumper: 4,
  rightBumper: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  select: 8,
  start: 9,
  leftStick: 10,
  rightStick: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export type ButtonName = keyof typeof BUTTON;

const BUTTON_COUNT = 17;
const LEFT_STICK_X = 0;
const LEFT_STICK_Y = 1;

export const STEER_DEADZONE = 0.4;
export const TRIGGER_THRESHOLD = 0.25;
export const BUTTON_THRESHOLD = 0.5;

/** One moment of a controller: every button's value from 0 to 1, and every axis from -1 to 1. */
export interface PadSnapshot {
  buttons: number[];
  axes: number[];
}

export function emptyPad(): PadSnapshot {
  return { buttons: Array<number>(BUTTON_COUNT).fill(0), axes: [0, 0, 0, 0] };
}

export function snapshotOf(gamepad: Pick<Gamepad, "buttons" | "axes">): PadSnapshot {
  return {
    buttons: [...gamepad.buttons].map((button) => (button.pressed ? Math.max(button.value, BUTTON_THRESHOLD) : button.value)),
    axes: [...gamepad.axes],
  };
}

export function buttonValue(pad: PadSnapshot, name: ButtonName): number {
  return pad.buttons[BUTTON[name]] ?? 0;
}

export function isHeld(pad: PadSnapshot, name: ButtonName): boolean {
  const threshold = name === "leftTrigger" || name === "rightTrigger" ? TRIGGER_THRESHOLD : BUTTON_THRESHOLD;
  return buttonValue(pad, name) >= threshold;
}

export function leftStick(pad: PadSnapshot): { x: number; y: number } {
  return { x: pad.axes[LEFT_STICK_X] ?? 0, y: pad.axes[LEFT_STICK_Y] ?? 0 };
}

export function carInputFromPad(pad: PadSnapshot): CarInput {
  const stick = leftStick(pad);
  return {
    throttle: isHeld(pad, "rightTrigger"),
    brake: isHeld(pad, "leftTrigger"),
    left: isHeld(pad, "dpadLeft") || stick.x <= -STEER_DEADZONE,
    right: isHeld(pad, "dpadRight") || stick.x >= STEER_DEADZONE,
    handbrake: isHeld(pad, "a"),
  };
}

/** One car driven from several places at once, like the keyboard and any controller in Practice. */
export function anyInput(inputs: CarInput[]): CarInput {
  return {
    throttle: inputs.some((i) => i.throttle),
    brake: inputs.some((i) => i.brake),
    left: inputs.some((i) => i.left),
    right: inputs.some((i) => i.right),
    handbrake: inputs.some((i) => i.handbrake),
  };
}
