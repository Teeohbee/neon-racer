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
  s?: number;
  upper?: boolean;
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
  /** Colour of the cross hairs, when several players aim at once (Local play). Defaults to the hazard's colour. */
  tint?: number;
}

export interface FrameView {
  camera: Camera;
  track: Track | null;
  cars: CarView[];
  hazards: Hazard[];
  now: number;
  sketch?: SketchView;
  aim?: AimView | null;
  /** More than one aim at once, one per knocked-out Seat in Local play. */
  aims?: AimView[];
  dangerLine?: number | null;
  trackName?: string | null;
  contact?: boolean;
}

export interface Renderer {
  render(frame: FrameView): void;
  screenToWorld(px: number, py: number): Point;
  burst(x: number, y: number, color: number): void;
  explode(x: number, y: number, color: number): void;
  impact(x: number, y: number, strength: number): void;
  shockwave(x: number, y: number, strength: number): void;
  fall(car: FallStart): void;
  pulse(strength: number): void;
  danger(level: number): void;
  hack(hazard: Hazard): void;
  signalLost(): void;
  glitch(strength: number, duration?: number): void;
  destroy(): void;
}
