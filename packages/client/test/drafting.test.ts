import { describe, expect, it } from "vitest";
import { createDrafting } from "../src/net/drafting";
import type { CarView } from "../src/render/types";

const DT = 1 / 60;
const lead = { id: "lead", x: 0, y: 0, angle: 0, vx: 650, vy: 0, alive: true };
const me = { x: -80, y: 0, angle: 0, vx: 650, vy: 0 };
const view = (id: string, x: number, isYou = false): CarView => ({
  id,
  name: id,
  color: 0,
  x,
  y: 0,
  angle: 0,
  speed: 650,
  drifting: false,
  alive: true,
  frozen: false,
  isYou,
  boosting: false,
});

describe("createDrafting", () => {
  it("drafts the local car off the other cars, ignoring itself and the eliminated", () => {
    const d = createDrafting(() => {});
    expect(d.step("me", me, [{ ...lead, alive: false }, { ...me, id: "me", alive: true }], DT)).toBe(0);
    expect(d.step("me", me, [lead], DT)).toBeGreaterThan(0);
    expect(d.own("me")).toBeGreaterThan(0);
  });

  it("whooshes once each time the draft engages", () => {
    let whooshes = 0;
    const d = createDrafting(() => whooshes++);
    for (let i = 0; i < 60; i++) d.step("me", me, [lead], DT);
    expect(whooshes).toBe(1);
    for (let i = 0; i < 120; i++) d.step("me", me, [], DT);
    for (let i = 0; i < 60; i++) d.step("me", me, [lead], DT);
    expect(whooshes).toBe(2);
  });

  it("marks drafting cars on the views, using the local amount for your car", () => {
    const d = createDrafting(() => {});
    const cars = [view("lead", 0), view("tuck", -80), view("me", -500, true)];
    for (let i = 0; i <= 60; i++) d.paint(cars, i * DT);
    expect(cars[0]!.drafting).toBe(0);
    expect(cars[1]!.drafting).toBe(1);
    expect(cars[2]!.drafting).toBe(0);
    d.step("me", me, [lead], DT);
    d.paint(cars, 61 * DT);
    expect(cars[2]!.drafting).toBeGreaterThan(0);
  });
});
