import { describe, expect, it } from "vitest";
import { createDisplaySettings, DEFAULT_DISPLAY, DISPLAY_KEY, parseDisplay } from "../src/display-settings";

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("display settings", () => {
  it("defaults to CRT off", () => {
    expect(createDisplaySettings(memory()).get()).toEqual({ crt: false });
    expect(DEFAULT_DISPLAY.crt).toBe(false);
  });

  it("persists the CRT toggle and restores it in a new session", () => {
    const store = memory();
    createDisplaySettings(store).toggleCrt();
    expect(createDisplaySettings(store).get()).toEqual({ crt: true });
  });

  it("ignores junk", () => {
    expect(parseDisplay(JSON.stringify({ crt: "yes" }))).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay("{not json")).toEqual(DEFAULT_DISPLAY);
    expect(createDisplaySettings(memory({ [DISPLAY_KEY]: "null" })).get()).toEqual(DEFAULT_DISPLAY);
  });

  it("notifies subscribers until they unsubscribe", () => {
    const settings = createDisplaySettings(memory());
    const seen: boolean[] = [];
    const off = settings.subscribe((s) => seen.push(s.crt));
    settings.toggleCrt();
    off();
    settings.toggleCrt();
    expect(seen).toEqual([true]);
  });

  it("keeps working when storage throws", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    const settings = createDisplaySettings(broken);
    settings.toggleCrt();
    expect(settings.get().crt).toBe(true);
  });
});
