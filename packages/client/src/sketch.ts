import type { Point } from "@neon/sim";

export type SketchMode = "idle" | "drag" | "free";

export interface SketchTool {
  readonly points: Point[];
  readonly mode: SketchMode;
  readonly enabled: boolean;
  enable(): void;
  disable(): void;
  clear(): void;
  onChange(cb: (points: Point[]) => void): () => void;
  dispose(): void;
}

const CLICK_TRAVEL_PX = 8;
const CLICK_MS = 300;
const MIN_GAP_PX = 3;

export function createSketchTool(target: HTMLElement, screenToWorld: (px: number, py: number) => Point): SketchTool {
  let points: Point[] = [];
  let mode: SketchMode = "idle";
  let enabled = false;
  let downAt = 0;
  let travel = 0;
  let last: [number, number] | null = null;
  const listeners = new Set<(points: Point[]) => void>();

  const emit = () => listeners.forEach((cb) => cb(points));

  const local = (e: PointerEvent): [number, number] => {
    const rect = target.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const add = (p: [number, number], force = false) => {
    if (!force && last && Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_GAP_PX) return;
    if (last) travel += Math.hypot(p[0] - last[0], p[1] - last[1]);
    last = p;
    points = [...points, screenToWorld(p[0], p[1])];
    emit();
  };

  const onDown = (e: PointerEvent) => {
    if (!enabled || e.button !== 0) return;
    e.preventDefault();
    if (mode === "free") {
      add(local(e));
      mode = "idle";
      emit();
      return;
    }
    points = [];
    last = null;
    travel = 0;
    downAt = performance.now();
    mode = "drag";
    target.setPointerCapture(e.pointerId);
    add(local(e), true);
  };

  const onMove = (e: PointerEvent) => {
    if (!enabled || mode === "idle") return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) add(local(ev));
  };

  const onUp = (e: PointerEvent) => {
    if (!enabled || mode !== "drag") return;
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    const isClick = travel < CLICK_TRAVEL_PX && performance.now() - downAt < CLICK_MS;
    mode = isClick ? "free" : "idle";
    emit();
  };

  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);

  return {
    get points() {
      return points;
    },
    get mode() {
      return mode;
    },
    get enabled() {
      return enabled;
    },
    enable() {
      enabled = true;
      target.style.cursor = "crosshair";
    },
    disable() {
      enabled = false;
      mode = "idle";
      target.style.cursor = "";
    },
    clear() {
      points = [];
      last = null;
      mode = "idle";
      emit();
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      this.disable();
      listeners.clear();
      target.removeEventListener("pointerdown", onDown);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    },
  };
}
