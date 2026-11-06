import type { Camera, Hazard, HazardKind, Point, Track } from "@neon/sim";
import type { FallStart } from "./falling";

export interface CarView {
  id: string;
  name: string;
  color: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  drifting: boolean;
  boosting: boolean;
  alive: boolean;
  frozen: boolean;
  isYou: boolean;
  drafting?: number;
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
  trackName?: string | null;
}

export interface Renderer {
  render(frame: FrameView): void;
  screenToWorld(px: number, py: number): Point;
  burst(x: number, y: number, color: number): void;
  impact(x: number, y: number, strength: number): void;
  fall(car: FallStart): void;
  destroy(): void;
}
