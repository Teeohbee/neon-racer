import { describe, expect, it } from "vitest";
import { createMenuReader, FIRST_REPEAT_MS, REPEAT_MS } from "../src/controller/menu-bridge";
import { BUTTON, emptyPad, type PadSnapshot } from "../src/controller/pad";
import { createControllerPoller } from "../src/controller/poller";

function rig() {
  const pads = new Map<string, PadSnapshot>();
  const poller = createControllerPoller(() => new Map(pads));
  const reader = createMenuReader();
  const set = (id: string, change: (pad: PadSnapshot) => void = () => {}) => {
    const pad = emptyPad();
    change(pad);
    pads.set(id, pad);
  };
  const read = (now: number, allowed: (id: string) => boolean = () => true) => reader.read(poller.poll(), now, allowed);
  return { pads, set, read };
}

const hold = (...buttons: number[]) => (pad: PadSnapshot) => buttons.forEach((b) => (pad.buttons[b] = 1));
const stick = (x: number, y: number) => (pad: PadSnapshot) => {
  pad.axes[0] = x;
  pad.axes[1] = y;
};

describe("controller menu reader", () => {
  it("moves once when the d-pad is tapped", () => {
    const r = rig();
    r.set("pad-0");
    r.read(0);
    r.set("pad-0", hold(BUTTON.dpadDown));
    expect(r.read(16)).toEqual([{ kind: "move", dir: "down" }]);
    r.set("pad-0");
    expect(r.read(32)).toEqual([]);
  });

  it("repeats a held direction after a pause, then steadily", () => {
    const r = rig();
    r.set("pad-0", hold(BUTTON.dpadRight));
    expect(r.read(0)).toEqual([{ kind: "move", dir: "right" }]);
    expect(r.read(FIRST_REPEAT_MS - 1)).toEqual([]);
    expect(r.read(FIRST_REPEAT_MS)).toEqual([{ kind: "move", dir: "right" }]);
    expect(r.read(FIRST_REPEAT_MS + REPEAT_MS - 1)).toEqual([]);
    expect(r.read(FIRST_REPEAT_MS + REPEAT_MS)).toEqual([{ kind: "move", dir: "right" }]);
  });

  it("moves with the left stick past half way, along its strongest axis", () => {
    const r = rig();
    r.set("pad-0", stick(0.3, -0.9));
    expect(r.read(0)).toEqual([{ kind: "move", dir: "up" }]);
    r.set("pad-0", stick(0.2, 0.2));
    expect(r.read(16)).toEqual([]);
    r.set("pad-0", stick(-0.8, 0.6));
    expect(r.read(32)).toEqual([{ kind: "move", dir: "left" }]);
  });

  it("starts the repeat over when the direction changes", () => {
    const r = rig();
    r.set("pad-0", hold(BUTTON.dpadDown));
    r.read(0);
    r.set("pad-0", hold(BUTTON.dpadUp));
    expect(r.read(100)).toEqual([{ kind: "move", dir: "up" }]);
    expect(r.read(100 + REPEAT_MS)).toEqual([]);
  });

  it("activates on A and goes back on B, once per press", () => {
    const r = rig();
    r.set("pad-0", hold(BUTTON.a));
    expect(r.read(0)).toEqual([{ kind: "activate" }]);
    expect(r.read(16)).toEqual([]);
    r.set("pad-0", hold(BUTTON.b));
    expect(r.read(32)).toEqual([{ kind: "back" }]);
  });

  it("only listens to the controllers it is allowed to", () => {
    const r = rig();
    r.set("pad-0", hold(BUTTON.a));
    r.set("pad-1", hold(BUTTON.dpadDown));
    expect(r.read(0, (id) => id === "pad-1")).toEqual([{ kind: "move", dir: "down" }]);
  });

  it("ignores a direction held from before the controller was allowed until it is let go", () => {
    const r = rig();
    r.set("pad-0", hold(BUTTON.dpadDown));
    expect(r.read(0, () => false)).toEqual([]);
    expect(r.read(16)).toEqual([]);
    expect(r.read(16 + FIRST_REPEAT_MS)).toEqual([]);
    r.set("pad-0");
    r.read(1000);
    r.set("pad-0", hold(BUTTON.dpadDown));
    expect(r.read(1016)).toEqual([{ kind: "move", dir: "down" }]);
  });
});
