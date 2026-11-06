import { describe, expect, it } from "vitest";
import { VIEW } from "@neon/sim";
import { dangerLevel } from "../src/audio/levels";
import { diffVoices, engineFreq, engineGear, MAX_VOICES, planVoices, type AudibleCar } from "../src/audio/voices";

const camera = { x: 0, y: 0, scale: 1 };
const car = (id: string, x: number, extra: Partial<AudibleCar> = {}): AudibleCar => ({ id, x, y: 0, speed: 400, isYou: false, ...extra });

describe("engine voice planning", () => {
  it("always voices your car, centred and loudest", () => {
    const plans = planVoices([car("a", 100), car("me", 700, { isYou: true })], camera);
    const me = plans.find((p) => p.id === "me")!;
    expect(plans[0]!.id).toBe("me");
    expect(me.pan).toBe(0);
    expect(me.gain).toBeGreaterThanOrEqual(plans[1]!.gain);
  });

  it("pans others by screen position", () => {
    const [left, right] = planVoices([car("l", -VIEW.width / 2), car("r", VIEW.width / 4)], camera).sort((a, b) => a.pan - b.pan);
    expect(left!.pan).toBeLessThan(-0.5);
    expect(right!.pan).toBeGreaterThan(0);
    expect(right!.pan).toBeLessThan(0.5);
  });

  it("accounts for camera zoom when panning", () => {
    const zoomed = planVoices([car("a", VIEW.width / 2)], { x: 0, y: 0, scale: 2 })[0]!;
    expect(zoomed.pan).toBeCloseTo(0.4);
  });

  it("caps the voice count, keeping you and the nearest cars", () => {
    const cars = [car("me", 0, { isYou: true }), ...[700, 50, 400, 200, 600].map((x, i) => car(`c${i}`, x))];
    const ids = planVoices(cars, camera).map((p) => p.id);
    expect(ids).toHaveLength(MAX_VOICES);
    expect(ids).toEqual(["me", "c1", "c3", "c2"]);
  });

  it("drops dead and far off-screen cars", () => {
    const ids = planVoices([car("dead", 0, { alive: false }), car("far", VIEW.width * 2)], camera).map((p) => p.id);
    expect(ids).toEqual([]);
  });

  it("only screeches for drifting cars near the camera", () => {
    const plans = planVoices([car("near", 100, { drifting: true }), car("edge", 780, { drifting: true }), car("calm", 50)], camera);
    const by = Object.fromEntries(plans.map((p) => [p.id, p.screech]));
    expect(by.near).toBeGreaterThan(0);
    expect(by.edge).toBe(0);
    expect(by.calm).toBe(0);
  });

  it("creates, updates and releases voices from the plan", () => {
    const plans = planVoices([car("a", 0), car("b", 100)], camera);
    const diff = diffVoices(["b", "gone"], plans);
    expect(diff.create.map((p) => p.id)).toEqual(["a"]);
    expect(diff.update.map((p) => p.id)).toEqual(["b"]);
    expect(diff.release).toEqual(["gone"]);
  });
});

describe("engine pitch", () => {
  it("rises with speed within a gear and drops on an upshift", () => {
    expect(engineFreq(200, 0)).toBeGreaterThan(engineFreq(100, 0));
    expect(engineFreq(260, 1)).toBeLessThan(engineFreq(230, 0));
  });

  it("holds the gear near a shift point instead of flapping", () => {
    const gears = [220, 245, 240, 260, 230, 210, 195].reduce<number[]>((acc, speed) => [...acc, engineGear(speed, acc.at(-1) ?? 0)], []);
    expect(gears).toEqual([0, 0, 0, 1, 1, 1, 0]);
  });
});

describe("danger level", () => {
  it("is silent when the line is far or absent, and full when it is on you", () => {
    expect(dangerLevel(null)).toBe(0);
    expect(dangerLevel(2000)).toBe(0);
    expect(dangerLevel(0)).toBe(1);
    expect(dangerLevel(-50)).toBe(1);
    expect(dangerLevel(350)).toBeGreaterThan(0);
    expect(dangerLevel(350)).toBeLessThan(0.5);
  });
});
