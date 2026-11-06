export interface CarState {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
}

export interface CarInput {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

export interface CarParams {
  accel: number;
  maxSpeed: number;
  brakeDecel: number;
  reverseAccel: number;
  reverseMaxSpeed: number;
  rollingResistance: number;
  drag: number;
  overspeedDecel: number;
  steerRate: number;
  fullSteerSpeed: number;
  grip: number;
  handbrakeGrip: number;
  handbrakeDecel: number;
  handbrakeSteerBoost: number;
}

export const defaultCarParams: CarParams = {
  accel: 700,
  maxSpeed: 650,
  brakeDecel: 1400,
  reverseAccel: 500,
  reverseMaxSpeed: 220,
  rollingResistance: 120,
  drag: 0.5,
  overspeedDecel: 1500,
  steerRate: 2.8,
  fullSteerSpeed: 150,
  grip: 8,
  handbrakeGrip: 1.2,
  handbrakeDecel: 300,
  handbrakeSteerBoost: 1.5,
};

export const emptyInput: CarInput = { throttle: false, brake: false, left: false, right: false, handbrake: false };

export const CAR_RADIUS = 16;

export function speedOf(car: CarState): number {
  return Math.hypot(car.vx, car.vy);
}

export function stepCar(
  car: CarState,
  input: CarInput,
  dt: number,
  p: CarParams = defaultCarParams,
  speedFactor = 1,
): CarState {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let forward = car.vx * fx + car.vy * fy;
  let lateral = -car.vx * fy + car.vy * fx;

  if (input.throttle) forward += (forward < 0 ? p.brakeDecel : p.accel) * dt;
  if (input.brake) {
    if (forward > 5) forward = Math.max(0, forward - p.brakeDecel * dt);
    else forward -= p.reverseAccel * dt;
  }
  if (!input.throttle && !input.brake) forward -= Math.sign(forward) * Math.min(Math.abs(forward), p.rollingResistance * dt);
  if (input.handbrake) forward -= Math.sign(forward) * Math.min(Math.abs(forward), p.handbrakeDecel * dt);
  forward -= forward * p.drag * dt;

  const cap = (forward >= 0 ? p.maxSpeed : p.reverseMaxSpeed) * speedFactor;
  if (Math.abs(forward) > cap) forward = Math.sign(forward) * Math.max(cap, Math.abs(forward) - p.overspeedDecel * dt);

  lateral *= Math.exp(-(input.handbrake ? p.handbrakeGrip : p.grip) * dt);

  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const steerFactor = Math.max(-1, Math.min(1, forward / p.fullSteerSpeed));
  const angle = car.angle + steer * p.steerRate * steerFactor * (input.handbrake ? p.handbrakeSteerBoost : 1) * dt;

  const vx = forward * fx - lateral * fy;
  const vy = forward * fy + lateral * fx;
  return { x: car.x + vx * dt, y: car.y + vy * dt, angle, vx, vy };
}
