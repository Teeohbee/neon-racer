import type { Application } from "pixi.js";
import { createFpsMeter } from "./fps-meter";

// Sends errors, disconnects and frame rates to the server's /log endpoint, so playtest problems show up in `fly logs`.
const MAX_REPORTS = 60;
const REPEAT_MS = 10_000;
const PERF_MS = 60_000;

const context: Record<string, string | undefined> = { session: Math.random().toString(36).slice(2, 8) };
const lastSent = new Map<string, number>();
let sent = 0;

export function setReportContext(fields: Record<string, string | undefined>): void {
  Object.assign(context, fields);
}

export function report(kind: string, fields: Record<string, unknown> = {}): void {
  const key = `${kind}:${String(fields.message ?? "")}`;
  const now = Date.now();
  if ((kind !== "perf" && sent >= MAX_REPORTS) || now - (lastSent.get(key) ?? -Infinity) < REPEAT_MS) return;
  lastSent.set(key, now);
  if (kind !== "perf") sent++;
  const body = JSON.stringify({ kind, ...context, ...fields });
  if (!navigator.sendBeacon?.("/log", body)) void fetch("/log", { method: "POST", body, keepalive: true }).catch(() => {});
}

export function bindReporting(app: Application): void {
  window.addEventListener("error", (e) => {
    const err = e.error instanceof Error ? e.error : null;
    report("error", { message: err?.message ?? e.message, stack: err?.stack, at: `${e.filename}:${e.lineno}:${e.colno}` });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const err = e.reason instanceof Error ? e.reason : null;
    report("rejection", { message: err?.message ?? String(e.reason), stack: err?.stack });
  });
  app.canvas.addEventListener("webglcontextlost", () => report("context_lost", { renderer: app.renderer.name }));
  report("hello", {
    renderer: app.renderer.name,
    screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    ua: navigator.userAgent,
  });
  bindPerfReports(app);
}

// Once a minute while in a room: the average frame rate, the worst half-second and the longest single frame.
function bindPerfReports(app: Application): void {
  const meter = createFpsMeter();
  let samples: number[] = [];
  let worstMs = 0;
  app.ticker.add(() => {
    const sample = meter.frame(performance.now());
    if (!sample) return;
    samples.push(sample.fps);
    worstMs = Math.max(worstMs, sample.worstMs);
  });
  setInterval(() => {
    if (context.room && samples.length) {
      report("perf", {
        avgFps: Math.round(samples.reduce((a, b) => a + b, 0) / samples.length),
        minFps: Math.min(...samples),
        worstFrameMs: worstMs,
        hidden: document.hidden || undefined,
      });
    }
    samples = [];
    worstMs = 0;
  }, PERF_MS);
}
