import type { Camera } from "@neon/sim";
import { createGraph, createSfx, type Graph } from "./graph";
import type { Mood } from "./sequencer";
import { createSettings } from "./settings";
import type { AudibleCar } from "./voices";

const PUMP_MS = 50;
const LOOKAHEAD = 0.25;
const HIDDEN_LOOKAHEAD = 1.5;
const GESTURES = ["pointerdown", "keydown", "touchstart"] as const;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export function createAudio(storage: Storage | null = safeLocalStorage()) {
  const settings = createSettings(storage);
  let ctx: AudioContext | null = null;
  let graph: Graph | null = null;
  let mood: Mood = "off";
  let intensity = 0;
  let paused = false;

  const running = () => (ctx?.state === "running" ? graph : null);

  function unlock() {
    if (!ctx) {
      try {
        ctx = new AudioContext({ latencyHint: "interactive" });
      } catch {
        detach();
        return;
      }
      graph = createGraph(ctx);
      graph.apply(settings.get());
      graph.music.setIntensity(intensity);
      graph.music.setMood(mood);
      graph.music.setPaused(paused);
      settings.subscribe((s) => graph?.apply(s));
      setInterval(() => {
        if (!ctx || ctx.state !== "running") return;
        graph!.music.pump(ctx.currentTime + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD));
      }, PUMP_MS);
    }
    if (ctx.state === "suspended") void ctx.resume();
  }

  function detach() {
    for (const type of GESTURES) window.removeEventListener(type, unlock, true);
  }

  if (typeof window !== "undefined") for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true, passive: true });

  const sfx = createSfx(() => running()?.sfxOut ?? null, () => ctx?.currentTime ?? 0);

  return {
    settings,
    sfx,
    unlock,
    music: {
      setMood(next: Mood) {
        mood = next;
        graph?.music.setMood(next);
      },
      setIntensity(value: number) {
        intensity = value;
        graph?.music.setIntensity(value);
      },
      /** Hold the music mid-phrase, as the pause menu does to a race. */
      setPaused(value: boolean) {
        paused = value;
        graph?.music.setPaused(value);
      },
      get mood() {
        return mood;
      },
    },
    engines: {
      update(cars: AudibleCar[], camera: Camera) {
        running()?.engines.update(cars, camera);
      },
      stop() {
        graph?.engines.stop();
      },
    },
    danger(level: number) {
      running()?.danger(level);
    },
  };
}

function safeLocalStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export type Audio = ReturnType<typeof createAudio>;
