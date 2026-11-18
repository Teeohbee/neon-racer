import type { NavDir } from "../shell/focus-order";
import type { ControllerHub } from "./hub";
import { isHeld, leftStick, type PadSnapshot } from "./pad";
import type { ControllerFrame } from "./poller";

/**
 * Controllers drive the menus by feeding the existing keyboard navigation (keynav), so there is
 * one menu system: the d-pad or stick become arrow keys, A clicks the focused button, B is Escape.
 */

export type MenuAction = { kind: "move"; dir: NavDir } | { kind: "activate" } | { kind: "back" };

export const FIRST_REPEAT_MS = 400;
export const REPEAT_MS = 120;
const STICK_THRESHOLD = 0.5;

interface HeldDirection {
  dir: NavDir;
  nextAt: number;
  /** Held since before this controller was allowed to drive the menu, so it must be let go first. */
  stale: boolean;
}

function directionOf(pad: PadSnapshot): NavDir | null {
  if (isHeld(pad, "dpadUp")) return "up";
  if (isHeld(pad, "dpadDown")) return "down";
  if (isHeld(pad, "dpadLeft")) return "left";
  if (isHeld(pad, "dpadRight")) return "right";
  const { x, y } = leftStick(pad);
  if (Math.max(Math.abs(x), Math.abs(y)) < STICK_THRESHOLD) return null;
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? "left" : "right";
  return y < 0 ? "up" : "down";
}

export function createMenuReader() {
  const held = new Map<string, HeldDirection>();

  return {
    read(frame: ControllerFrame, nowMs: number, allowed: (controllerId: string) => boolean): MenuAction[] {
      const actions: MenuAction[] = [];
      for (const id of held.keys()) if (!frame.pads.has(id)) held.delete(id);
      for (const [id, pad] of frame.pads) {
        const dir = directionOf(pad);
        const previous = held.get(id);
        const canDrive = allowed(id);
        if (!dir) held.delete(id);
        else if (!previous || previous.dir !== dir) {
          held.set(id, { dir, nextAt: nowMs + FIRST_REPEAT_MS, stale: !canDrive });
          if (canDrive) actions.push({ kind: "move", dir });
        } else if (!previous.stale && canDrive && nowMs >= previous.nextAt) {
          previous.nextAt = nowMs + REPEAT_MS;
          actions.push({ kind: "move", dir });
        }
        if (!canDrive) continue;
        if (frame.pressed(id, "a")) actions.push({ kind: "activate" });
        if (frame.pressed(id, "b")) actions.push({ kind: "back" });
      }
      return actions;
    },
  };
}

const ARROW_KEYS: Record<NavDir, string> = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

function pressKey(key: string): void {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

export function applyMenuAction(action: MenuAction): void {
  const focused = document.activeElement;
  if (action.kind === "back") return pressKey("Escape");
  if (action.kind === "move") {
    if (focused instanceof HTMLInputElement && focused.type === "range" && (action.dir === "left" || action.dir === "right")) {
      if (action.dir === "left") focused.stepDown();
      else focused.stepUp();
      focused.dispatchEvent(new Event("input", { bubbles: true }));
      focused.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    return pressKey(ARROW_KEYS[action.dir]);
  }
  if (focused instanceof HTMLButtonElement) focused.click();
  else if (!focused || focused === document.body) pressKey(ARROW_KEYS.down);
}

/** Which controllers may drive the menus right now. Real keyboards drive keynav directly, so the keyboard controller never does. */
export type MenuControllers = (controllerId: string) => boolean;

export const KEYBOARD_CONTROLLER_ID = "keyboard";
const anyController: MenuControllers = (id) => id !== KEYBOARD_CONTROLLER_ID;

export interface ControllerMenus {
  /** Narrow which controllers drive the menus until the returned function is called. The latest restriction wins. */
  restrict(allowed: MenuControllers): () => void;
  dispose(): void;
}

export function bindControllerMenus(hub: ControllerHub): ControllerMenus {
  const reader = createMenuReader();
  const restrictions: MenuControllers[] = [];
  const current = () => restrictions[restrictions.length - 1] ?? anyController;
  const unsubscribe = hub.subscribe((frame, nowMs) => {
    const allowed = current();
    for (const action of reader.read(frame, nowMs, (id) => id !== KEYBOARD_CONTROLLER_ID && allowed(id))) applyMenuAction(action);
  });
  return {
    restrict(allowed) {
      restrictions.push(allowed);
      return () => {
        const at = restrictions.lastIndexOf(allowed);
        if (at >= 0) restrictions.splice(at, 1);
      };
    },
    dispose: unsubscribe,
  };
}

export const noController: MenuControllers = () => false;
