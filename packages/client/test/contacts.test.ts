import { describe, expect, it } from "vitest";
import { CAR_RADIUS, type Hazard } from "@neon/sim";
import { IMPACT } from "../src/render/impact";
import { classify, CONTACT, createContactTracker, findTouches, sparkCount, spray, type ContactCar, type ContactHit, type Touch } from "../src/render/contacts";

const car = (id: string, x: number, y: number, angle = 0, speed = 0, alive = true): ContactCar => ({ id, x, y, angle, speed, alive, color: 0x00ff00 });
const block = (x: number, y: number, armsAt = 0): Hazard => ({ id: 7, kind: "block", x, y, radius: 70, owner: "z", armsAt, expiresAt: 10 });
const BLOCK = 0xff5a1f;

function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("findTouches", () => {
  it("doesn't spark between a car on a bridge and a car passing underneath", () => {
    const over = { ...car("a", 0, 0, 0, 300), upper: true };
    expect(findTouches([over, car("b", 10, 0, Math.PI, 300)], [], 1, true, BLOCK)).toEqual([]);
  });

  it("finds a car pressed against a live block with the contact on its rim", () => {
    const [t] = findTouches([car("a", 0, 70 + CAR_RADIUS, 0, 300)], [block(0, 0)], 1, false, BLOCK);
    expect(t).toMatchObject({ key: "a#7", x: 0, block: true, colors: [BLOCK, 0x00ff00] });
    expect(t!.y).toBeCloseTo(70);
    expect(t!.ny).toBeCloseTo(1);
    expect(t!.vn).toBeCloseTo(0);
    expect(t!.vt).toBeCloseTo(-300);
  });

  it("ignores blocks still arming, dead cars and cars clear of the rim", () => {
    expect(findTouches([car("a", 0, 80)], [block(0, 0, 2)], 1, false, BLOCK)).toEqual([]);
    expect(findTouches([car("a", 0, 80, 0, 0, false)], [block(0, 0)], 1, false, BLOCK)).toEqual([]);
    expect(findTouches([car("a", 0, 70 + CAR_RADIUS + CONTACT.slack + 1)], [block(0, 0)], 1, false, BLOCK)).toEqual([]);
  });

  it("only pairs cars in contact mode, with the closing speed along the normal", () => {
    const cars = [car("a", 0, 0, 0, 300), car("b", CAR_RADIUS * 2, 0, Math.PI, 100)];
    expect(findTouches(cars, [], 0, false, BLOCK)).toEqual([]);
    const [t] = findTouches(cars, [], 0, true, BLOCK);
    expect(t).toMatchObject({ key: "a|b", x: CAR_RADIUS, y: 0, block: false });
    expect(t!.vn).toBeCloseTo(400);
  });
});

describe("classify", () => {
  const touchWith = (vn: number, vt: number): Touch => ({ key: "k", x: 0, y: 0, nx: 1, ny: 0, vn, vt, colors: [1], block: false });

  it("calls a fresh contact with closing speed a hit, scaled to full", () => {
    const { hits, touching } = classify([touchWith(-CONTACT.hitFull / 2, 0)], new Set());
    expect(hits).toEqual([{ touch: touchWith(-CONTACT.hitFull / 2, 0), kind: "hit", strength: 0.5 }]);
    expect([...touching]).toEqual(["k"]);
    expect(classify([touchWith(CONTACT.hitFull * 2, 0)], new Set()).hits[0]!.strength).toBe(1);
  });

  it("calls continuing or glancing contact a scrape when sliding fast enough", () => {
    expect(classify([touchWith(400, CONTACT.scrapeFull)], new Set(["k"])).hits[0]).toMatchObject({ kind: "scrape", strength: 1 });
    expect(classify([touchWith(10, CONTACT.scrapeMin)], new Set()).hits[0]!.kind).toBe("scrape");
    expect(classify([touchWith(10, CONTACT.scrapeMin - 1)], new Set()).hits).toEqual([]);
  });

  it("forgets contacts that ended", () => {
    expect(classify([], new Set(["k"])).touching.size).toBe(0);
  });
});

describe("createContactTracker", () => {
  it("jolts once on the hit, then only sparks while the car scrapes along the block", () => {
    const step = createContactTracker(BLOCK, () => 0.5);
    const first = step([car("a", 0, -(70 + CAR_RADIUS), Math.PI / 2, 450)], [block(0, 0)], 1, false, 1 / 60);
    expect(first.impacts).toHaveLength(1);
    expect(first.impacts[0]!.strength).toBeCloseTo(IMPACT.block);
    expect(first.sparks.length).toBeGreaterThan(0);
    const sliding = step([car("a", 0, -(70 + CAR_RADIUS), 0, 400)], [block(0, 0)], 1, false, 1 / 60);
    expect(sliding.impacts).toEqual([]);
    expect(sliding.sparks.length).toBeGreaterThan(0);
  });
});

describe("spray", () => {
  const scrape = (vt: number, block = false): ContactHit => ({
    touch: { key: "k", x: 5, y: 6, nx: 0, ny: 1, vn: 0, vt, colors: [0x123456], block },
    kind: "scrape",
    strength: 0.5,
  });

  it("sprays scrape sparks along the tangent in the direction of travel", () => {
    const sparks = spray(scrape(200), 20, seq([0.1, 0.9, 0.5, 0.3, 0.7]));
    expect(sparks).toHaveLength(20);
    for (const p of sparks) {
      expect(p.x).toBe(5);
      expect(p.y).toBe(6);
      expect(p.vx).toBeLessThan(0);
      expect(Math.abs(p.vy)).toBeLessThan(Math.abs(p.vx));
    }
    for (const p of spray(scrape(-200), 20, seq([0.2, 0.8, 0.4]))) expect(p.vx).toBeGreaterThan(0);
  });

  it("pushes block sparks away from the block", () => {
    const sparks = spray(scrape(200, true), 20, seq([0.5]));
    for (const p of sparks) expect(p.vy).toBeGreaterThan(0);
  });

  it("sprays hits both ways along the tangent", () => {
    const hitOn = { ...scrape(0), kind: "hit" as const };
    const sides = new Set(spray(hitOn, 20, seq([0.1, 0.5, 0.5, 0.5, 0.5, 0.9, 0.5, 0.5, 0.5, 0.5])).map((p) => Math.sign(p.vx)));
    expect(sides).toEqual(new Set([1, -1]));
  });

  it("emits more for harder hits and scrapes at a steady rate", () => {
    const hitAt = (strength: number): ContactHit => ({ ...scrape(0), kind: "hit", strength });
    expect(sparkCount(hitAt(1), 1 / 60, Math.random)).toBeGreaterThan(sparkCount(hitAt(0.2), 1 / 60, Math.random));
    let total = 0;
    const rand = seq(Array.from({ length: 10 }, (_, i) => 0.05 + i / 10));
    for (let i = 0; i < 600; i++) total += sparkCount(scrape(200), 1 / 60, rand);
    expect(total).toBeGreaterThan(CONTACT.scrapeRate * 0.5 * 10 * 0.9);
    expect(total).toBeLessThan(CONTACT.scrapeRate * 0.5 * 10 * 1.1);
  });
});
