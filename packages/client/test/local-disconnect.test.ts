import { describe, expect, it } from "vitest";
import { localRig } from "./local-helpers";

function racing() {
  const r = localRig();
  r.press("pad-0", "a");
  r.press("pad-1", "a");
  r.press("pad-0", "start");
  r.tick(4, () => r.phase() === "race");
  return r;
}

describe("Local play controller disconnects", () => {
  it("keeps the Seat when its controller drops mid-race, with a notice naming the Seat", () => {
    const r = racing();
    r.unplug("pad-1");
    expect(r.match.seats.map((s) => s.controllerId)).toEqual(["pad-0", null]);
    expect(r.notices.at(-1)).toMatchObject({ kind: "disconnected", seat: { number: 2 } });
    expect(r.room()!.players).toHaveLength(2);
  });

  it("lets the car of a disconnected Seat coast instead of keeping its last input", () => {
    const r = racing();
    r.hold("pad-1", "rightTrigger");
    r.tick(0.5);
    r.unplug("pad-1");
    const speed = () => {
      const car = r.lastSnap()!.cars.find((c) => c.id === r.match.seats[1]!.playerId)!;
      return Math.hypot(car.vx, car.vy);
    };
    r.tick(0.2);
    const before = speed();
    r.tick(0.5);
    expect(speed()).toBeLessThan(before);
  });

  it("gives an orphaned Seat to the next unbound controller that connects", () => {
    const r = racing();
    r.unplug("pad-1");
    r.connect("pad-3");
    expect(r.match.seats.map((s) => s.controllerId)).toEqual(["pad-0", "pad-3"]);
    expect(r.notices.at(-1)).toMatchObject({ kind: "reclaimed", seat: { number: 2, controllerId: "pad-3" } });
  });

  it("frees the Seat when its controller drops in the lobby", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-1", "a");
    r.unplug("pad-0");
    expect(r.match.seats.map((s) => s.controllerId)).toEqual(["pad-1"]);
    expect(r.match.hostSeat()?.controllerId).toBe("pad-1");
  });
});
