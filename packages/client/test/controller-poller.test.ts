import { describe, expect, it } from "vitest";
import { BUTTON } from "../src/controller/pad";
import { browserGamepads, createControllerPoller } from "../src/controller/poller";

type FakePad = { index: number; connected: boolean; buttons: { pressed: boolean; value: number }[]; axes: number[] };

function fakePad(index: number, held: number[] = [], axes: number[] = [0, 0, 0, 0]): FakePad {
  return { index, connected: true, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 })), axes };
}

function fakeNavigator() {
  const slots: (FakePad | null)[] = [null, null, null, null];
  return { slots, getGamepads: () => slots as unknown as (Gamepad | null)[] };
}

describe("controller poller", () => {
  it("reports a pad once when it connects and once when it disconnects", () => {
    const nav = fakeNavigator();
    const poller = createControllerPoller(browserGamepads(nav.getGamepads));
    expect(poller.poll().connected).toEqual([]);

    nav.slots[1] = fakePad(1);
    expect(poller.poll().connected).toEqual(["pad-1"]);
    expect(poller.poll().connected).toEqual([]);

    nav.slots[1] = null;
    const frame = poller.poll();
    expect(frame.disconnected).toEqual(["pad-1"]);
    expect(frame.pads.has("pad-1")).toBe(false);
    expect(poller.poll().disconnected).toEqual([]);
  });

  it("treats a pad the browser marks as not connected as gone", () => {
    const nav = fakeNavigator();
    const poller = createControllerPoller(browserGamepads(nav.getGamepads));
    nav.slots[0] = fakePad(0);
    poller.poll();
    nav.slots[0] = { ...fakePad(0), connected: false };
    expect(poller.poll().disconnected).toEqual(["pad-0"]);
  });

  it("tracks several pads by index", () => {
    const nav = fakeNavigator();
    const poller = createControllerPoller(browserGamepads(nav.getGamepads));
    nav.slots[0] = fakePad(0, [BUTTON.a]);
    nav.slots[2] = fakePad(2, [], [0.8, 0, 0, 0]);
    const frame = poller.poll();
    expect([...frame.pads.keys()].sort()).toEqual(["pad-0", "pad-2"]);
    expect(frame.pads.get("pad-0")!.buttons[BUTTON.a]).toBe(1);
    expect(frame.pads.get("pad-2")!.axes[0]).toBe(0.8);
  });

  it("reports a button as pressed only on the frame it goes down", () => {
    const nav = fakeNavigator();
    const poller = createControllerPoller(browserGamepads(nav.getGamepads));
    nav.slots[0] = fakePad(0);
    expect(poller.poll().pressed("pad-0", "a")).toBe(false);

    nav.slots[0] = fakePad(0, [BUTTON.a]);
    expect(poller.poll().pressed("pad-0", "a")).toBe(true);
    expect(poller.poll().pressed("pad-0", "a")).toBe(false);

    nav.slots[0] = fakePad(0);
    poller.poll();
    nav.slots[0] = fakePad(0, [BUTTON.a]);
    expect(poller.poll().pressed("pad-0", "a")).toBe(true);
  });

  it("counts a button already held when the pad connects as pressed", () => {
    const nav = fakeNavigator();
    const poller = createControllerPoller(browserGamepads(nav.getGamepads));
    nav.slots[3] = fakePad(3, [BUTTON.start]);
    expect(poller.poll().pressed("pad-3", "start")).toBe(true);
  });

  it("answers false for pads it does not know", () => {
    const poller = createControllerPoller(() => new Map());
    expect(poller.poll().pressed("pad-9", "a")).toBe(false);
  });

  it("survives a browser without the Gamepad API", () => {
    const poller = createControllerPoller(browserGamepads(undefined));
    expect(poller.poll().pads.size).toBe(0);
  });
});
