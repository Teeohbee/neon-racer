import { describe, expect, it } from "vitest";
import { localRig } from "./local-helpers";

describe("Local play seats", () => {
  it("has an empty lobby to show before anyone has joined", () => {
    const r = localRig();
    expect(r.room()).toMatchObject({ phase: "lobby", players: [], hostId: null, mode: "contact" });
    expect(r.room()!.tracks.length).toBeGreaterThan(0);
  });

  it("has an empty lobby to show after going back to it with no Seats", () => {
    const r = localRig();
    r.match.backToLobby();
    expect(r.room()).toMatchObject({ phase: "lobby", players: [] });
  });

  it("gives an unbound controller the next Seat when it presses A, named by its car colour", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-2", "a");
    expect(r.match.seats.map((s) => [s.number, s.controllerId, s.name])).toEqual([
      [1, "pad-0", "Cyan"],
      [2, "pad-2", "Pink"],
    ]);
    expect(r.room()!.players.map((p) => p.name)).toEqual(["Cyan", "Pink"]);
  });

  it("does not give a controller a second Seat", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-0", "a");
    expect(r.match.seats).toHaveLength(1);
  });

  it("makes the first Seat the Host, and passes Host on when it leaves with B", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-1", "a");
    expect(r.match.hostSeat()?.controllerId).toBe("pad-0");
    r.press("pad-0", "b");
    expect(r.match.seats.map((s) => s.controllerId)).toEqual(["pad-1"]);
    expect(r.match.hostSeat()?.controllerId).toBe("pad-1");
  });

  it("names a new Seat after the colour left free by a Seat that left", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-1", "a");
    r.press("pad-0", "b");
    r.press("pad-3", "a");
    expect(r.match.seats.map((s) => s.name)).toEqual(["Pink", "Cyan"]);
  });

  it("stops at six Seats", () => {
    const r = localRig();
    for (let i = 0; i < 7; i++) r.press(`pad-${i}`, "a");
    expect(r.match.seats).toHaveLength(6);
  });

  it("only lets the Host's controller drive the lobby's settings", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-1", "a");
    const drives = r.match.menuControllers();
    expect(["pad-0", "pad-1", "pad-5"].map(drives)).toEqual([true, false, false]);
    r.match.asHost({ t: "cup", legs: 3 });
    r.match.asHost({ t: "addBot", skill: "easy" });
    expect(r.room()!.cup).toBe(3);
    expect(r.room()!.players.filter((p) => p.bot)).toHaveLength(1);
  });
});

describe("Local play match", () => {
  it("starts when the Host presses Start, readying every Seat, and always plays Contact", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-1", "a");
    r.press("pad-1", "start");
    expect(r.phase()).toBe("lobby");
    r.press("pad-0", "start");
    expect(r.phase()).toBe("countdown");
    expect(r.room()!.mode).toBe("contact");
  });

  it("needs a second racer, Seat or bot, before it starts", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-0", "start");
    expect(r.phase()).toBe("lobby");
    expect(r.notices.at(-1)).toEqual({ kind: "needsRacers" });
    r.match.asHost({ t: "addBot", skill: "easy" });
    r.press("pad-0", "start");
    expect(r.phase()).toBe("countdown");
  });

  it("drives each Seat's car from its own controller", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-1", "a");
    r.press("pad-0", "start");
    r.tick(3.1, () => r.phase() === "race");
    const start = Object.fromEntries(r.lastSnap()!.cars.map((c) => [c.id, c]));
    r.hold("pad-0", "rightTrigger");
    r.tick(0.5);
    const after = Object.fromEntries(r.lastSnap()!.cars.map((c) => [c.id, c]));
    const moved = (id: string) => Math.hypot(after[id]!.x - start[id]!.x, after[id]!.y - start[id]!.y);
    const [first, second] = r.match.seats.map((s) => s.playerId);
    expect(moved(first!)).toBeGreaterThan(50);
    expect(moved(second!)).toBeLessThan(5);
  });

  it("plays a whole round to its results", () => {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-1", "a");
    r.press("pad-0", "start");
    r.hold("pad-0", "rightTrigger");
    expect(r.tick(120, () => r.phase() === "roundEnd")).toBe(true);
    expect(r.events().some((e) => e.kind === "roundWon")).toBe(true);
  });
});

describe("Local play match end", () => {
  function toMatchEnd() {
    const r = localRig();
    r.press("pad-0", "a");
    r.press("pad-1", "a");
    r.match.asHost({ t: "winCondition", kind: "score", target: 5 });
    r.match.asHost({ t: "addBot", skill: "hard" });
    r.press("pad-0", "start");
    if (!r.tick(600, () => r.phase() === "matchEnd")) throw new Error("the match never ended");
    return r;
  }

  it("lets any Seat's controller drive the podium", () => {
    const r = toMatchEnd();
    const drives = r.match.menuControllers();
    expect(["pad-0", "pad-1", "pad-7"].map(drives)).toEqual([true, true, false]);
  });

  it("starts a rematch for every Seat at once", () => {
    const r = toMatchEnd();
    r.match.asEverySeat({ t: "rematch", in: true });
    expect(r.phase()).toBe("countdown");
  });

  it("goes back to the lobby when the Host changes settings", () => {
    const r = toMatchEnd();
    r.match.asHost({ t: "again" });
    expect(r.phase()).toBe("lobby");
    expect(r.match.seats).toHaveLength(2);
  });
});
