import { describe, expect, it } from "vitest";
import { ChatFeed, chatLine, isUrgent, mergeKills, USERS, type StreamEvent } from "../src/ui/chat-lines";
import { RaceWatch, SHAVE_CLEAR, SHAVE_NEAR, signedGap } from "../src/ui/race-watch";
import { hash01, pick, seedFrom } from "../src/ui/stream-seed";
import { createViewerModel, formatClock, formatViewers } from "../src/ui/viewers";

describe("seedFrom", () => {
  it("is stable for a room code and differs between rooms", () => {
    expect(seedFrom("ABCD")).toBe(seedFrom("ABCD"));
    expect(seedFrom("ABCD")).not.toBe(seedFrom("ABCE"));
  });

  it("hashes to the unit interval and picks from the list", () => {
    for (let i = 0; i < 200; i++) {
      const v = hash01(seedFrom("ROOM"), i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(USERS).toContain(pick(USERS, 7, 1));
  });
});

describe("viewer model", () => {
  it("gives every client in a room the same count for the same events", () => {
    const a = createViewerModel(seedFrom("NEON"));
    const b = createViewerModel(seedFrom("NEON"));
    a.spike("eliminated", 100);
    b.spike("eliminated", 100);
    for (const t of [90, 100, 101.3, 140]) expect(a.count(t)).toBe(b.count(t));
  });

  it("drifts smoothly without events", () => {
    const m = createViewerModel(seedFrom("NEON"));
    const counts = Array.from({ length: 100 }, (_, i) => m.count(1000 + i * 0.1));
    for (let i = 1; i < counts.length; i++) expect(Math.abs(counts[i]! - counts[i - 1]!)).toBeLessThan(counts[0]! * 0.02);
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it("spikes on a hazard kill and settles back above where it started", () => {
    const m = createViewerModel(seedFrom("NEON"));
    const quiet = createViewerModel(seedFrom("NEON"));
    m.spike("hazardKill", 50);
    expect(m.count(50)).toBeGreaterThan(quiet.count(50) * 1.3);
    expect(m.count(120)).toBeGreaterThan(quiet.count(120));
    expect(m.count(120)).toBeLessThan(quiet.count(120) * 1.1);
  });

  it("dips the bitrate on big moments", () => {
    const m = createViewerModel(seedFrom("NEON"));
    const before = m.bitrate(10);
    m.spike("matchWon", 10);
    expect(m.bitrate(10)).toBeLessThan(before - 2);
    expect(m.bitrate(10)).toBeGreaterThan(0);
  });

  it("formats counts and the REC clock", () => {
    expect(formatViewers(4812)).toBe("4,812");
    expect(formatViewers(12345)).toBe("12.3k");
    expect(formatClock(3725.9)).toBe("01:02:05");
  });
});

describe("chatLine", () => {
  it("fills player names into the template", () => {
    const line = chatLine({ kind: "eliminated", name: "Bolt", reason: "fell" }, 1, 0);
    expect(line.text).toContain("Bolt");
    expect(USERS).toContain(line.user);
  });

  it("names both players on a hazard kill and hypes it", () => {
    const line = chatLine({ kind: "hazardKill", by: "Vex", victim: "Bolt" }, 1, 0);
    expect(line.text).toContain("Vex");
    expect(line.text).toContain("Bolt");
    expect(line.tone).toBe("hype");
  });

  it("is deterministic for a seed and varies with the counter", () => {
    const event: StreamEvent = { kind: "lead", name: "Bolt" };
    expect(chatLine(event, 9, 3)).toEqual(chatLine(event, 9, 3));
    expect(new Set(Array.from({ length: 20 }, (_, n) => chatLine(event, 9, n).text)).size).toBeGreaterThan(1);
  });

  it("never leaves a placeholder unfilled", () => {
    const events: StreamEvent[] = [
      { kind: "eliminated", name: "A", reason: "line" },
      { kind: "eliminated", name: "A", reason: "left" },
      { kind: "roundWon", name: null },
      { kind: "roundWon", name: "A" },
      { kind: "matchWon", name: "A" },
      { kind: "shave", name: "A" },
      { kind: "go" },
      { kind: "suddenDeath" },
      { kind: "ambient" },
    ];
    for (const e of events) for (let n = 0; n < 30; n++) expect(chatLine(e, 5, n).text).not.toMatch(/[{}]/);
  });

  it("slips city ads into the ambient chatter", () => {
    const tones = new Set(Array.from({ length: 40 }, (_, n) => chatLine({ kind: "ambient" }, 5, n).tone));
    expect(tones).toEqual(new Set(["ad", "chat"]));
  });

  it("treats eliminations as urgent and lead changes as filler", () => {
    expect(isUrgent({ kind: "eliminated", name: "A", reason: "fell" })).toBe(true);
    expect(isUrgent({ kind: "lead", name: "A" })).toBe(false);
  });
});

describe("mergeKills", () => {
  it("drops the plain elimination when a hazard kill explains it", () => {
    const events: StreamEvent[] = [
      { kind: "eliminated", name: "Bolt", reason: "line" },
      { kind: "hazardKill", by: "Vex", victim: "Bolt" },
      { kind: "eliminated", name: "Zap", reason: "fell" },
    ];
    expect(mergeKills(events).map((e) => e.kind)).toEqual(["hazardKill", "eliminated"]);
  });
});

describe("ChatFeed", () => {
  const msg = { user: "u", color: "#fff", text: "hi", tone: "chat" as const };

  it("drops filler that comes too soon but always posts urgent lines", () => {
    const feed = new ChatFeed({ max: 5, ttl: 9, gap: 3 });
    expect(feed.post(msg, false, 0)).toBe(true);
    expect(feed.post(msg, false, 1)).toBe(false);
    expect(feed.post(msg, true, 1.5)).toBe(true);
    expect(feed.post(msg, false, 5)).toBe(true);
  });

  it("keeps only the newest lines and expires old ones", () => {
    const feed = new ChatFeed({ max: 2, ttl: 9, gap: 0 });
    for (let t = 0; t < 4; t++) feed.post({ ...msg, text: String(t) }, true, t);
    expect(feed.lines.map((l) => l.text)).toEqual(["2", "3"]);
    expect(feed.expire(11.5)).toBe(true);
    expect(feed.lines.map((l) => l.text)).toEqual(["3"]);
  });
});

describe("signedGap", () => {
  it("measures distance ahead of the line around the loop", () => {
    expect(signedGap(150, 100, 1000)).toBe(50);
    expect(signedGap(50, 980, 1000)).toBe(70);
    expect(signedGap(90, 100, 1000)).toBe(-10);
  });
});

describe("RaceWatch", () => {
  it("announces a lead change once it has held, but not the first leader", () => {
    const w = new RaceWatch();
    expect(w.update([{ id: "a", gap: 900 }, { id: "b", gap: 800 }], 0)).toEqual([]);
    expect(w.update([{ id: "a", gap: 900 }, { id: "b", gap: 800 }], 2)).toEqual([]);
    expect(w.update([{ id: "a", gap: 800 }, { id: "b", gap: 900 }], 3)).toEqual([]);
    expect(w.update([{ id: "a", gap: 800 }, { id: "b", gap: 900 }], 5)).toEqual([{ kind: "lead", id: "b" }]);
  });

  it("ignores a lead that flickers back", () => {
    const w = new RaceWatch();
    w.update([{ id: "a", gap: 900 }, { id: "b", gap: 800 }], 0);
    w.update([{ id: "a", gap: 900 }, { id: "b", gap: 800 }], 2);
    w.update([{ id: "a", gap: 800 }, { id: "b", gap: 900 }], 3);
    w.update([{ id: "a", gap: 900 }, { id: "b", gap: 800 }], 3.5);
    expect(w.update([{ id: "a", gap: 800 }, { id: "b", gap: 900 }], 4)).toEqual([]);
  });

  it("calls a close shave when a car brushes the line and escapes", () => {
    const w = new RaceWatch();
    expect(w.update([{ id: "a", gap: SHAVE_NEAR / 2 }], 0)).toEqual([]);
    expect(w.update([{ id: "a", gap: SHAVE_CLEAR / 2 }], 1)).toEqual([]);
    expect(w.update([{ id: "a", gap: SHAVE_CLEAR + 1 }], 2)).toEqual([{ kind: "shave", id: "a" }]);
  });

  it("does not call a shave for a car the line caught", () => {
    const w = new RaceWatch();
    w.update([{ id: "a", gap: 10 }, { id: "b", gap: 900 }], 0);
    w.update([{ id: "b", gap: 900 }], 1);
    expect(w.update([{ id: "a", gap: SHAVE_CLEAR + 1 }, { id: "b", gap: 900 }], 2)).toEqual([]);
  });
});

describe("chat feed emote stacking", () => {
  const emote = (user: string, text: string) => ({ user, color: "#fff", text, tone: "player" as const });

  it("stacks a player's repeated emotes onto their latest line", () => {
    const feed = new ChatFeed();
    feed.post(emote("ann", "🔥"), true, 0);
    expect(feed.stack("ann", "😂", 1)).toBe(true);
    expect(feed.lines.map((l) => l.text)).toEqual(["🔥😂"]);
  });

  it("starts a new line when someone else posted last", () => {
    const feed = new ChatFeed();
    feed.post(emote("ann", "🔥"), true, 0);
    feed.post(emote("bob", "👋"), true, 0);
    expect(feed.stack("ann", "😂", 1)).toBe(false);
  });

  it("keeps only the latest dozen emotes on a line", () => {
    const feed = new ChatFeed();
    feed.post(emote("ann", "🔥"), true, 0);
    for (let i = 0; i < 20; i++) feed.stack("ann", "😂", i);
    expect([...feed.lines[0]!.text]).toHaveLength(12);
  });
});
