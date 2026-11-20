import { describe, expect, it } from "vitest";
import type { PlayerInfo } from "@neon/sim";
import { cupTable, isLegEnd, matchStandings, rematchLabel, stillWaiting, tallyLine } from "../src/ui/match-end";

const player = (id: string, over: Partial<PlayerInfo> = {}): PlayerInfo => ({ id, name: id, color: 0, ready: true, score: 0, bot: false, wins: 0, rematch: false, cupPoints: 0, ...over });

describe("match end", () => {
  it("knows a cup has more legs to go", () => {
    expect(isLegEnd({ cup: 3, leg: 1 })).toBe(true);
    expect(isLegEnd({ cup: 3, leg: 3 })).toBe(false);
    expect(isLegEnd({ cup: 0, leg: 1 })).toBe(false);
  });

  it("names the rematch button after what happens next", () => {
    expect(rematchLabel({ cup: 0, leg: 1 })).toBe("Rematch");
    expect(rematchLabel({ cup: 3, leg: 1 })).toBe("Next track (2/3)");
    expect(rematchLabel({ cup: 3, leg: 3 })).toBe("New cup");
  });

  it("counts the people still to vote, ignoring bots", () => {
    expect(stillWaiting([player("a", { rematch: true }), player("b"), player("c", { bot: true })])).toBe(1);
  });

  it("ranks the cup table by cup points", () => {
    expect(cupTable([player("a", { cupPoints: 6 }), player("b", { cupPoints: 16 })], null).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("puts the leg winner first on a cup points tie, matching the champion the server picks", () => {
    expect(cupTable([player("Wojciech", { cupPoints: 22 }), player("cken", { cupPoints: 22 }), player("WLSN", { cupPoints: 14 })], "cken").map((p) => p.id)).toEqual(["cken", "Wojciech", "WLSN"]);
  });

  it("stands a cup on cup points, ties to the leg winner", () => {
    const players = [player("a", { cupPoints: 22, score: 5 }), player("b", { cupPoints: 22, score: 1 })];
    expect(matchStandings({ players, cup: 3 }, "b")).toEqual([
      { id: "b", score: "22 pts" },
      { id: "a", score: "22 pts" },
    ]);
  });

  it("stands a single match on score, ties to the match winner", () => {
    const players = [player("a", { score: 2.5, cupPoints: 9 }), player("b", { score: 2.5 })];
    expect(matchStandings({ players, cup: 0 }, "b")).toEqual([
      { id: "b", score: "2½" },
      { id: "a", score: "2½" },
    ]);
  });

  it("sums up tonight's winners, most first", () => {
    expect(tallyLine([player("Toby", { wins: 1 }), player("Bolt", { wins: 2 }), player("Nova")])).toBe("Tonight: Bolt 2 · Toby 1");
    expect(tallyLine([player("Toby")])).toBe("");
  });
});
