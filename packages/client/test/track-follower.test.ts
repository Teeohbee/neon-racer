import { describe, expect, it } from "vitest";
import { buildTrack, pointAt, type Point } from "@neon/sim";
import { TrackFollower } from "../src/net/track-follower";

const eight = buildTrack(
  Array.from({ length: 240 }, (_, i): Point => {
    const t = Math.PI / 2 + (i / 240) * Math.PI * 2;
    return [3200 + 2600 * Math.sin(t), 2000 + 1500 * Math.sin(2 * t)];
  }),
);

describe("TrackFollower", () => {
  it("keeps each car on its own branch as it drives through a crossing", () => {
    const follower = new TrackFollower();
    const pass = eight.length / 4;
    for (let s = pass - 300; s <= pass + 300; s += 25) {
      const [x, y, angle] = pointAt(eight, s);
      const at = follower.follow(eight, "ann", x - Math.sin(angle) * 40, y + Math.cos(angle) * 40);
      expect(at.s).toBeCloseTo(s, -1);
    }
    expect(follower.near("ann")).toBeCloseTo(pass + 300, -1);
  });

  it("forgets everyone when the track changes", () => {
    const follower = new TrackFollower();
    const [x, y] = pointAt(eight, 100);
    follower.follow(eight, "ann", x, y);
    const other = buildTrack(eight.xs.map((x, i): Point => [x + 10, eight.ys[i]!]));
    follower.follow(other, "bob", x, y);
    expect(follower.near("ann")).toBeUndefined();
  });
});
