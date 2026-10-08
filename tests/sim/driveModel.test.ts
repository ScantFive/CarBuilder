import { expect, test } from 'vitest';
import { controlOutputs, engineForce, steerLimitRad } from '../../src/sim/driveModel';

const keys = (k: Partial<Record<'w' | 's' | 'a' | 'd' | 'space', boolean>>) => ({ w: false, s: false, a: false, d: false, space: false, ...k });

test('engine force falls linearly from 9000 N to 0 at 300 km/h', () => {
  expect(engineForce(0)).toBe(9000);
  expect(engineForce(150)).toBe(4500);
  expect(engineForce(400)).toBe(0);
});

test('steering limit shrinks from 30° to 10° at 200 km/h', () => {
  expect(steerLimitRad(0)).toBeCloseTo(Math.PI / 6);
  expect(steerLimitRad(200)).toBeCloseTo(Math.PI / 18);
  expect(steerLimitRad(300)).toBeCloseTo(Math.PI / 18);
});

test('W gives forward force', () => {
  const o = controlOutputs(keys({ w: true }), 0, 0, 1 / 60);
  expect(o.force).toBe(9000);
  expect(o.brake).toBe(0);
});

test('S while moving forward brakes without force', () => {
  const o = controlOutputs(keys({ s: true }), 50, 0, 1 / 60);
  expect(o.brake).toBeGreaterThan(0);
  expect(o.force).toBe(0);
});

test('S when stopped reverses at 30%', () => {
  const o = controlOutputs(keys({ s: true }), 0, 0, 1 / 60);
  expect(o.force).toBeCloseTo(-0.3 * 9000);
  expect(o.brake).toBe(0);
});

test('W while rolling backwards brakes first', () => {
  const o = controlOutputs(keys({ w: true }), -20, 0, 1 / 60);
  expect(o.brake).toBeGreaterThan(0);
  expect(o.force).toBe(0);
});

test('A steers left (positive) gradually at 2.5 rad/s', () => {
  const o = controlOutputs(keys({ a: true }), 0, 0, 0.1);
  expect(o.steer).toBeCloseTo(0.25);
  const full = controlOutputs(keys({ a: true }), 0, 0.5, 0.1);
  expect(full.steer).toBeCloseTo(Math.PI / 6);
  expect(controlOutputs(keys({ d: true }), 0, 0, 0.1).steer).toBeCloseTo(-0.25);
});

test('released steering returns to centre', () => {
  expect(controlOutputs(keys({}), 0, 0.1, 0.1).steer).toBe(0);
});

test('space engages the handbrake', () => {
  expect(controlOutputs(keys({ space: true }), 50, 0, 1 / 60).handbrake).toBe(true);
  expect(controlOutputs(keys({}), 50, 0, 1 / 60).handbrake).toBe(false);
});
