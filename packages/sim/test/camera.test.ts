import { describe, expect, it } from "vitest";
import { frameCamera, isOutsideView, LINE_GAP, lineGap, MAX_SCALE, stepCamera, VIEW, viewBounds } from "../src/camera";
import { defaultCarParams } from "../src/car";
import { buildTrack, pointAt } from "../src/track";
import { PRESET_TRACKS } from "../src/tracks";
import { BOOST_FACTOR } from "../src/world";

const DT = 1 / 60;
const SPEED = defaultCarParams.maxSpeed * BOOST_FACTOR;
/** A fifth of a second of road at boost speed. */
const MIN_ROOM_AHEAD = SPEED * 0.2;

function chaseLap(name: string, gap = LINE_GAP) {
  const preset = PRESET_TRACKS.find((t) => t.name === name)!;
  const track = buildTrack(preset.points, preset.features);
  const frames: { cam: { x: number; y: number; scale: number }; leader: { x: number; y: number }; angle: number; line: { x: number; y: number } }[] = [];
  let cam = { x: pointAt(track, 0)[0], y: pointAt(track, 0)[1], scale: 1 };
  for (let s = 0; s < track.length + gap; s += SPEED * DT) {
    const [x, y, angle] = pointAt(track, s);
    const [lx, ly] = pointAt(track, s - gap);
    const leader = { x, y, vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED };
    cam = frameCamera(cam, leader, { x: lx, y: ly }, DT);
    frames.push({ cam, leader, angle, line: { x: lx, y: ly } });
  }
  return frames.slice(60);
}

describe("camera", () => {
  it("drifts toward the leader", () => {
    let cam = { x: 0, y: 0, scale: 1 };
    for (let i = 0; i < 120; i++) cam = stepCamera(cam, { x: 500, y: 0, vx: 0, vy: 0 }, 1 / 60, 1);
    expect(cam.x).toBeGreaterThan(450);
  });

  it("looks ahead in the leader's direction of travel", () => {
    let cam = { x: 0, y: 0, scale: 1 };
    for (let i = 0; i < 300; i++) cam = stepCamera(cam, { x: 0, y: 0, vx: 600, vy: 0 }, 1 / 60, 1);
    expect(cam.x).toBeGreaterThan(100);
  });

  it("knows which cars have left the shot", () => {
    const cam = { x: 0, y: 0, scale: 1 };
    expect(isOutsideView(cam, VIEW.width / 2 - 50, 0)).toBe(false);
    expect(isOutsideView(cam, VIEW.width / 2 + 50, 0)).toBe(true);
    expect(isOutsideView({ ...cam, scale: 0.5 }, VIEW.width / 4 + 50, 0)).toBe(true);
  });

  it.each(["Paperclip", "Lightning", "Hook"])("keeps the leader and the line in shot for a flat-out lap of %s", (name) => {
    for (const { cam, leader, line } of chaseLap(name)) {
      expect(isOutsideView(cam, leader.x, leader.y, 0)).toBe(false);
      expect(isOutsideView(cam, line.x, line.y, 0)).toBe(false);
    }
  });

  /** World units from the leader to the screen edge it is driving towards. */
  const roomAhead = ({ cam, leader, angle }: ReturnType<typeof chaseLap>[number]) => {
    const b = viewBounds(cam);
    const [cx, cy] = [Math.cos(angle), Math.sin(angle)];
    const toX = cx > 0 ? (b.right - leader.x) / cx : cx < 0 ? (leader.x - b.left) / -cx : Infinity;
    const toY = cy > 0 ? (b.bottom - leader.y) / cy : cy < 0 ? (leader.y - b.top) / -cy : Infinity;
    return Math.min(toX, toY);
  };

  it.each(PRESET_TRACKS.map((t) => t.name))("leaves the boosting leader road to see ahead for a flat-out lap of %s", (name) => {
    for (const frame of chaseLap(name)) expect(roomAhead(frame)).toBeGreaterThan(MIN_ROOM_AHEAD);
  });

  it("eases the zoom and keeps it between 1 and the cap", () => {
    const frames = chaseLap("Hook");
    const scales = frames.map((f) => f.cam.scale);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...scales)).toBeLessThanOrEqual(MAX_SCALE);
    expect(Math.max(...scales)).toBeGreaterThan(1);
    for (let i = 1; i < scales.length; i++) expect(Math.abs(scales[i]! - scales[i - 1]!)).toBeLessThan(0.05);
  });

  it("zooms back in when the line closes up", () => {
    const mean = (gap: number) => {
      const scales = chaseLap("Hook", gap).map((f) => f.cam.scale);
      return scales.reduce((a, b) => a + b) / scales.length;
    };
    expect(mean(350)).toBeLessThan(mean(LINE_GAP));
  });

  it("pulls the elimination line in during sudden death", () => {
    expect(lineGap(30)).toBe(LINE_GAP);
    expect(lineGap(105)).toBeLessThan(LINE_GAP);
    expect(lineGap(500)).toBe(lineGap(1000));
    expect(lineGap(500)).toBeLessThan(LINE_GAP / 2);
  });

  it("starts sudden death 30 seconds in and is fully tight by 60", () => {
    expect(lineGap(30)).toBe(LINE_GAP);
    expect(lineGap(31)).toBeLessThan(LINE_GAP);
    expect(lineGap(60)).toBe(lineGap(1000));
  });
});
