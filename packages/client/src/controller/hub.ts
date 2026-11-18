import { createControllerPoller, type ControllerFrame, type PadSource } from "./poller";

export type ControllerListener = (frame: ControllerFrame, nowMs: number) => void;

/** Polls the controllers once per animation frame and hands every listener the same frame. */
export interface ControllerHub {
  subscribe(listener: ControllerListener): () => void;
  latest(): ControllerFrame | null;
}

export function startControllerHub(source: PadSource): ControllerHub {
  const poller = createControllerPoller(source);
  const listeners = new Set<ControllerListener>();
  let latest: ControllerFrame | null = null;

  const tick = (nowMs: number) => {
    latest = poller.poll();
    for (const listener of [...listeners]) listener(latest, nowMs);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    latest: () => latest,
  };
}
