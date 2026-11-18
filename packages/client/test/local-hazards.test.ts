import { describe, expect, it } from "vitest";
import { viewBounds } from "@neon/sim";
import { localRig } from "./local-helpers";

function knockedOut() {
  const r = localRig();
  r.press("pad-0", "a");
  r.press("pad-1", "a");
  r.press("pad-2", "a");
  r.press("pad-0", "start");
  r.hold("pad-0", "rightTrigger");
  const out = () => r.lastSnap()?.cars.some((c) => !c.alive) ?? false;
  r.tick(120, () => r.phase() === "race" && out());
  if (r.phase() !== "race") throw new Error("the round ended before anyone was knocked out");
  const loser = r.match.seats.find((s) => !r.lastSnap()!.cars.find((c) => c.id === s.playerId)!.alive)!;
  return { r, loser: loser.controllerId!, loserId: loser.playerId };
}

describe("Local play hazards and emotes", () => {
  it("gives a knocked-out Seat a cursor that the left stick moves inside the view", () => {
    const { r, loser } = knockedOut();
    const start = r.match.cursor(loser)!;
    r.stick(loser, 1, 0);
    r.tick(0.25);
    const moved = r.match.cursor(loser)!;
    expect(moved.x).toBeGreaterThan(start.x);
    r.tick(10);
    const bounds = viewBounds(r.lastSnap()!.camera);
    expect(r.match.cursor(loser)!.x).toBeLessThanOrEqual(bounds.right);
  });

  it("has no cursor for a Seat still racing", () => {
    const { r } = knockedOut();
    const racer = r.match.seats.find((s) => r.lastSnap()!.cars.find((c) => c.id === s.playerId)!.alive)!;
    expect(r.match.cursor(racer.controllerId!)).toBeNull();
  });

  it("cycles the hazard kind with the bumpers", () => {
    const { r, loser } = knockedOut();
    expect(r.match.cursor(loser)!.kind).toBe("block");
    r.press(loser, "rightBumper");
    expect(r.match.cursor(loser)!.kind).toBe("slow");
    r.press(loser, "leftBumper");
    r.press(loser, "leftBumper");
    expect(r.match.cursor(loser)!.kind).toBe("freeze");
  });

  it("places the chosen hazard at the cursor on A", () => {
    const { r, loser, loserId } = knockedOut();
    r.press(loser, "a");
    r.tick(0.1);
    expect(r.lastSnap()!.hazards.some((h) => h.owner === loserId && h.kind === "block")).toBe(true);
    expect(r.notices.at(-1)).toMatchObject({ kind: "hazard" });
  });

  it("sends an emote for each d-pad direction, in the order of keys 4-7", () => {
    const { r, loser, loserId } = knockedOut();
    for (const button of ["dpadUp", "dpadRight", "dpadDown", "dpadLeft"] as const) {
      r.press(loser, button);
      r.tick(0.2);
    }
    const emotes = r.events().flatMap((e) => (e.kind === "emote" && e.id === loserId ? [e.emote] : []));
    expect(emotes).toEqual(["fire", "lol", "scream", "wave"]);
  });
});
