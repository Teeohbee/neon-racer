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

describe("Local play pause", () => {
  it("pauses on Start from any Seat and stops the Room", () => {
    const r = racing();
    r.press("pad-1", "start");
    expect(r.match.pausedBy()?.number).toBe(2);
    const tick = r.lastSnap()!.tick;
    r.tick(1);
    expect(r.lastSnap()!.tick).toBe(tick);
  });

  it("lets only the pauser's controller drive the pause menu", () => {
    const r = racing();
    r.press("pad-1", "start");
    const drives = r.match.menuControllers();
    expect(["pad-0", "pad-1"].map(drives)).toEqual([false, true]);
  });

  it("hands the pause menu to any controller when the pauser's controller drops", () => {
    const r = racing();
    r.connect("pad-4");
    r.press("pad-1", "start");
    r.unplug("pad-1");
    const drives = r.match.menuControllers();
    expect(["pad-0", "pad-4"].map(drives)).toEqual([true, true]);
  });

  it("resumes on Start or B from the pauser, and on resume() from the menu", () => {
    const r = racing();
    r.press("pad-0", "start");
    r.press("pad-1", "start");
    expect(r.match.pausedBy()?.number).toBe(1);
    r.press("pad-0", "b");
    expect(r.match.pausedBy()).toBeUndefined();
    r.press("pad-0", "start");
    r.press("pad-0", "start");
    expect(r.match.pausedBy()).toBeUndefined();
    r.press("pad-1", "start");
    r.match.resume();
    const tick = r.lastSnap()!.tick;
    r.tick(0.2);
    expect(r.lastSnap()!.tick).toBeGreaterThan(tick);
  });

  it("does not pause in the lobby", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-0", "start");
    expect(r.match.pausedBy()).toBeUndefined();
  });

  it("goes back to the lobby keeping the Seats, their controllers and the settings", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-1", "a");
    r.match.asHost({ t: "cup", legs: 3 });
    r.match.asHost({ t: "addBot", skill: "hard" });
    r.press("pad-0", "start");
    r.tick(4, () => r.phase() === "race");
    r.press("pad-1", "start");
    r.match.backToLobby();
    expect(r.phase()).toBe("lobby");
    expect(r.match.pausedBy()).toBeUndefined();
    expect(r.match.seats.map((s) => [s.controllerId, s.name])).toEqual([
      ["pad-0", "Cyan"],
      ["pad-1", "Pink"],
    ]);
    expect(r.match.hostSeat()?.controllerId).toBe("pad-0");
    expect(r.room()!.cup).toBe(3);
    expect(r.room()!.players.map((p) => p.name)).toEqual(["Cyan", "Pink", expect.stringContaining("(hard)")]);
  });
});
