import { expect, test } from 'vitest';
import { createEmptyCar, createTemplateCar } from '../../src/model/car';
import { addBeam, addNode, deleteNode, mirrorOf, moveNode, setEngine, setWheel } from '../../src/editor/symmetry';

test('addNode with mirror creates a mirrored pair', () => {
  const c = addNode(createEmptyCar('x'), { x: 0.5, y: 0.3, z: 1 }, true);
  expect(c.nodes).toHaveLength(2);
  expect(c.nodes.map((n) => n.x).sort()).toEqual([-0.5, 0.5]);
  expect(mirrorOf(c, c.nodes[0].id)).toBe(c.nodes[1].id);
});

test('near-centre node is snapped to x=0 with no mirror duplicate', () => {
  const c = addNode(createEmptyCar('x'), { x: 0.03, y: 0.3, z: 1 }, true);
  expect(c.nodes).toHaveLength(1);
  expect(c.nodes[0].x).toBe(0);
});

test('addNode does not duplicate an existing node at the same spot', () => {
  let c = addNode(createEmptyCar('x'), { x: 0.5, y: 0.3, z: 1 }, true);
  c = addNode(c, { x: -0.5, y: 0.3, z: 1 }, true);
  expect(c.nodes).toHaveLength(2);
});

test('positions are clamped and snapped to the 0.1 grid', () => {
  const c = addNode(createEmptyCar('x'), { x: 5, y: 9, z: 0.04 }, false);
  expect(c.nodes[0]).toMatchObject({ x: 1.5, y: 1.5, z: 0 });
});

test('addBeam mirrors and does not duplicate', () => {
  let c = addNode(createEmptyCar('x'), { x: 0.5, y: 0.3, z: 1 }, true);
  c = addNode(c, { x: 0.5, y: 0.3, z: -1 }, true);
  const right = c.nodes.filter((n) => n.x > 0).map((n) => n.id);
  c = addBeam(c, right[0], right[1], true);
  expect(c.beams).toHaveLength(2);
  c = addBeam(c, right[1], right[0], true);
  expect(c.beams).toHaveLength(2);
  c = addBeam(c, right[0], right[0], true);
  expect(c.beams).toHaveLength(2);
});

test('setWheel mirrors wheel props, defaults roles and radius', () => {
  const c = setWheel(createTemplateCar(), 'mr', { radius: 0.5 }, true);
  const mr = c.wheels.find((w) => w.node === 'mr')!;
  const ml = c.wheels.find((w) => w.node === 'ml')!;
  expect(mr.radius).toBe(0.5);
  expect(ml).toMatchObject({ radius: 0.5, steering: mr.steering, driven: mr.driven });
  const c2 = setWheel(createTemplateCar(), 'mr', {}, false);
  expect(c2.wheels.find((w) => w.node === 'mr')!.radius).toBe(0.35);
});

test('setEngine moves the engine and removes a wheel on that node', () => {
  const c = setEngine(createTemplateCar(), 'fr');
  expect(c.engine).toEqual({ node: 'fr' });
  expect(c.wheels.some((w) => w.node === 'fr')).toBe(false);
});

test('setWheel on the engine node is ignored', () => {
  const t = createTemplateCar();
  expect(setWheel(t, 'en', {}, true).wheels).toHaveLength(4);
});

test('moveNode mirrors the partner', () => {
  const c = moveNode(createTemplateCar(), 'fr', { x: 1.2, y: 0.4, z: 2.2 }, true);
  expect(c.nodes.find((n) => n.id === 'fl')).toMatchObject({ x: -1.2, y: 0.4, z: 2.2 });
});

test('deleteNode with mirror removes both and their beams and wheels', () => {
  const c = deleteNode(createTemplateCar(), 'fr', true);
  expect(c.nodes.find((n) => n.id === 'fl')).toBeUndefined();
  expect(c.beams.some((b) => [b.a, b.b].some((id) => id === 'fr' || id === 'fl'))).toBe(false);
  expect(c.wheels).toHaveLength(2);
});

test('operations do not mutate their input', () => {
  const t = createTemplateCar();
  const snap = JSON.stringify(t);
  deleteNode(t, 'fr', true);
  addNode(t, { x: 1, y: 1, z: 1 }, true);
  expect(JSON.stringify(t)).toBe(snap);
});
