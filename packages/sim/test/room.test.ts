import { afterEach, describe, expect, it } from "vitest";
import { isOutsideView, LINE_GAP, SUDDEN_DEATH_AT } from "../src/camera";
import { emptyInput } from "../src/car";
import type { ClientMsg, GameEvent, Mode, ServerMsg, WinCondition } from "../src/protocol";
import { COUNTDOWN_SECONDS, DEFAULT_WIN, ELIMINATION_GRACE, ROUND_END_SECONDS, Room, SKETCH_SECONDS, SNAP_EVERY, TICK_RATE } from "../src/room";
import { buildTrack, dropAt, nearestOnTrack, ovalPoints, pointAt, TRACK_WIDTH, type Point, type Track } from "../src/track";
import { PRESET_TRACKS, type PresetTrack } from "../src/tracks";

const DT = 1 / TICK_RATE;
const loop: Point[] = ovalPoints(3200, 2000, 2200, 1300);
const loopTrack = buildTrack(loop);
const dropAhead: PresetTrack = { name: "Drop Ahead", points: loop, features: [{ kind: "drop", at: pointAt(loopTrack, 400).slice(0, 2) as Point, span: 200 }] };

const figureEight: PresetTrack = {
  name: "Figure Eight",
  points: Array.from({ length: 240 }, (_, i): Point => {
    const t = Math.PI / 2 + (i / 240) * Math.PI * 2;
    return [3200 + 2600 * Math.sin(t), 2000 + 1500 * Math.sin(2 * t)];
  }),
  features: [],
};

let savedPresets: PresetTrack[] | null = null;
const usePresets = (...tracks: PresetTrack[]) => {
  const old = PRESET_TRACKS.splice(0, PRESET_TRACKS.length, ...tracks);
  savedPresets ??= old;
};
afterEach(() => {
  if (savedPresets) PRESET_TRACKS.splice(0, PRESET_TRACKS.length, ...savedPresets);
  savedPresets = null;
});

