import { ovalPoints, type ServerMsg } from "@neon/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Lobby } from "../src/lobby";

/** A socket that records what it's sent and reports however much is still waiting to go out. */
function socket(buffered = () => 0) {
  const got: ServerMsg[] = [];
  return { got, client: { send: (data: string) => void got.push(JSON.parse(data)), getBufferedAmount: buffered } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date", "performance"] });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function race(lobby: Lobby, code: string, ids: string[], seen: ServerMsg[]) {
  for (const id of ids) lobby.message(code, id, JSON.stringify({ t: "ready", ready: true }));
  const drawer = [...seen].reverse().find((m): m is Extract<ServerMsg, { t: "room" }> => m.t === "room")!.drawerId!;
  lobby.message(code, drawer, JSON.stringify({ t: "sketch", points: ovalPoints(3200, 2000, 2200, 1300), reset: true }));
  lobby.message(code, drawer, JSON.stringify({ t: "submit" }));
  vi.advanceTimersByTime(4000);
}

describe("Lobby", () => {
  it("skips snapshots for a player whose connection is still sending old ones, but not anything else", () => {
    const lobby = new Lobby();
    const code = lobby.create();
    const quick = socket();
    let backlog = 0;
    const slow = socket(() => backlog);
    lobby.join(code, "quick", "Quick", quick.client);
    lobby.join(code, "slow", "Slow", slow.client);
    race(lobby, code, ["quick", "slow"], quick.got);

    const snaps = (s: ReturnType<typeof socket>) => s.got.filter((m) => m.t === "snap").length;
    const before = { quick: snaps(quick), slow: snaps(slow) };
    expect(before.slow).toBe(before.quick);

    backlog = 64_000;
    vi.advanceTimersByTime(1000);
    expect(snaps(quick) - before.quick).toBeGreaterThanOrEqual(19);
    expect(snaps(slow)).toBe(before.slow);

    backlog = 0;
    vi.advanceTimersByTime(200);
    expect(snaps(slow)).toBeGreaterThan(before.slow);

    backlog = 64_000;
    const rooms = slow.got.filter((m) => m.t === "room").length;
    lobby.leave(code, "quick");
    expect(slow.got.filter((m) => m.t === "room").length).toBeGreaterThan(rooms);
  });
});
