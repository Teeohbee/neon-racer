import { describe, expect, it } from "vitest";
import type { PlayerInfo } from "@neon/sim";
import { cupTable, isLegEnd, rematchLabel, stillWaiting, tallyLine } from "../src/ui/match-end";

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
    expect(cupTable([player("a", { cupPoints: 6 }), player("b", { cupPoints: 16 })]).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("sums up tonight's winners, most first", () => {
    expect(tallyLine([player("Toby", { wins: 1 }), player("Bolt", { wins: 2 }), player("Nova")])).toBe("Tonight: Bolt 2 · Toby 1");
    expect(tallyLine([player("Toby")])).toBe("");
  });
});
