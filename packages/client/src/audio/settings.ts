export interface AudioSettings {
  music: number;
  sfx: number;
  muted: boolean;
}

type Store = Pick<Storage, "getItem" | "setItem">;
type Listener = (settings: AudioSettings) => void;

export const SETTINGS_KEY = "neon.audio";
export const DEFAULT_SETTINGS: AudioSettings = { music: 0.35, sfx: 0.7, muted: false };

const clamp01 = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

export function parseSettings(raw: string | null): AudioSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof AudioSettings, unknown>>;
    return {
      music: clamp01(data.music, DEFAULT_SETTINGS.music),
      sfx: clamp01(data.sfx, DEFAULT_SETTINGS.sfx),
      muted: typeof data.muted === "boolean" ? data.muted : DEFAULT_SETTINGS.muted,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const volumeToGain = (v: number) => v * v;

export function createSettings(store: Store | null) {
  let current = parseSettings(read(store));
  const listeners = new Set<Listener>();

  const set = (patch: Partial<AudioSettings>) => {
    current = parseSettings(JSON.stringify({ ...current, ...patch }));
    try {
      store?.setItem(SETTINGS_KEY, JSON.stringify(current));
    } catch {}
    for (const fn of listeners) fn(current);
  };

  return {
    get: (): AudioSettings => current,
    set,
    toggleMute: () => set({ muted: !current.muted }),
    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettings>;

function read(store: Store | null): string | null {
  try {
    return store?.getItem(SETTINGS_KEY) ?? null;
  } catch {
    return null;
  }
}
