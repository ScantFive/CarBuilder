import { expect, test } from 'vitest';
import { bodyMinY, partArea, partMass, partVertices, type BodyPart } from '../../src/model/body';

const part = (shape: BodyPart['shape'], size: [number, number, number], extra: Partial<BodyPart> = {}): BodyPart => ({
  id: 'p',
  shape,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  size: { x: size[0], y: size[1], z: size[2] },
  color: '#d33a2c',
  ...extra,
});

const spread = (vs: { x: number; y: number; z: number }[], k: 'x' | 'y' | 'z') =>
  Math.max(...vs.map((v) => v[k])) - Math.min(...vs.map((v) => v[k]));

test('unit box: area 6, mass 36, 8 vertices', () => {
  const p = part('box', [1, 1, 1]);
  expect(partArea(p)).toBeCloseTo(6);
  expect(partMass(p)).toBeCloseTo(36);
  expect(partVertices(p)).toHaveLength(8);
});

test('wedge has 6 vertices and prism area', () => {
  const p = part('wedge', [1, 1, 1]);
  expect(partVertices(p)).toHaveLength(6);
  expect(partArea(p)).toBeCloseTo(1 + (2 + Math.SQRT2));
});

test('rotation is applied to vertices', () => {
  const vs = partVertices(part('box', [2, 1, 1], { rotation: { x: 0, y: 90, z: 0 } }));
  expect(spread(vs, 'x')).toBeCloseTo(1);
  expect(spread(vs, 'z')).toBeCloseTo(2);
});

test('cylinder along X: 32 vertices and lateral + caps area', () => {
  const p = part('cylinder', [1, 0.2, 0.2]);
  expect(partVertices(p)).toHaveLength(32);
  expect(partArea(p)).toBeCloseTo(0.2 * Math.PI + 2 * Math.PI * 0.01, 3);
  expect(spread(partVertices(p), 'x')).toBeCloseTo(1);
});

test('sphere area matches a real sphere closely', () => {
  expect(partArea(part('sphere', [1, 1, 1]))).toBeCloseTo(Math.PI, 2);
});

test('bodyMinY uses vertices and translation', () => {
  const p = part('box', [1, 0.2, 1], { position: { x: 0, y: 0.5, z: 0 } });
  expect(bodyMinY({ parts: [p], mounts: [] })).toBeCloseTo(0.4);
  expect(bodyMinY({ parts: [], mounts: [] })).toBe(Infinity);
});
