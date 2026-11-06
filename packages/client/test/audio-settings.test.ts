import { describe, expect, it } from "vitest";
import { createSettings, DEFAULT_SETTINGS, parseSettings, SETTINGS_KEY } from "../src/audio/settings";

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("audio settings", () => {
  it("defaults to quiet music and moderate sfx, unmuted", () => {
    const s = createSettings(memory()).get();
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.music).toBeLessThan(s.sfx);
    expect(s.muted).toBe(false);
  });

  it("persists changes and restores them in a new session", () => {
    const store = memory();
    const first = createSettings(store);
    first.set({ music: 0.1 });
    first.toggleMute();
    expect(createSettings(store).get()).toEqual({ music: 0.1, sfx: DEFAULT_SETTINGS.sfx, muted: true });
  });

  it("clamps out-of-range volumes and ignores junk", () => {
    expect(parseSettings(JSON.stringify({ music: 4, sfx: -1, muted: "yes" }))).toEqual({ music: 1, sfx: 0, muted: false });
    expect(parseSettings("{not json")).toEqual(DEFAULT_SETTINGS);
    expect(createSettings(memory({ [SETTINGS_KEY]: "null" })).get()).toEqual(DEFAULT_SETTINGS);
  });

  it("notifies subscribers until they unsubscribe", () => {
    const settings = createSettings(memory());
    const seen: boolean[] = [];
    const off = settings.subscribe((s) => seen.push(s.muted));
    settings.toggleMute();
    off();
    settings.toggleMute();
    expect(seen).toEqual([true]);
  });

  it("keeps working when storage throws", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    const settings = createSettings(broken);
    settings.set({ sfx: 0.2 });
    expect(settings.get().sfx).toBe(0.2);
  });
});
