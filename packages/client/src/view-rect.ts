import { VIEW } from "@neon/sim";

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
  base: number;
}

export function viewRect(sw: number, sh: number): ViewRect {
  const base = Math.min(sw / VIEW.width, sh / VIEW.height);
  const w = VIEW.width * base;
  const h = VIEW.height * base;
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h, base };
}

export function bindViewRect(el: HTMLElement): () => void {
  const apply = () => {
    const r = viewRect(window.innerWidth, window.innerHeight);
    el.style.setProperty("--view-x", `${r.x}px`);
    el.style.setProperty("--view-y", `${r.y}px`);
    el.style.setProperty("--view-w", `${r.w}px`);
    el.style.setProperty("--view-h", `${r.h}px`);
  };
  apply();
  window.addEventListener("resize", apply);
  return () => window.removeEventListener("resize", apply);
}
