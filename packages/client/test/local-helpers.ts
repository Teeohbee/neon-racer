import type { ServerMsg } from "@neon/sim";
import { BUTTON, emptyPad, type ButtonName, type PadSnapshot } from "../src/controller/pad";
import { createControllerPoller } from "../src/controller/poller";
import { LocalMatch } from "../src/local/local-match";

export function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** A Local play match driven by fake controllers, one fixed tick at a time. */
export function localRig() {
  const pads = new Map<string, PadSnapshot>();
  const poller = createControllerPoller(() => new Map([...pads].map(([id, pad]) => [id, { buttons: [...pad.buttons], axes: [...pad.axes] }])));
  const messages: ServerMsg[] = [];
  const match = new LocalMatch({ rng: seededRng(7), onMessage: (msg) => messages.push(msg) });
  const notices: ReturnType<LocalMatch["controllers"]> = [];

  const frame = () => notices.push(...match.controllers(poller.poll()));
  const pad = (id: string) => pads.get(id) ?? pads.set(id, emptyPad()).get(id)!;
  const hold = (id: string, ...buttons: ButtonName[]) => {
    for (const b of buttons) pad(id).buttons[BUTTON[b]] = 1;
  };
  const release = (id: string, ...buttons: ButtonName[]) => {
    for (const b of buttons) pad(id).buttons[BUTTON[b]] = 0;
  };
  const press = (id: string, button: ButtonName) => {
    hold(id, button);
    frame();
    release(id, button);
    frame();
  };
  const stick = (id: string, x: number, y: number) => {
    pad(id).axes[0] = x;
    pad(id).axes[1] = y;
  };
  const connect = (id: string) => {
    pad(id);
    frame();
  };
  const unplug = (id: string) => {
    pads.delete(id);
    frame();
  };
  const tick = (seconds: number, until?: () => boolean) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      frame();
      match.step(1 / 60);
      if (until?.()) return true;
    }
    return false;
  };
  const room = () => match.room();
  const phase = () => match.room()?.phase;
  const lastSnap = () => [...messages].reverse().find((m): m is Extract<ServerMsg, { t: "snap" }> => m.t === "snap");
  const events = () => messages.flatMap((m) => (m.t === "event" ? [m.event] : []));

  return { match, pads, messages, notices, frame, hold, release, press, stick, connect, unplug, tick, room, phase, lastSnap, events };
}
