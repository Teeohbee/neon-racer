import { afterEach, describe, expect, it } from "vitest";
import { LINE_GAP, SUDDEN_DEATH_AT } from "../src/camera";
import { emptyInput } from "../src/car";
import type { ClientMsg, GameEvent, ServerMsg } from "../src/protocol";
import { COUNTDOWN_SECONDS, ELIMINATION_GRACE, ROUND_END_SECONDS, Room, SKETCH_SECONDS, TARGET_SCORE, TICK_RATE } from "../src/room";
import { buildTrack, nearestOnTrack, ovalPoints, pointAt, TRACK_WIDTH, type Point } from "../src/track";
import { PRESET_TRACKS, type PresetTrack } from "../src/tracks";

const DT = 1 / TICK_RATE;
const loop: Point[] = ovalPoints(3200, 2000, 2200, 1300);

function setup(names = ["ann", "bob"], seed = 1, sketching = true) {
  const sent: { to: string | "*"; msg: ServerMsg }[] = [];
  let s = seed;
  const rng = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const room = new Room("ABCD", { send: (to, msg) => sent.push({ to, msg }), broadcast: (msg) => sent.push({ to: "*", msg }) }, { rng, sketching });
  names.forEach((n) => room.join(n, n));
  const run = (seconds: number, each?: () => void) => {
    for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
      each?.();
      room.update(DT);
    }
  };
  const last = <T extends ServerMsg["t"]>(t: T) => [...sent].reverse().find((m) => m.msg.t === t)?.msg as Extract<ServerMsg, { t: T }> | undefined;
  const events = () => sent.flatMap((m) => (m.msg.t === "event" ? [m.msg.event] : [])) as GameEvent[];
  const send = (id: string, msg: ClientMsg) => room.handle(id, msg);
  const readyAll = () => names.forEach((n) => send(n, { t: "ready", ready: true }));
  const drawer = () => last("room")!.drawerId!;
  const toRace = () => {
    readyAll();
    send(drawer(), { t: "sketch", points: loop, reset: true });
    send(drawer(), { t: "submit" });
    run(COUNTDOWN_SECONDS + DT);
  };
  const car = (id: string) => last("snap")!.cars.find((c) => c.id === id)!;
  const track = buildTrack(loop);
  const gridOrder = () =>
    [...names].sort((a, b) => {
      const behind = (id: string) => track.length - nearestOnTrack(track, car(id).x, car(id).y).s;
      return behind(a) - behind(b);
    });
  const knockOut = (id: string) => {
    const c = car(id);
    run(ELIMINATION_GRACE + 0.1, () => send(id, { t: "state", seq: 1, car: { ...c, x: c.x - 5000 } }));
  };
  const driveForward = (ids: string[], distance: number) => {
    const from = Object.fromEntries(ids.map((id) => [id, nearestOnTrack(track, car(id).x, car(id).y).s]));
    let seq = 0;
    run(distance / 40 / TICK_RATE, () => {
      seq++;
      for (const id of ids) {
        const [x, y, angle] = pointAt(track, from[id]! + seq * 40);
        send(id, { t: "state", seq, car: { x, y, angle, vx: 0, vy: 0 } });
      }
    });
  };
  const score = (id: string) => last("room")!.players.find((p) => p.id === id)!.score;
  const finish = (...outFirstToLast: string[]) => outFirstToLast.forEach(knockOut);
  const nextRace = () => {
    run(ROUND_END_SECONDS + DT);
    send(drawer(), { t: "sketch", points: loop, reset: true });
    send(drawer(), { t: "submit" });
    run(COUNTDOWN_SECONDS + DT);
  };
  return { room, sent, run, last, events, send, readyAll, drawer, toRace, car, gridOrder, knockOut, score, finish, nextRace, driveForward, track };
}

describe("lobby", () => {
  it("makes the first player host and waits for everyone to ready up", () => {
    const g = setup();
    expect(g.last("room")!.hostId).toBe("ann");
    g.send("ann", { t: "ready", ready: true });
    expect(g.room.phase).toBe("lobby");
    g.send("bob", { t: "ready", ready: true });
    expect(g.room.phase).toBe("sketch");
  });

  it("needs at least two players", () => {
    const g = setup(["ann"]);
    g.readyAll();
    expect(g.room.phase).toBe("lobby");
  });

  it("only lets the host pick the mode", () => {
    const g = setup();
    g.send("bob", { t: "mode", mode: "contact" });
    expect(g.room.mode).toBe("ghost");
    g.send("ann", { t: "mode", mode: "contact" });
    expect(g.room.mode).toBe("contact");
  });

  it("turns away a seventh player", () => {
    const g = setup(["a", "b", "c", "d", "e", "f"]);
    expect(g.room.join("g", "g")).toBe(false);
  });
});

