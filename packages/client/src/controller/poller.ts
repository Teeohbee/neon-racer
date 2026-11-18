import { emptyPad, isHeld, snapshotOf, type ButtonName, type PadSnapshot } from "./pad";

/** Reads every controller that is connected right now, keyed by a stable controller id. */
export type PadSource = () => Map<string, PadSnapshot>;

export interface ControllerFrame {
  pads: Map<string, PadSnapshot>;
  connected: string[];
  disconnected: string[];
  /** True only on the frame the button went down. */
  pressed(controllerId: string, button: ButtonName): boolean;
}

export interface ControllerPoller {
  poll(): ControllerFrame;
}

type GetGamepads = () => (Gamepad | null)[];

export const controllerIdOf = (index: number) => `pad-${index}`;

export function browserGamepads(getGamepads: GetGamepads | undefined = navigatorGamepads()): PadSource {
  return () => {
    const pads = new Map<string, PadSnapshot>();
    for (const gamepad of getGamepads?.() ?? []) {
      if (gamepad?.connected) pads.set(controllerIdOf(gamepad.index), snapshotOf(gamepad));
    }
    return pads;
  };
}

function navigatorGamepads(): GetGamepads | undefined {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return undefined;
  return () => navigator.getGamepads();
}

export function createControllerPoller(source: PadSource): ControllerPoller {
  let previous = new Map<string, PadSnapshot>();

  return {
    poll() {
      const pads = source();
      const connected = [...pads.keys()].filter((id) => !previous.has(id));
      const disconnected = [...previous.keys()].filter((id) => !pads.has(id));
      const before = previous;
      previous = pads;
      return {
        pads,
        connected,
        disconnected,
        pressed(controllerId, button) {
          const now = pads.get(controllerId);
          if (!now || !isHeld(now, button)) return false;
          return !isHeld(before.get(controllerId) ?? emptyPad(), button);
        },
      };
    },
  };
}
