import { expect, test } from 'vitest';
import { createTemplateCar, parseCar, serializeCar } from '../../src/model/car';
import { addMount, addPart, deleteMount, deletePart, duplicatePart, mirrorPartOf, updatePart } from '../../src/body/bodyOps';
import { addBeam } from '../../src/editor/symmetry';

test('addPart creates a body with default box at the centre, no mirror twin at x=0', () => {
  const { car, id } = addPart(createTemplateCar(), 'box', true);
  expect(car.body!.parts).toHaveLength(1);
  expect(car.body!.parts[0]).toMatchObject({ id, shape: 'box', position: { x: 0, y: 0.6, z: 0 }, size: { x: 1, y: 0.05, z: 1 }, color: '#d33a2c' });
});

test('moving a part off-centre with mirror creates a reflected twin', () => {
  let { car, id } = addPart(createTemplateCar(), 'wedge', true);
  car = updatePart(car, id, { position: { x: 0.8, y: 0.6, z: 0 }, rotation: { x: 0, y: 30, z: 10 } }, true);
  expect(car.body!.parts).toHaveLength(2);
  const twin = car.body!.parts.find((p) => p.id !== id)!;
  expect(twin.position).toEqual({ x: -0.8, y: 0.6, z: 0 });
  expect(twin.rotation).toEqual({ x: 0, y: -30, z: -10 });
  expect(mirrorPartOf(car, id)).toBe(twin.id);
  // Further edits keep the pair in sync.
  car = updatePart(car, id, { size: { x: 0.5, y: 0.4, z: 0.8 }, color: '#00ff00' }, true);
  expect(car.body!.parts.find((p) => p.id === twin.id)).toMatchObject({ size: { x: 0.5, y: 0.4, z: 0.8 }, color: '#00ff00' });
});

test('updatePart clamps size and position', () => {
  let { car, id } = addPart(createTemplateCar(), 'box', false);
  car = updatePart(car, id, { size: { x: 9, y: 0.001, z: 1 }, position: { x: 5, y: -1, z: 9 } }, false);
  expect(car.body!.parts[0].size).toEqual({ x: 4, y: 0.02, z: 1 });
  expect(car.body!.parts[0].position).toEqual({ x: 1.6, y: 0, z: 3.5 });
});

test('duplicate and delete (mirrored pair)', () => {
  let { car, id } = addPart(createTemplateCar(), 'box', true);
  car = updatePart(car, id, { position: { x: 0.5, y: 0.6, z: 0 } }, true);
  const dup = duplicatePart(car, id, false);
  expect(dup.car.body!.parts).toHaveLength(3);
  expect(dup.car.body!.parts.find((p) => p.id === dup.id)!.position.z).toBeCloseTo(0.1);
  car = deletePart(car, id, true);
  expect(car.body!.parts).toHaveLength(0);
});

test('part limit of 60', () => {
  let car = createTemplateCar();
  for (let i = 0; i < 60; i++) car = addPart(car, 'box', false).car;
  const r = addPart(car, 'box', false);
  expect(r.id).toBe('');
  expect(r.car.body!.parts).toHaveLength(60);
});

test('mounts are mirrored, rounded, and deleting one removes its beams', () => {
  let car = addMount(createTemplateCar(), { x: 0.5004, y: 0.4, z: 1 }, true);
  expect(car.body!.mounts).toHaveLength(2);
  const right = car.body!.mounts.find((m) => m.x > 0)!;
  expect(right.x).toBe(0.5);
  car = addBeam(car, 'fr', right.id, true);
  expect(car.beams.filter((b) => [b.a, b.b].includes(right.id))).toHaveLength(1);
  // Mirrored beam goes fl -> left mount.
  const left = car.body!.mounts.find((m) => m.x < 0)!;
  expect(car.beams.some((b) => [b.a, b.b].includes('fl') && [b.a, b.b].includes(left.id))).toBe(true);
  car = deleteMount(car, right.id, false);
  expect(car.beams.some((b) => [b.a, b.b].includes(right.id))).toBe(false);
  expect(() => parseCar(serializeCar(car))).not.toThrow();
});

test('ops do not mutate input', () => {
  const t = createTemplateCar();
  const snap = JSON.stringify(t);
  addPart(t, 'box', true);
  addMount(t, { x: 1, y: 1, z: 1 }, true);
  expect(JSON.stringify(t)).toBe(snap);
});