describe("sketching", () => {
  it("relays the drawing live to everyone but the drawer", () => {
    const g = setup();
    g.readyAll();
    const drawer = g.drawer();
    g.send(drawer, { t: "sketch", points: loop.slice(0, 10), reset: true });
    const relayed = g.sent.filter((m) => m.msg.t === "sketch" && m.msg.points.length === 10);
    expect(relayed.map((m) => m.to)).toEqual([drawer === "ann" ? "bob" : "ann"]);
  });

  it("rejects an invalid track and tells the drawer why", () => {
    const g = setup();
    g.readyAll();
    g.send(g.drawer(), { t: "sketch", points: [[0, 0], [10, 10], [20, 0]], reset: true });
    g.send(g.drawer(), { t: "submit" });
    expect(g.room.phase).toBe("sketch");
    expect(g.last("problems")!.problems.length).toBeGreaterThan(0);
  });

  it("starts the countdown with a valid track", () => {
    const g = setup();
    g.readyAll();
    g.send(g.drawer(), { t: "sketch", points: loop, reset: true });
    g.send(g.drawer(), { t: "submit" });
    expect(g.room.phase).toBe("countdown");
    expect(g.last("track")!.raw.length).toBe(loop.length);
  });

  it("falls back to a random track when time runs out", () => {
    const g = setup();
    g.readyAll();
    g.run(SKETCH_SECONDS + DT);
    expect(g.room.phase).toBe("countdown");
    expect(g.last("track")!.raw.length).toBeGreaterThan(10);
  });

  it("puts the drawer at the back of the grid", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.toRace();
    expect(g.gridOrder().at(-1)).toBe(g.drawer());
  });
});

describe("racing in ghost mode", () => {
  it("accepts each player's reported car", () => {
    const g = setup();
    g.toRace();
    const me = g.car("ann");
    g.send("ann", { t: "state", seq: 4, car: { ...me, x: me.x + 5 } });
    g.run(DT * 3);
    expect(g.car("ann").x).toBeCloseTo(me.x + 5);
    expect(g.car("ann").ack).toBe(4);
  });

  it("eliminates a car that leaves the shot", () => {
    const g = setup();
    g.toRace();
    const [front, back] = g.gridOrder();
    g.knockOut(back!);
    expect(g.events()).toContainEqual({ kind: "eliminated", id: back, reason: "screen" });
    expect(g.events()).toContainEqual({ kind: "roundWon", id: front });
  });

  it("eliminates a car that falls behind the line once sudden death pulls it in", () => {
    const g = setup();
    g.toRace();
    g.run(SUDDEN_DEATH_AT + 30);
    expect(g.room.phase).toBe("race");
    const [, back] = g.gridOrder();
    const start = nearestOnTrack(g.track, g.car(back!).x, g.car(back!).y).s;
    let seq = 0;
    g.run(0.25, () => {
      const [x, y, angle] = pointAt(g.track, start - ++seq * 40);
      g.send(back!, { t: "state", seq, car: { x, y, angle, vx: 0, vy: 0 } });
    });
    expect(g.events()).toContainEqual({ kind: "eliminated", id: back, reason: "line" });
  });

  it("only sends the line while racing", () => {
    const g = setup();
    g.readyAll();
    g.send(g.drawer(), { t: "sketch", points: loop, reset: true });
    g.send(g.drawer(), { t: "submit" });
    g.run(DT * 3);
    expect(g.last("snap")!.line).toBeNull();
    g.run(COUNTDOWN_SECONDS);
    const [front] = g.gridOrder();
    const leader = nearestOnTrack(g.track, g.car(front!).x, g.car(front!).y).s - g.track.length;
    expect(g.last("snap")!.line).toBeCloseTo(leader - LINE_GAP);
    g.knockOut(g.gridOrder()[1]!);
    g.run(DT * 3);
    expect(g.room.phase).toBe("roundEnd");
    expect(g.last("snap")!.line).toBeNull();
  });

  it("tells everyone when a racer leaves mid-race", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.toRace();
    g.room.leave("cat");
    expect(g.events()).toContainEqual({ kind: "eliminated", id: "cat", reason: "left" });
    expect(g.room.phase).toBe("race");
  });

  it("hands the next sketch to the first player out", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.toRace();
    const [, middle, back] = g.gridOrder();
    g.knockOut(middle!);
    g.knockOut(back!);
    g.run(ROUND_END_SECONDS + DT);
    expect(g.room.phase).toBe("sketch");
    expect(g.drawer()).toBe(middle);
  });
});

