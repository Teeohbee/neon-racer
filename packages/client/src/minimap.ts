import { pointAt, viewBounds, WORLD, type Camera, type Track } from "@neon/sim";
import { h } from "./dom";
import { css } from "./render/palette";

const WIDTH = 220;
const SCALE = WIDTH / WORLD.width;
const HEIGHT = Math.round(WORLD.height * SCALE);
const DPR = Math.min(2, window.devicePixelRatio || 1);
const DROP_STEP = 40;

export interface MinimapCar {
  x: number;
  y: number;
  color: number;
  alive: boolean;
  isYou: boolean;
}

export interface Minimap {
  update(track: Track | null, cars: MinimapCar[], camera: Camera | null, dangerLine?: number | null): void;
  dispose(): void;
}

function tick(ctx: CanvasRenderingContext2D, track: Track, s: number, half: number) {
  const [x, y, angle] = pointAt(track, s);
  const nx = -Math.sin(angle) * half;
  const ny = Math.cos(angle) * half;
  ctx.beginPath();
  ctx.moveTo(x - nx, y - ny);
  ctx.lineTo(x + nx, y + ny);
  ctx.stroke();
}

export function drawTrackShape(ctx: CanvasRenderingContext2D, track: Track, scale: number): void {
  ctx.beginPath();
  track.xs.forEach((x, i) => (i ? ctx.lineTo(x, track.ys[i]!) : ctx.moveTo(x, track.ys[i]!)));
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#1d2a55";
  ctx.lineWidth = 220;
  ctx.stroke();
  ctx.strokeStyle = "#00f0ff";
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 6 / scale;
  ctx.lineWidth = 45;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ff3b3b";
  ctx.lineWidth = 90;
  for (const [from, to] of track.drops) {
    const span = (((to - from) % track.length) + track.length) % track.length;
    const steps = Math.max(1, Math.ceil(span / DROP_STEP));
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [x, y] = pointAt(track, from + (span * i) / steps);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  for (const [from, to] of track.bridges) {
    const span = (((to - from) % track.length) + track.length) % track.length;
    const steps = Math.max(1, Math.ceil(span / DROP_STEP));
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [x, y] = pointAt(track, from + (span * i) / steps);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = "#1d2a55";
    ctx.lineWidth = 170;
    ctx.stroke();
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 45;
    ctx.stroke();
  }
  ctx.strokeStyle = "#ffd400";
  ctx.lineWidth = 60;
  for (const s of track.boosts) tick(ctx, track, s, 130);
  const [sx, sy] = [track.xs[0]!, track.ys[0]!];
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(sx - 90, sy - 90, 180, 180);
}

export function createMinimap(ui: HTMLElement): Minimap {
  const canvas = h("canvas", { class: "minimap", width: WIDTH * DPR, height: HEIGHT * DPR });
  canvas.style.width = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  ui.append(canvas);
  const ctx = canvas.getContext("2d")!;
  const base = document.createElement("canvas");
  base.width = canvas.width;
  base.height = canvas.height;
  const baseCtx = base.getContext("2d")!;
  let drawnTrack: Track | null = null;

  const drawTrack = (track: Track) => {
    baseCtx.setTransform(DPR * SCALE, 0, 0, DPR * SCALE, 0, 0);
    baseCtx.clearRect(0, 0, WORLD.width, WORLD.height);
    drawTrackShape(baseCtx, track, SCALE);
    drawnTrack = track;
  };

  return {
    update(track, cars, camera, dangerLine = null) {
      canvas.hidden = !track;
      if (!track) return;
      if (track !== drawnTrack) drawTrack(track);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(DPR * SCALE, 0, 0, DPR * SCALE, 0, 0);
      if (camera) {
        const b = viewBounds(camera);
        ctx.strokeStyle = "rgba(216, 246, 255, 0.55)";
        ctx.lineWidth = 30;
        ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
      }
      if (dangerLine !== null) {
        ctx.strokeStyle = "#ff3b3b";
        ctx.shadowColor = "#ff3b3b";
        ctx.shadowBlur = 8;
        ctx.lineWidth = 70;
        tick(ctx, track, dangerLine, 260);
      }
      for (const car of [...cars].sort((a, b) => Number(a.isYou) - Number(b.isYou))) {
        if (!car.alive) continue;
        ctx.beginPath();
        ctx.arc(car.x, car.y, car.isYou ? 150 : 110, 0, Math.PI * 2);
        ctx.fillStyle = css(car.color);
        ctx.shadowColor = css(car.color);
        ctx.shadowBlur = 8;
        ctx.fill();
        if (car.isYou) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 40;
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    },
    dispose() {
      canvas.remove();
    },
  };
}
