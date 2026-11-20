import { describe, expect, it } from "vitest";
import { createNetStats } from "../src/net/net-stats";

describe("net stats", () => {
  it("has nothing to say before any frames are drawn", () => {
    expect(createNetStats().take()).toBeNull();
  });

  it("sums up snapshot lateness, starved frames, round trips and corrections", () => {
    const stats = createNetStats();
    for (let i = 0; i < 100; i++) stats.snap(i);
    for (let i = 0; i < 8; i++) stats.frame(i < 2);
    stats.roundTrip(40);
    stats.roundTrip(80);
    stats.corrected(1);
    stats.corrected(2.25);
    expect(stats.take()).toEqual({ snapLateP95: 95, snapLateMax: 99, starvedPct: 25, rttAvg: 60, rttMax: 80, correctAvg: 1.6, correctMax: 2.3 });
  });

  it("leaves out what wasn't measured", () => {
    const stats = createNetStats();
    stats.frame(false);
    expect(stats.take()).toEqual({ starvedPct: 0 });
  });

  it("starts afresh after each summary", () => {
    const stats = createNetStats();
    stats.frame(true);
    stats.take();
    expect(stats.take()).toBeNull();
  });
});