describe("hazards", () => {
  it("can only be placed by eliminated players", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.toRace();
    const ann = g.car("ann");
    g.send("ann", { t: "hazard", kind: "slow", x: ann.x, y: ann.y });
    g.run(DT * 3);
    expect(g.last("snap")!.hazards).toHaveLength(0);
  });

  it("respects cooldowns", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.toRace();
    const [front, , back] = g.gridOrder();
    g.knockOut(back!);
    const target = g.car(front!);
    g.send(back!, { t: "hazard", kind: "block", x: target.x + 300, y: target.y });
    g.send(back!, { t: "hazard", kind: "block", x: target.x - 300, y: target.y });
    g.run(DT * 3);
    expect(g.last("snap")!.hazards).toHaveLength(1);
  });

  it("credits half a point straight away when a hazard leads to an elimination", () => {
    const g = setup(["ann", "bob", "cat", "dan"]);
    g.toRace();
    const [, , middle, back] = g.gridOrder();
    g.knockOut(back!);
    const victim = g.car(middle!);
    g.send(back!, { t: "hazard", kind: "slow", x: victim.x, y: victim.y });
    g.run(1);
    g.knockOut(middle!);
    expect(g.events()).toContainEqual({ kind: "hazardKill", by: back, victim: middle });
    expect(g.room.phase).toBe("race");
    expect(g.score(back!)).toBe(0.5);
  });
});

describe("falling off", () => {
  const plain = buildTrack(loop);
  const [sx, sy] = pointAt(plain, 0);
  const dropTrack: PresetTrack = { name: "Drop Test", points: loop, features: [{ kind: "drop", at: [sx, sy], span: 600 }] };
  let saved: PresetTrack[] = [];
  afterEach(() => void PRESET_TRACKS.splice(0, PRESET_TRACKS.length, ...saved));

  it("eliminates a car that leaves the road over a drop", () => {
    saved = PRESET_TRACKS.splice(0, PRESET_TRACKS.length, dropTrack);
    const g = setup(["ann", "bob"], 1, false);
    g.readyAll();
    expect(g.last("track")!.features).toEqual(dropTrack.features);
    g.run(COUNTDOWN_SECONDS + ELIMINATION_GRACE + DT);
    const c = g.car("ann");
    g.send("ann", { t: "state", seq: 1, car: { ...c, x: c.x + TRACK_WIDTH } });
    g.run(DT * 3);
    expect(g.events()).toContainEqual({ kind: "eliminated", id: "ann", reason: "fell" });
  });
});

describe("scoring", () => {
  const deltas = (g: ReturnType<typeof setup>) => (g.events().filter((e) => e.kind === "roundScored").at(-1) as Extract<GameEvent, { kind: "roundScored" }>).results;

  it("gives 2 to the winner, 1 to second, nothing in between and takes 1 from last", () => {
    const g = setup(["ann", "bob", "cat", "dan"]);
    g.toRace();
    const [first, second, third, last] = g.gridOrder();
    g.finish(last!, third!, second!);
    expect(deltas(g)).toEqual([
      { id: first, delta: 2 },
      { id: second, delta: 1 },
      { id: third, delta: 0 },
      { id: last, delta: -1 },
    ]);
    expect([first, second, third, last].map((id) => g.score(id!))).toEqual([2, 1, 0, 0]);
  });

  it("takes a point back from a last place finisher who has one", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.toRace();
    const [winner, second, last] = g.gridOrder();
    g.finish(last!, second!);
    g.nextRace();
    g.driveForward([second!, last!], 400);
    g.finish(winner!, second!);
    expect([winner, second, last].map((id) => g.score(id!))).toEqual([1, 2, 2]);
  });

  it("does not punish the loser of a two-player round", () => {
    const g = setup();
    g.toRace();
    const [front, back] = g.gridOrder();
    g.finish(back!);
    expect(deltas(g)).toEqual([
      { id: front, delta: 2 },
      { id: back, delta: 1 },
    ]);
  });
});

describe("contact mode", () => {
  it("drives cars on the server from inputs", () => {
    const g = setup();
    g.send("ann", { t: "mode", mode: "contact" });
    g.toRace();
    const start = g.car("ann");
    let seq = 0;
    g.run(0.5, () => g.send("ann", { t: "input", seq: ++seq, input: { ...emptyInput, throttle: true } }));
    const moved = g.car("ann");
    expect(Math.hypot(moved.x - start.x, moved.y - start.y)).toBeGreaterThan(30);
    expect(moved.ack).toBeGreaterThan(20);
  });
});

