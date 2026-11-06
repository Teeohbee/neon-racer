export interface DisplaySettings {
  crt: boolean;
}

type Store = Pick<Storage, "getItem" | "setItem">;
type Listener = (settings: DisplaySettings) => void;

export const DISPLAY_KEY = "neon.display";
export const DEFAULT_DISPLAY: DisplaySettings = { crt: false };

export function parseDisplay(raw: string | null): DisplaySettings {
  if (!raw) return { ...DEFAULT_DISPLAY };
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof DisplaySettings, unknown>> | null;
    return { crt: typeof data?.crt === "boolean" ? data.crt : DEFAULT_DISPLAY.crt };
  } catch {
    return { ...DEFAULT_DISPLAY };
  }
}

export function createDisplaySettings(store: Store | null) {
  let current = parseDisplay(read(store));
  const listeners = new Set<Listener>();

  const set = (patch: Partial<DisplaySettings>) => {
    current = parseDisplay(JSON.stringify({ ...current, ...patch }));
    try {
      store?.setItem(DISPLAY_KEY, JSON.stringify(current));
    } catch {}
    for (const fn of listeners) fn(current);
  };

  return {
    get: (): DisplaySettings => current,
    set,
    toggleCrt: () => set({ crt: !current.crt }),
    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export type DisplayStore = ReturnType<typeof createDisplaySettings>;

function read(store: Store | null): string | null {
  try {
    return store?.getItem(DISPLAY_KEY) ?? null;
  } catch {
    return null;
  }
}
