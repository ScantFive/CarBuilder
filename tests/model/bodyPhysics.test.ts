import { describe, expect, test } from 'vitest';
import { createTemplateCar, type CarDesign } from '../../src/model/car';
import type { BodyPart } from '../../src/model/body';
import { computeMassProperties, endpointPos } from '../../src/model/physicsProps';
import { validateCar } from '../../src/model/validate';

const box = (id: string, pos: [number, number, number], size: [number, number, number], rot: [number, number, number] = [0, 0, 0]): BodyPart => ({
  id,
  shape: 'box',
  position: { x: pos[0], y: pos[1], z: pos[2] },
  rotation: { x: rot[0], y: rot[1], z: rot[2] },
  size: { x: size[0], y: size[1], z: size[2] },
  color: '#d33a2c',
});

function carWithBody(parts: BodyPart[], mounts = [{ id: 'm1', x: 0.9, y: 0.6, z: 2 }], attach = true): CarDesign {
  const c = createTemplateCar();
  c.body = { parts, mounts };
  if (attach && mounts.length) c.beams.push({ id: 'bm', a: 'fr', b: mounts[0].id });
  return c;
}

describe('mass with body', () => {
  test('a unit box adds 36 kg and pulls the COM towards it', () => {
    const base = computeMassProperties(createTemplateCar());
    const c = carWithBody([box('p', [0, 1, 2], [1, 1, 1])], [], false);
    const p = computeMassProperties(c);
    expect(p.mass - base.mass).toBeCloseTo(36);
    expect(p.com.z).toBeGreaterThan(base.com.z);
  });

  test('beams to mounts count like other beams', () => {
    const base = computeMassProperties(carWithBody([], [{ id: 'm1', x: 0.9, y: 0.6, z: 2 }], false));
    const c = carWithBody([], [{ id: 'm1', x: 0.9, y: 0.6, z: 2 }], true);
    expect(computeMassProperties(c).mass - base.mass).toBeCloseTo(0.3 * 8);
  });

  test('endpointPos resolves nodes and mounts', () => {
    const c = carWithBody([], [{ id: 'm1', x: 0.9, y: 0.6, z: 2 }], false);
    expect(endpointPos(c, 'fr')).toEqual({ x: 0.9, y: 0.3, z: 2 });
    expect(endpointPos(c, 'm1')).toEqual({ x: 0.9, y: 0.6, z: 2 });
    expect(endpointPos(c, 'nope')).toBeUndefined();
  });
});

describe('validation with body', () => {
  const NOT_ATTACHED = 'Кузов не прикреплён к каркасу';
  const TOO_LOW = 'Кузов ниже колёс — заденет землю';

  test('body with parts but no mounts is not attached', () => {
    expect(validateCar(carWithBody([box('p', [0, 0.6, 0], [1, 0.05, 1])], [], false))).toContain(NOT_ATTACHED);
  });

  test('mount without a beam is not attached', () => {
    expect(validateCar(carWithBody([box('p', [0, 0.6, 0], [1, 0.05, 1])], undefined, false))).toContain(NOT_ATTACHED);
  });

  test('mount connected by a beam is attached', () => {
    expect(validateCar(carWithBody([box('p', [0, 0.6, 0], [1, 0.05, 1])]))).toEqual([]);
  });

  test('a rotated part dipping below the wheels is reported, unrotated is fine', () => {
    // Template wheel bottoms: 0.3 - 0.35 - 0.3 = -0.35.
    expect(validateCar(carWithBody([box('p', [0, 0.3, 0], [2, 0.1, 0.1], [0, 0, 60])]))).toContain(TOO_LOW);
    expect(validateCar(carWithBody([box('p', [0, 0.3, 0], [2, 0.1, 0.1])]))).not.toContain(TOO_LOW);
  });

  test('part and mount limits', () => {
    const parts = Array.from({ length: 61 }, (_, i) => box(`p${i}`, [0, 0.6, 0], [0.1, 0.1, 0.1]));
    expect(validateCar(carWithBody(parts))).toContain('Слишком много деталей кузова (максимум 60)');
    const mounts = Array.from({ length: 17 }, (_, i) => ({ id: `m${i}`, x: 0, y: 0.6, z: i * 0.1 }));
    expect(validateCar(carWithBody([box('p', [0, 0.6, 0], [1, 0.05, 1])], mounts))).toContain('Слишком много точек крепления (максимум 16)');
  });

  test('no body means no body errors', () => {
    expect(validateCar(createTemplateCar())).toEqual([]);
  });
});