describe("match flow", () => {
  it("ends the match at the target score and returns to the lobby on request", () => {
    const g = setup();
    g.readyAll();
    while (g.room.phase === "sketch") {
      g.send(g.drawer(), { t: "sketch", points: loop, reset: true });
      g.send(g.drawer(), { t: "submit" });
      g.run(COUNTDOWN_SECONDS + DT);
      g.knockOut(g.gridOrder()[1]!);
      g.run(ROUND_END_SECONDS + DT);
    }
    expect(g.room.phase).toBe("matchEnd");
    const winner = g.events().find((e) => e.kind === "matchWon");
    const scores = g.last("room")!.players.map((p) => p.score);
    expect(g.score((winner as { id: string }).id)).toBeGreaterThanOrEqual(TARGET_SCORE);
    expect(scores.filter((s) => s >= TARGET_SCORE)).toHaveLength(1);
    const host = g.last("room")!.hostId!;
    g.send(host === "ann" ? "bob" : "ann", { t: "again" });
    expect(g.room.phase).toBe("matchEnd");
    g.send(host, { t: "again" });
    expect(g.room.phase).toBe("lobby");
  });

  it("drops back to the lobby when only one player is left", () => {
    const g = setup();
    g.toRace();
    g.room.leave("bob");
    expect(g.room.phase).toBe("lobby");
  });

  it("passes host on when the host leaves", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.room.leave("ann");
    expect(g.last("room")!.hostId).toBe("bob");
  });
});

describe("preset tracks", () => {
  it("skips sketching and goes straight to the countdown on a named track", () => {
    const g = setup(["ann", "bob"], 1, false);
    g.readyAll();
    expect(g.room.phase).toBe("countdown");
    expect(PRESET_TRACKS.map((t) => t.name)).toContain(g.last("track")!.name);
  });

  it("plays every track before repeating one", () => {
    const g = setup(["ann", "bob"], 3, false);
    g.readyAll();
    const names: string[] = [];
    for (let i = 0; i < PRESET_TRACKS.length; i++) {
      names.push(g.last("track")!.name);
      g.run(COUNTDOWN_SECONDS + DT);
      g.knockOut(g.gridOrder()[1]!);
      g.run(ROUND_END_SECONDS + DT);
      if (g.room.phase === "matchEnd") {
        g.send(g.last("room")!.hostId!, { t: "again" });
        g.readyAll();
      }
    }
    expect(new Set(names).size).toBe(PRESET_TRACKS.length);
  });
});

describe("bots", () => {
  const roster = (g: ReturnType<typeof setup>) => g.last("room")!.players;

  it("can only be added by the host, and are always ready", () => {
    const g = setup(["ann", "bob"]);
    g.send("bob", { t: "addBot", skill: "easy" });
    expect(roster(g)).toHaveLength(2);
    g.send("ann", { t: "addBot", skill: "hard" });
    const bot = roster(g).find((p) => p.bot)!;
    expect(bot.ready).toBe(true);
    expect(bot.name).toContain("hard");
  });

  it("let a lone player start a match", () => {
    const g = setup(["ann"], 1, false);
    g.send("ann", { t: "addBot", skill: "medium" });
    g.send("ann", { t: "ready", ready: true });
    expect(g.room.phase).toBe("countdown");
  });

  it("drive themselves during the race", () => {
    const g = setup(["ann"], 1, false);
    g.send("ann", { t: "addBot", skill: "hard" });
    g.send("ann", { t: "ready", ready: true });
    g.run(COUNTDOWN_SECONDS + DT);
    const id = roster(g).find((p) => p.bot)!.id;
    const start = g.car(id);
    g.run(1);
    const moved = g.car(id);
    expect(Math.hypot(moved.x - start.x, moved.y - start.y)).toBeGreaterThan(100);
  });

  it("can be removed by the host", () => {
    const g = setup(["ann"]);
    g.send("ann", { t: "addBot", skill: "easy" });
    g.send("ann", { t: "removeBot", id: roster(g).find((p) => p.bot)!.id });
    expect(roster(g)).toHaveLength(1);
  });

  it("don't keep a room alive or take host", () => {
    const g = setup(["ann", "bob"]);
    g.send("ann", { t: "addBot", skill: "easy" });
    expect(g.room.size).toBe(2);
    g.room.leave("ann");
    expect(g.last("room")!.hostId).toBe("bob");
  });

  it("drop hazards once they're knocked out", () => {
    const g = setup(["ann"], 1, false);
    for (let i = 0; i < 3; i++) g.send("ann", { t: "addBot", skill: "hard" });
    g.send("ann", { t: "ready", ready: true });
    g.run(COUNTDOWN_SECONDS + DT);
    const track = buildTrack(g.last("track")!.raw);
    const behind = (id: string) => track.length - nearestOnTrack(track, g.car(id).x, g.car(id).y).s;
    const bots = roster(g).filter((p) => p.bot).map((p) => p.id);
    const victim = bots.sort((a, b) => behind(b) - behind(a))[0]!;
    const c = g.car(victim);
    g.run(ELIMINATION_GRACE + 0.1, () => g.send(victim, { t: "state", seq: 1, car: { ...c, x: c.x - 5000 } }));
    let placed = false;
    g.run(8, () => (placed ||= (g.last("snap")?.hazards ?? []).some((h) => h.owner === victim)));
    expect(placed).toBe(true);
  });
});
