/** Pure driving controls: keys + speed -> engine force, brake and steering angle. */

export const ENGINE_FORCE_MAX = 9000;
export const TOP_SPEED_KMH = 300;
export const REVERSE_FACTOR = 0.3;
export const BRAKE = 1;
export const STEER_RATE = 2.5;
const STEER_MAX = Math.PI / 6;
const STEER_MIN = Math.PI / 18;
const STEER_FADE_KMH = 200;
const STOPPED_KMH = 1;

export interface DriveInput {
  w: boolean;
  s: boolean;
  a: boolean;
  d: boolean;
  space: boolean;
}

export interface DriveOutput {
  /** Total engine force in newtons, negative for reverse. */
  force: number;
  /** Service brake strength 0..1 applied to all wheels. */
  brake: number;
  /** Steering angle in radians, positive = left. */
  steer: number;
  handbrake: boolean;
}

export function engineForce(speedKmh: number): number {
  return ENGINE_FORCE_MAX * Math.max(0, 1 - Math.abs(speedKmh) / TOP_SPEED_KMH);
}

export function steerLimitRad(speedKmh: number): number {
  const t = Math.min(1, Math.abs(speedKmh) / STEER_FADE_KMH);
  return STEER_MAX + (STEER_MIN - STEER_MAX) * t;
}

/** speedKmh is signed: positive forward. steer is the current angle. */
export function controlOutputs(input: DriveInput, speedKmh: number, steer: number, dt: number): DriveOutput {
  let force = 0;
  let brake = 0;
  if (input.w && !input.s) {
    if (speedKmh < -STOPPED_KMH) brake = BRAKE;
    else force = engineForce(speedKmh);
  } else if (input.s && !input.w) {
    if (speedKmh > STOPPED_KMH) brake = BRAKE;
    else force = -REVERSE_FACTOR * engineForce(speedKmh);
  }
  const target = ((input.a ? 1 : 0) - (input.d ? 1 : 0)) * steerLimitRad(speedKmh);
  const maxDelta = STEER_RATE * dt;
  const next = steer + Math.max(-maxDelta, Math.min(maxDelta, target - steer));
  return { force, brake, steer: next, handbrake: input.space };
}
