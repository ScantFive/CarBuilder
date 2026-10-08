import { describe, expect, test } from 'vitest';
import { createEmptyCar, createTemplateCar, type CarDesign } from '../../src/model/car';
import { computeMassProperties, defaultWheelRoles, spawnHeight, steerSign } from '../../src/model/physicsProps';

function oneBeam(): CarDesign {
  const c = createEmptyCar('t');
  c.nodes.push({ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 0, y: 0, z: 2 });
  c.beams.push({ id: 'b1', a: 'a', b: 'b' });
  return c;
}

describe('computeMassProperties', () => {
  test('single 2 m beam weighs 16 kg with COM at its middle', () => {
    const p = computeMassProperties(oneBeam());
    expect(p.mass).toBeCloseTo(16);
    expect(p.com.z).toBeCloseTo(1);
  });

  test('template with rear engine has COM behind the middle', () => {
    expect(computeMassProperties(createTemplateCar()).com.z).toBeLessThan(0);
  });

  test('engine and wheels add 150 and 10 kg', () => {
    const c = oneBeam();
    c.engine = { node: 'a' };
    c.wheels.push({ id: 'w', node: 'b', radius: 0.3, steering: true, driven: true });
    expect(computeMassProperties(c).mass).toBeCloseTo(176);
  });

  test('inertia is positive on all axes for a 3D frame', () => {
    const i = computeMassProperties(createTemplateCar()).inertia;
    expect(i.x).toBeGreaterThan(0);
    expect(i.y).toBeGreaterThan(0);
    expect(i.z).toBeGreaterThan(0);
  });
});

describe('defaultWheelRoles', () => {
  test('front-engine car: front wheel steers and is driven', () => {
    const c = createTemplateCar();
    c.nodes.find((n) => n.id === 'en')!.z = 1.6;
    expect(defaultWheelRoles(c, 'fr')).toEqual({ steering: true, driven: true });
    expect(defaultWheelRoles(c, 'rr')).toEqual({ steering: false, driven: false });
  });

  test('engine at the COM drives all wheels', () => {
    const c = createTemplateCar();
    const com = computeMassProperties(c).com;
    const en = c.nodes.find((n) => n.id === 'en')!;
    en.z = com.z;
    const z2 = computeMassProperties(c).com.z;
    en.z = z2;
    expect(defaultWheelRoles(c, 'fr').driven).toBe(true);
    expect(defaultWheelRoles(c, 'rr').driven).toBe(true);
  });
});

test('steerSign is -1 for a wheel behind the COM', () => {
  const c = createTemplateCar();
  expect(steerSign(c, c.wheels.find((w) => w.node === 'rr')!)).toBe(-1);
  expect(steerSign(c, c.wheels.find((w) => w.node === 'fr')!)).toBe(1);
});

test('spawnHeight puts the lowest wheel bottom on the ground', () => {
  const c = oneBeam();
  c.wheels.push({ id: 'w', node: 'a', radius: 0.6, steering: true, driven: true });
  expect(spawnHeight(c, 0.3)).toBeCloseTo(0.9);
});
