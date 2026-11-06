import { describe, expect, it } from "vitest";
import { HAZARD_SPECS, hazardSpeedFactor, isFrozen, placeHazard, pushOutOfBlocks, type Hazard } from "../src/hazards";

const make = (kind: Hazard["kind"], overrides: Partial<Hazard> = {}): Hazard => ({
  id: 1, kind, x: 0, y: 0, radius: HAZARD_SPECS[kind].radius, owner: "ghost", armsAt: 1, expiresAt: 5, ...overrides,
});

describe("hazards", () => {
  it("only take effect once armed and until expired", () => {
    const slow = make("slow");
    expect(hazardSpeedFactor([slow], 0, 0, 0.5)).toBe(1);
    expect(hazardSpeedFactor([slow], 0, 0, 2)).toBeLessThan(1);
    expect(hazardSpeedFactor([slow], 0, 0, 6)).toBe(1);
  });

  it("slow zones only affect cars inside them", () => {
    expect(hazardSpeedFactor([make("slow")], 500, 0, 2)).toBe(1);
  });

  it("blocks push cars out and bounce them back", () => {
    const { car, hit } = pushOutOfBlocks({ x: 50, y: 0, angle: Math.PI, vx: -300, vy: 0 }, [make("block")], 2);
    expect(hit?.owner).toBe("ghost");
    expect(Math.hypot(car.x, car.y)).toBeGreaterThanOrEqual(HAZARD_SPECS.block.radius);
    expect(car.vx).toBeGreaterThan(0);
  });

  it("freeze targets the nearest car within reach", () => {
    const placed = placeHazard("freeze", 0, 0, "ghost", 0, 7, [
      { id: "far", x: 400, y: 0 },
      { id: "near", x: 60, y: 0 },
    ]);
    expect(placed?.targetId).toBe("near");
    expect(isFrozen("near", [placed!], placed!.armsAt + 0.1)).toBe(true);
    expect(isFrozen("far", [placed!], placed!.armsAt + 0.1)).toBe(false);
  });

  it("freeze with nobody in reach is not placed", () => {
    expect(placeHazard("freeze", 0, 0, "ghost", 0, 7, [{ id: "far", x: 900, y: 0 }])).toBeNull();
  });
});