function setup(names = ["ann", "bob"], seed = 1, sketching = true, mode: Mode = "ghost", snapEvery?: number) {
  const sent: { to: string | "*"; msg: ServerMsg }[] = [];
  let s = seed;
  const rng = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const room = new Room("ABCD", { send: (to, msg) => sent.push({ to, msg }), broadcast: (msg) => sent.push({ to: "*", msg }) }, { rng, sketching, snapEvery });
  names.forEach((n) => room.join(n, n));
  room.handle(names[0]!, { t: "mode", mode });
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
  let built: { msg: unknown; track: Track } | null = null;
  const track = () => {
    const msg = last("track")!;
    if (built?.msg !== msg) built = { msg, track: buildTrack(msg.raw, msg.features) };
    return built.track;
  };
  const arc = (id: string) => nearestOnTrack(track(), car(id).x, car(id).y).s;
  const gridOrder = () => {
    const ref = arc(names[0]!);
    const ahead = (id: string) => {
      const d = arc(id) - ref;
      const L = track().length;
      return d > L / 2 ? d - L : d < -L / 2 ? d + L : d;
    };
    return [...names].sort((a, b) => ahead(b) - ahead(a));
  };
  const knockOut = (id: string) => {
    const from = arc(id);
    for (let seq = 1; seq < 600 && car(id).alive; seq++) {
      const [x, y, angle] = pointAt(track(), from - Math.min(seq * 40, LINE_GAP + 400));
      send(id, { t: "state", seq, car: { x, y, angle, vx: 0, vy: 0 } });
      run(DT);
    }
  };
  const driveForward = (ids: string[], distance: number) => {
    const from = Object.fromEntries(ids.map((id) => [id, arc(id)]));
    let seq = 0;
    run(distance / 40 / TICK_RATE, () => {
      seq++;
      for (const id of ids) {
        const [x, y, angle] = pointAt(track(), from[id]! + seq * 40);
        send(id, { t: "state", seq, car: { x, y, angle, vx: 0, vy: 0 } });
      }
    });
    run(SNAP_EVERY * DT);
  };
  const score = (id: string) => last("room")!.players.find((p) => p.id === id)!.score;
  const finish = (...outFirstToLast: string[]) => outFirstToLast.forEach(knockOut);
  const nextRace = () => {
    run(ROUND_END_SECONDS + DT);
    run(COUNTDOWN_SECONDS + DT);
  };
  const win = (id: string) => {
    driveForward([id], 300);
    finish(...names.filter((n) => n !== id && car(n)?.alive));
  };
  const setWin = (condition: WinCondition) => send(last("room")!.hostId!, { t: "winCondition", ...condition });
  const leaderProgress = () => {
    run(SNAP_EVERY * DT);
    return last("snap")!.line! + LINE_GAP;
  };
  return { room, sent, run, last, events, send, readyAll, drawer, toRace, car, arc, gridOrder, knockOut, score, finish, nextRace, driveForward, win, setWin, leaderProgress, track };
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

  it("starts in contact mode", () => {
    expect(new Room("ABCD", { send: () => {}, broadcast: () => {} }).mode).toBe("contact");
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

  it("frames the countdown the way the race opens so the camera doesn't jump at the start", () => {
    const g = setup();
    g.readyAll();
    g.send(g.drawer(), { t: "sketch", points: loop, reset: true });
    g.send(g.drawer(), { t: "submit" });
    g.run(DT * SNAP_EVERY);
    const before = g.last("snap")!.camera;
    g.run(COUNTDOWN_SECONDS + 0.3);
    const after = g.last("snap")!.camera;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(20);
    expect(after.scale).toBeCloseTo(before.scale, 1);
  });

  it.each([
    [undefined, SNAP_EVERY],
    [1, 1],
  ])("sends a snapshot every %s tick(s) in a race (default %s)", (snapEvery, expected) => {
    const g = setup(["ann", "bob"], 1, true, "ghost", snapEvery);
    g.toRace();
    const ticks = () => g.sent.filter((m) => m.msg.t === "snap").map((m) => (m.msg as Extract<ServerMsg, { t: "snap" }>).tick);
    const before = ticks().length;
    g.run(DT * 12);
    const sent = ticks().slice(before);
    expect(sent).toHaveLength(12 / expected);
    expect(sent.slice(1).map((t, i) => t - sent[i]!)).toEqual(Array(12 / expected - 1).fill(expected));
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

  it("eliminates a car that drops behind the line", () => {
    const g = setup();
    g.toRace();
    const [front, back] = g.gridOrder();
    g.driveForward([front!], LINE_GAP + 200);
    g.run(ELIMINATION_GRACE);
    expect(g.room.phase).toBe("roundEnd");
    expect(g.events()).toContainEqual({ kind: "eliminated", id: back, reason: "line" });
    expect(g.events()).toContainEqual({ kind: "roundWon", id: front });
  });

  it("leaves a car that drives off into the city to the line rather than the edge of the screen", () => {
    const g = setup();
    g.toRace();
    const [front, back] = g.gridOrder();
    const start = g.car(back!);
    const out = Math.atan2(start.y - 2000, start.x - 3200);
    let seq = 0;
    g.run(ELIMINATION_GRACE + 1, () => {
      const d = Math.min(++seq * 30, 3000);
      g.send(back!, { t: "state", seq, car: { ...start, x: start.x + Math.cos(out) * d, y: start.y + Math.sin(out) * d } });
    });
    expect(g.room.phase).toBe("race");
    expect(g.events().filter((e) => e.kind === "eliminated")).toEqual([]);
    g.driveForward([front!], LINE_GAP + 200);
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
    const leader = nearestOnTrack(g.track(), g.car(front!).x, g.car(front!).y).s - g.track().length;
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
});

describe("progress under lag", () => {
  it("keeps up with a ghost car whose updates stall, so the line doesn't catch it", () => {
    const g = setup();
    g.toRace();
    g.run(SUDDEN_DEATH_AT + 30);
    const [front, back] = g.gridOrder() as [string, string];
    const from = { [front]: g.arc(front), [back]: g.arc(back) };
    const stalled = (tick: number) => (tick >= 30 && tick < 75) || (tick >= 105 && tick < 150);
    let tick = 0;
    g.run(3, () => {
      tick++;
      for (const id of [front, back]) {
        if (id === back && (stalled(tick) || tick % 3)) continue;
        const [x, y, angle] = pointAt(g.track(), from[id]! + tick * 5);
        g.send(id, { t: "state", seq: tick, car: { x, y, angle, vx: 0, vy: 0 } });
      }
    });
    expect(g.events().filter((e) => e.kind === "eliminated")).toEqual([]);
    const L = g.track().length;
    expect((((g.arc(front) - g.arc(back)) % L) + L) % L).toBeLessThan(100);
  });

  it("still ignores a jump across the infield", () => {
    const g = setup();
    g.toRace();
    const [front] = g.gridOrder();
    g.driveForward([front!], 300);
    const before = g.leaderProgress();
    g.run(0.5);
    const [x, y, angle] = pointAt(g.track(), g.arc(front!) + g.track().length * 0.45);
    g.send(front!, { t: "state", seq: 9999, car: { x, y, angle, vx: 0, vy: 0 } });
    g.run(SNAP_EVERY * DT);
    expect(g.leaderProgress()).toBeCloseTo(before, 0);
  });
});

describe("crossing tracks", () => {
  it("keeps the leader's progress climbing steadily through both passes of a crossing", () => {
    usePresets(figureEight);
    const g = setup(["ann", "bob"], 1, false);
    g.toRace();
    const track = g.track();
    const from = { ann: g.arc("ann"), bob: g.arc("bob") };
    const before = g.leaderProgress();
    const steps = Math.round((track.length * 0.9) / 40);
    for (let seq = 1; seq <= steps; seq++) {
      for (const id of ["ann", "bob"] as const) {
        const [x, y, angle] = pointAt(track, from[id] + seq * 40);
        const side = seq % 2 ? 50 : -50;
        g.send(id, { t: "state", seq, car: { x: x - Math.sin(angle) * side, y: y + Math.cos(angle) * side, angle, vx: 0, vy: 0 } });
      }
      g.run(DT);
    }
    expect(g.room.phase).toBe("race");
    expect(g.leaderProgress() - before).toBeCloseTo(steps * 40, 0);
  });
});

describe("emotes", () => {
  it("lets eliminated players send emotes to the room", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.toRace();
    const [, , back] = g.gridOrder();
    g.knockOut(back!);
    g.send(back!, { t: "emote", emote: "lol" });
    expect(g.events()).toContainEqual({ kind: "emote", id: back, emote: "lol" });
  });

  it("ignores emotes from players still racing and unknown emotes", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.toRace();
    const [front, , back] = g.gridOrder();
    g.knockOut(back!);
    g.send(front!, { t: "emote", emote: "lol" });
    g.send(back!, { t: "emote", emote: "nope" as never });
    expect(g.events().filter((e) => e.kind === "emote")).toEqual([]);
  });

  it("allows spamming at up to ten emotes a second per player", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.toRace();
    const [, , back] = g.gridOrder();
    g.knockOut(back!);
    g.run(1, () => g.send(back!, { t: "emote", emote: "fire" }));
    expect(g.events().filter((e) => e.kind === "emote")).toHaveLength(10);
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
  it("eliminates a car that leaves the road over a drop", () => {
    usePresets(dropAhead);
    const g = setup(["ann", "bob"], 1, false);
    g.readyAll();
    expect(g.last("track")!.features).toEqual(dropAhead.features);
    g.run(COUNTDOWN_SECONDS + DT);
    g.driveForward(["ann", "bob"], 400 + g.track().length - g.arc("ann"));
    expect(dropAt(g.track(), g.arc("ann"))).toBe(true);
    const c = g.car("ann");
    g.send("ann", { t: "state", seq: 999, car: { ...c, x: c.x + TRACK_WIDTH } });
    g.run(ELIMINATION_GRACE);
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
  it("ends a first-to-target match and returns to the lobby on request", () => {
    const g = setup();
    g.setWin({ kind: "score", target: 5 });
    g.toRace();
    while (g.room.phase === "race") {
      g.win(g.gridOrder()[0]!);
      g.run(ROUND_END_SECONDS + DT);
      if ((g.room.phase as string) === "countdown") g.run(COUNTDOWN_SECONDS + DT);
    }
    expect(g.room.phase).toBe("matchEnd");
    const winner = (g.events().find((e) => e.kind === "matchWon") as { id: string }).id;
    expect(g.score(winner)).toBeGreaterThanOrEqual(5);
    expect(g.last("room")!.players.filter((p) => p.score >= 5)).toHaveLength(1);
    const host = g.last("room")!.hostId!;
    g.send(host === "ann" ? "bob" : "ann", { t: "again" });
    expect(g.room.phase).toBe("matchEnd");
    g.send(host, { t: "again" });
    expect(g.room.phase).toBe("lobby");
  });

  const playMatch = (g: ReturnType<typeof setup>) => {
    g.setWin({ kind: "score", target: 5 });
    g.toRace();
    while (g.room.phase === "race") {
      g.win(g.gridOrder()[0]!);
      g.run(ROUND_END_SECONDS + DT);
      if ((g.room.phase as string) === "countdown") g.run(COUNTDOWN_SECONDS + DT);
    }
  };
  const lastAwards = (g: ReturnType<typeof setup>) => (g.events().at(-1) as Extract<GameEvent, { kind: "awards" }>).awards;

  it("hands out awards straight after the match is won", () => {
    const g = setup();
    playMatch(g);
    expect(g.events().at(-2)!.kind).toBe("matchWon");
    expect(g.events().at(-1)!.kind).toBe("awards");
    const titles = lastAwards(g).map((a) => a.title);
    expect(titles).toContain("Garbage Collected");
    expect(titles).toContain("Sponsored Content");
    expect(titles).toContain("Main Character Energy");
  });

  it("starts every match with fresh stats", () => {
    const g = setup();
    playMatch(g);
    g.send(g.last("room")!.hostId!, { t: "again" });
    const before = g.events().length;
    playMatch(g);
    const wins = g.events().slice(before).filter((e) => e.kind === "roundWon");
    const sponsored = lastAwards(g).find((a) => a.title === "Sponsored Content")!;
    const mostWins = Math.max(...["ann", "bob"].map((id) => wins.filter((e) => e.kind === "roundWon" && e.id === id).length));
    expect(sponsored.stat).toBe(`${mostWins} rounds won`);
  });

  it("counts hazards placed and hazard kills towards awards", () => {
    const g = setup(["ann", "bob", "cat", "dan"]);
    g.setWin({ kind: "laps", laps: 2 });
    g.toRace();
    const [front, second, middle, back] = g.gridOrder();
    g.knockOut(back!);
    const victim = g.car(middle!);
    g.send(back!, { t: "hazard", kind: "slow", x: victim.x, y: victim.y });
    g.run(1);
    g.knockOut(middle!);
    g.driveForward([front!, second!], g.track().length * 2 + 400);
    g.run(ROUND_END_SECONDS + DT);
    expect(g.room.phase).toBe("matchEnd");
    expect(lastAwards(g)).toContainEqual({ id: back, title: "Black ICE Dealer", blurb: expect.any(String), stat: "1 racer flatlined" });
  });

  const vote = (g: ReturnType<typeof setup>, ...ids: string[]) => ids.forEach((id) => g.send(id, { t: "rematch", in: true }));
  const info = (g: ReturnType<typeof setup>, id: string) => g.last("room")!.players.find((p) => p.id === id)!;
  const matchWinner = (g: ReturnType<typeof setup>) => (g.events().filter((e) => e.kind === "matchWon").at(-1) as { id: string }).id;

  it("starts a rematch once every racer votes for one, and tallies match wins for the session", () => {
    const g = setup(["ann", "bob"], 1, false);
    playMatch(g);
    const winner = matchWinner(g);
    vote(g, "ann");
    expect(g.room.phase).toBe("matchEnd");
    expect(info(g, "ann").rematch).toBe(true);
    vote(g, "bob");
    expect(g.room.phase).toBe("countdown");
    expect(info(g, winner).wins).toBe(1);
    expect(info(g, "ann").score).toBe(0);
    expect(info(g, "ann").rematch).toBe(false);
  });

  it("starts the rematch when the last holdout leaves", () => {
    const g = setup(["ann", "bob", "cat"], 1, false);
    playMatch(g);
    vote(g, "ann", "bob");
    expect(g.room.phase).toBe("matchEnd");
    g.room.leave("cat");
    expect(g.room.phase).toBe("countdown");
  });

  it("only takes rematch votes at the end of a match", () => {
    const g = setup(["ann", "bob"], 1, false);
    g.toRace();
    vote(g, "ann", "bob");
    expect(g.room.phase).toBe("race");
    expect(info(g, "ann").rematch).toBe(false);
  });

  it("drops the session tally for a player who leaves", () => {
    const g = setup(["ann", "bob", "cat"], 1, false);
    playMatch(g);
    const winner = matchWinner(g);
    g.room.leave(winner);
    g.room.join(winner, winner);
    expect(info(g, winner).wins).toBe(0);
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

describe("rounds within a match", () => {
  const trackMessages = (g: ReturnType<typeof setup>) => g.sent.filter((m) => m.msg.t === "track").length;

  it("stay on the same track", () => {
    const g = setup(["ann", "bob"], 1, false);
    g.readyAll();
    g.run(COUNTDOWN_SECONDS + DT);
    g.win("ann");
    g.nextRace();
    g.win("bob");
    g.nextRace();
    expect(g.room.phase).toBe("race");
    expect(g.last("room")!.round).toBe(3);
    expect(trackMessages(g)).toBe(1);
  });

  it("only sketch once per match", () => {
    const g = setup();
    g.toRace();
    g.win("ann");
    g.run(ROUND_END_SECONDS + DT);
    expect(g.room.phase).toBe("countdown");
    expect(trackMessages(g)).toBe(1);
  });

  it("restart the pack behind where the winner finished, keeping progress continuous", () => {
    const g = setup(["ann", "bob", "cat"]);
    g.toRace();
    g.driveForward(["ann"], 500);
    const finishedAt = g.car("ann");
    g.finish("cat", "bob");
    const lastRaceSnap = g.sent.filter((m) => m.msg.t === "snap" && m.msg.phase === "race").at(-1)!.msg as Extract<ServerMsg, { t: "snap" }>;
    g.run(ROUND_END_SECONDS + DT);
    expect(g.room.phase).toBe("countdown");
    expect(Math.hypot(g.car("ann").x - finishedAt.x, g.car("ann").y - finishedAt.y)).toBeLessThan(TRACK_WIDTH / 2);
    expect(g.gridOrder()).toEqual(["ann", "bob", "cat"]);
    expect(g.arc("ann") - g.arc("cat")).toBeLessThan(250);
    expect(isOutsideView(g.last("snap")!.camera, g.car("ann").x, g.car("ann").y)).toBe(false);
    g.run(COUNTDOWN_SECONDS + DT);
    expect(g.leaderProgress()).toBeCloseTo(lastRaceSnap.line! + LINE_GAP, 0);
  });

  it("move the restart grid forward off a drop", () => {
    usePresets(dropAhead);
    const g = setup(["ann", "bob"], 1, false);
    g.readyAll();
    g.run(COUNTDOWN_SECONDS + DT);
    const [front, back] = g.gridOrder();
    g.driveForward([front!], 400 + g.track().length - g.arc(front!));
    expect(dropAt(g.track(), g.arc(front!))).toBe(true);
    const before = g.leaderProgress();
    g.knockOut(back!);
    g.run(ROUND_END_SECONDS + DT);
    expect(g.room.phase).toBe("countdown");
    for (const id of ["ann", "bob"]) expect(dropAt(g.track(), g.arc(id))).toBe(false);
    g.run(COUNTDOWN_SECONDS + DT);
    expect(g.leaderProgress()).toBeGreaterThan(before);
    expect(g.leaderProgress() - before).toBeLessThan(400);
  });
});

describe("win condition", () => {
  it("defaults to three laps and only the host can change it to an allowed value", () => {
    const g = setup();
    const win = () => g.last("room")!.win;
    expect(win()).toEqual({ kind: "laps", laps: 3 });
    g.send("bob", { t: "winCondition", kind: "score", target: 5 });
    expect(win()).toEqual(DEFAULT_WIN);
    for (const bad of [{ kind: "laps", laps: 4 }, { kind: "score", target: 7 }, { kind: "time" }]) g.send("ann", { t: "winCondition", ...bad } as unknown as ClientMsg);
    expect(win()).toEqual(DEFAULT_WIN);
    g.send("ann", { t: "winCondition", kind: "score", target: 12 });
    expect(win()).toEqual({ kind: "score", target: 12 });
  });

  it("ends a lap race the moment the leader completes the final lap", () => {
    const g = setup();
    g.setWin({ kind: "laps", laps: 2 });
    g.toRace();
    const [front, back] = g.gridOrder();
    expect(g.last("snap")!.lap).toBe(1);
    g.driveForward([front!, back!], g.track().length + 100);
    expect(g.last("snap")!.lap).toBe(2);
    g.driveForward([front!, back!], g.track().length);
    expect(g.room.phase).toBe("roundEnd");
    expect(g.events()).toContainEqual({ kind: "roundScored", results: [{ id: front, delta: 2 }, { id: back, delta: 1 }] });
    g.run(ROUND_END_SECONDS + DT);
    expect(g.room.phase).toBe("matchEnd");
    expect(g.events()).toContainEqual({ kind: "matchWon", id: front });
  });

  it("breaks a tie on points in favour of whoever got furthest", () => {
    const g = setup();
    g.setWin({ kind: "laps", laps: 2 });
    g.toRace();
    g.win("ann");
    g.nextRace();
    g.driveForward(["bob"], 400);
    g.driveForward(["ann", "bob"], g.track().length * 2);
    expect(g.room.phase).toBe("roundEnd");
    expect([g.score("ann"), g.score("bob")]).toEqual([3, 3]);
    g.run(ROUND_END_SECONDS + DT);
    expect(g.events()).toContainEqual({ kind: "matchWon", id: "bob" });
  });

  it("does not count laps in a first-to-target match", () => {
    const g = setup();
    g.setWin({ kind: "score", target: 8 });
    g.toRace();
    expect(g.last("snap")!.lap).toBeNull();
    g.driveForward(["ann", "bob"], g.track().length * 3);
    expect(g.room.phase).toBe("race");
  });
});

describe("track selection", () => {
  const all = PRESET_TRACKS.map((t) => t.name);
  const selection = (g: ReturnType<typeof setup>) => g.last("room")!.tracks;
  const matchTracks = (g: ReturnType<typeof setup>, matches: number) =>
    Array.from({ length: matches }, () => {
      g.readyAll();
      const name = g.last("track")!.name;
      g.room.leave("bob");
      g.room.join("bob", "bob");
      return name;
    });

  it("starts with every track and only the host can change it", () => {
    const g = setup(["ann", "bob"], 1, false);
    expect(selection(g)).toEqual(all);
    g.send("bob", { t: "tracks", names: [all[0]!] });
    expect(selection(g)).toEqual(all);
    g.send("ann", { t: "tracks", names: [all[0]!] });
    expect(selection(g)).toEqual([all[0]]);
  });

  it("ignores unknown names and never leaves the rotation empty", () => {
    const g = setup(["ann", "bob"], 1, false);
    g.send("ann", { t: "tracks", names: ["Nowhere", all[2]!, all[1]!] });
    expect(selection(g)).toEqual([all[1], all[2]]);
    g.send("ann", { t: "tracks", names: [] });
    g.send("ann", { t: "tracks", names: ["Nowhere"] });
    expect(selection(g)).toEqual([all[1], all[2]]);
  });

  it("draws each match's track from the selection without repeats until all have been played", () => {
    const g = setup(["ann", "bob"], 3, false);
    const picked = all.slice(0, 3);
    g.send("ann", { t: "tracks", names: picked });
    const names = matchTracks(g, 6);
    expect(new Set(names.slice(0, 3))).toEqual(new Set(picked));
    expect(new Set(names.slice(3))).toEqual(new Set(picked));
  });

  it("repeats a single selected track every match", () => {
    const g = setup(["ann", "bob"], 3, false);
    g.send("ann", { t: "tracks", names: [all[4]!] });
    expect(matchTracks(g, 3)).toEqual([all[4], all[4], all[4]]);
  });

  it("plays every track before repeating one by default", () => {
    const g = setup(["ann", "bob"], 3, false);
    expect(new Set(matchTracks(g, all.length)).size).toBe(all.length);
  });
});

describe("preset tracks", () => {
  it("skip sketching and go straight to the countdown on a named track", () => {
    const g = setup(["ann", "bob"], 1, false);
    g.readyAll();
    expect(g.room.phase).toBe("countdown");
    expect(PRESET_TRACKS.map((t) => t.name)).toContain(g.last("track")!.name);
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
    for (let n = 0; n < 4; n++) g.send("ann", { t: "addBot", skill: "medium" });
    expect(roster(g).filter((p) => p.bot).every((p) => p.name.endsWith(")"))).toBe(true);
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

  it("pick up speed in the slipstream of a car ahead", () => {
    const botSpeed = (tow: boolean) => {
      usePresets({ name: "Loop", points: loop, features: [] });
      const g = setup(["ann"], 1, false);
      g.send("ann", { t: "addBot", skill: "hard" });
      g.send("ann", { t: "ready", ready: true });
      g.run(COUNTDOWN_SECONDS + DT);
      const id = roster(g).find((p) => p.bot)!.id;
      let seq = 0;
      g.run(1.5, () => {
        if (!tow) return;
        const b = g.car(id);
        const fx = Math.cos(b.angle);
        const fy = Math.sin(b.angle);
        g.send("ann", { t: "state", seq: ++seq, car: { x: b.x + fx * 120, y: b.y + fy * 120, angle: b.angle, vx: fx * 650, vy: fy * 650 } });
      });
      const b = g.car(id);
      return Math.hypot(b.vx, b.vy);
    };
    expect(botSpeed(true)).toBeGreaterThan(botSpeed(false) + 40);
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
    g.knockOut(victim);
    let placed = false;
    g.run(8, () => (placed ||= (g.last("snap")?.hazards ?? []).some((h) => h.owner === victim)));
    expect(placed).toBe(true);
  });
});

describe("cup", () => {
  const playLeg = (g: ReturnType<typeof setup>) => {
    g.run(COUNTDOWN_SECONDS + DT);
    while (g.room.phase === "race") {
      g.win(g.gridOrder()[0]!);
      g.run(ROUND_END_SECONDS + DT);
      if ((g.room.phase as string) === "countdown") g.run(COUNTDOWN_SECONDS + DT);
    }
  };
  const info = (g: ReturnType<typeof setup>, id: string) => g.last("room")!.players.find((p) => p.id === id)!;

  it("only lets the host set a cup in the lobby", () => {
    const g = setup(["ann", "bob"], 1, false);
    g.send("bob", { t: "cup", legs: 3 });
    expect(g.last("room")!.cup).toBe(0);
    g.send("ann", { t: "cup", legs: 3 });
    expect(g.last("room")!.cup).toBe(3);
    g.send("ann", { t: "cup", legs: 4 as never });
    expect(g.last("room")!.cup).toBe(3);
  });

  it("plays each leg on a new track, carrying cup points, and crowns the winner after the last leg", () => {
    const g = setup(["ann", "bob"], 1, false);
    g.send("ann", { t: "cup", legs: 3 });
    g.setWin({ kind: "score", target: 5 });
    g.readyAll();
    const tracks = [g.last("track")!.name];
    playLeg(g);
    expect(g.room.phase).toBe("matchEnd");
    expect(g.last("room")!.leg).toBe(1);
    expect(g.events().at(-1)!.kind).toBe("matchWon");
    const points = ["ann", "bob"].map((id) => info(g, id).cupPoints).sort((a, b) => b - a);
    expect(points).toEqual([10, 6]);

    for (const leg of [2, 3]) {
      g.send("ann", { t: "rematch", in: true });
      g.send("bob", { t: "rematch", in: true });
      expect(g.last("room")!.leg).toBe(leg);
      tracks.push(g.last("track")!.name);
      playLeg(g);
    }
    expect(new Set(tracks).size).toBe(3);
    const total = ["ann", "bob"].map((id) => info(g, id).cupPoints);
    expect(total[0]! + total[1]!).toBe(48);
    const champion = total[0]! > total[1]! ? "ann" : "bob";
    expect(g.events().at(-2)).toEqual({ kind: "cupWon", id: champion });
    expect(g.events().at(-1)!.kind).toBe("awards");
    expect(info(g, champion).wins).toBe(1);
    expect(info(g, champion === "ann" ? "bob" : "ann").wins).toBe(0);
  });

  it("starts a fresh cup after the last leg", () => {
    const g = setup(["ann", "bob"], 1, false);
    g.send("ann", { t: "cup", legs: 3 });
    g.setWin({ kind: "score", target: 5 });
    g.readyAll();
    for (let leg = 1; leg <= 3; leg++) {
      playLeg(g);
      g.send("ann", { t: "rematch", in: true });
      g.send("bob", { t: "rematch", in: true });
    }
    expect(g.last("room")!.leg).toBe(1);
    expect(info(g, "ann").cupPoints + info(g, "bob").cupPoints).toBe(0);
  });
});
