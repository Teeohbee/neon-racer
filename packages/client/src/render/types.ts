import type { Camera, Hazard, HazardKind, Point, Track } from "@neon/sim";

export interface CarView {
  id: string;
  name: string;
  color: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  drifting: boolean;
  alive: boolean;
  frozen: boolean;
  isYou: boolean;
}

export interface SketchView {
  points: Point[];
  preview: Point[] | null;
  valid: boolean;
}

export interface AimView {
  x: number;
  y: number;
  kind: HazardKind;
  radius: number;
  ready: boolean;
}

export interface FrameView {
  camera: Camera;
  track: Track | null;
  cars: CarView[];
  hazards: Hazard[];
  now: number;
  sketch?: SketchView;
  aim?: AimView | null;
  dangerLine?: number | null;
}

export interface Renderer {
  render(frame: FrameView): void;
  screenToWorld(px: number, py: number): Point;
  burst(x: number, y: number, color: number): void;
  destroy(): void;
}
