import { describe, expect, it } from "vitest";
import { MatchStats, MAX_AWARDS } from "../src/awards";
import type { CarState } from "../src/car";

const DT = 1 / 60;
const straight: CarState = { x: 0, y: 0, angle: 0, vx: 400, vy: 0 };
const sideways: CarState = { x: 0, y: 0, angle: 0, vx: 300, vy: 250 };

const titles = (stats: MatchStats, ids = ["ann", "bob", "cat"]) => stats.awards(ids).map((a) => a.title);
const award = (stats: MatchStats, title: string, ids = ["ann", "bob", "cat"]) => stats.awards(ids).find((a) => a.title === title);

describe("match stats", () => {
  it("gives no awards when nothing happened", () => {
    expect(new MatchStats().awards(["ann", "bob"])).toEqual([]);
  });

  it("credits the player with the most hazard kills", () => {
    const stats = new MatchStats();
    stats.hazardKill("bob");
    stats.hazardKill("bob");
    stats.hazardKill("ann");
    expect(award(stats, "Black ICE Dealer")).toMatchObject({ id: "bob", stat: "2 racers flatlined" });
  });

  it("counts falls and line catches separately", () => {
    const stats = new MatchStats();
    stats.eliminated("ann", "fell");
    stats.eliminated("ann", "fell");
    stats.eliminated("bob", "line");
    stats.eliminated("cat", "left");
    expect(award(stats, "Gravity Subscriber")).toMatchObject({ id: "ann", stat: "fell off the lanes 2 times" });
    expect(award(stats, "Garbage Collected")).toMatchObject({ id: "bob", stat: "caught by the line 1 time" });
  });

  it("counts hazards placed", () => {
    const stats = new MatchStats();
    for (let i = 0; i < 3; i++) stats.hazardPlaced("cat");
    expect(award(stats, "Pirate Stream Troll")).toMatchObject({ id: "cat", stat: "3 hazards dropped from beyond" });
  });

  it("counts rounds won", () => {
    const stats = new MatchStats();
    stats.endRound("ann");
    stats.endRound("bob");
    stats.endRound("bob");
    stats.endRound(null);
    expect(award(stats, "Sponsored Content")).toMatchObject({ id: "bob", stat: "2 rounds won" });
  });

  describe("drift", () => {
    it("measures the longest unbroken slide", () => {
      const stats = new MatchStats();
      for (let i = 0; i < 60; i++) stats.sample("ann", sideways, null, DT);
      stats.sample("ann", straight, null, DT);
      for (let i = 0; i < 90; i++) stats.sample("bob", sideways, null, DT);
      for (let i = 0; i < 30; i++) stats.sample("ann", sideways, null, DT);
      expect(award(stats, "Sideways Firmware")).toMatchObject({ id: "bob", stat: "1.5s sideways" });
    });

    it("ignores slides too short to call a drift", () => {
      const stats = new MatchStats();
      for (let i = 0; i < 10; i++) stats.sample("ann", sideways, null, DT);
      expect(titles(stats)).not.toContain("Sideways Firmware");
    });

    it("ignores slow slithers", () => {
      const stats = new MatchStats();
      for (let i = 0; i < 60; i++) stats.sample("ann", { ...sideways, vx: 40, vy: 60 }, null, DT);
      expect(titles(stats)).not.toContain("Sideways Firmware");
    });
  });

  describe("closest shave", () => {
    it("keeps the smallest gap a player survived", () => {
      const stats = new MatchStats();
      stats.sample("ann", straight, 200, DT);
      stats.sample("ann", straight, 48, DT);
      stats.sample("bob", straight, 96, DT);
      stats.endRound("ann");
      expect(award(stats, "Firewall Kisser")).toMatchObject({ id: "ann", stat: "outran the line by 1.5 car lengths" });
    });

    it("does not count a gap the line went on to close that round", () => {
      const stats = new MatchStats();
      stats.sample("ann", straight, 10, DT);
      stats.eliminated("ann", "line");
      stats.sample("bob", straight, 100, DT);
      stats.endRound("bob");
      expect(award(stats, "Firewall Kisser")?.id).toBe("bob");
    });

    it("isn't a shave when the line never got within a few car lengths", () => {
      const stats = new MatchStats();
      stats.sample("ann", straight, 900, DT);
      stats.endRound("ann");
      expect(award(stats, "Firewall Kisser")).toBeUndefined();
    });

    it("still counts it when the player fell off later", () => {
      const stats = new MatchStats();
      stats.sample("ann", straight, 10, DT);
      stats.eliminated("ann", "fell");
      stats.sample("bob", straight, 300, DT);
      stats.endRound("bob");
      expect(award(stats, "Firewall Kisser")?.id).toBe("ann");
    });

    it("forgets an earlier round's gap when the line catches them in a later one", () => {
      const stats = new MatchStats();
      stats.sample("ann", straight, 20, DT);
      stats.endRound("ann");
      stats.sample("ann", straight, 5, DT);
      stats.eliminated("ann", "line");
      stats.endRound("bob");
      expect(award(stats, "Firewall Kisser")).toMatchObject({ id: "ann", stat: "outran the line by 0.6 car lengths" });
    });
  });

  it("counts time spent leading as time on the pirate stream", () => {
    const stats = new MatchStats();
    for (let i = 0; i < 120; i++) stats.leading("cat", DT);
    for (let i = 0; i < 60; i++) stats.leading("ann", DT);
    expect(award(stats, "Main Character Energy")).toMatchObject({ id: "cat", stat: "2s hogging the pirate stream camera" });
  });

  it("spreads ties to players with fewer awards so far", () => {
    const stats = new MatchStats();
    stats.hazardKill("ann");
    stats.hazardPlaced("ann");
    stats.hazardPlaced("bob");
    expect(award(stats, "Black ICE Dealer")?.id).toBe("ann");
    expect(award(stats, "Pirate Stream Troll")?.id).toBe("bob");
  });

  it("only awards players still in the match", () => {
    const stats = new MatchStats();
    stats.hazardKill("gone");
    expect(stats.awards(["ann", "bob"])).toEqual([]);
  });

  it("caps the number of awards", () => {
    const stats = new MatchStats();
    stats.hazardKill("ann");
    stats.eliminated("bob", "fell");
    stats.eliminated("cat", "line");
    stats.hazardPlaced("ann");
    stats.endRound("bob");
    stats.leading("cat", 1);
    for (let i = 0; i < 60; i++) stats.sample("ann", sideways, 50, DT);
    stats.endRound("ann");
    expect(stats.awards(["ann", "bob", "cat"])).toHaveLength(MAX_AWARDS);
  });
});
