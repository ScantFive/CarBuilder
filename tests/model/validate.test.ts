import { expect, test } from 'vitest';
import { createEmptyCar, createTemplateCar } from '../../src/model/car';
import { validateCar } from '../../src/model/validate';
import { deleteNode } from '../../src/editor/symmetry';

test('template is valid', () => {
  expect(validateCar(createTemplateCar())).toEqual([]);
});

test('missing engine', () => {
  const c = createTemplateCar();
  c.engine = null;
  expect(validateCar(c)).toContain('Нет двигателя');
});

test('too few wheels', () => {
  const c = createTemplateCar();
  c.wheels = c.wheels.slice(0, 2);
  expect(validateCar(c)).toContain('Нужно от 3 до 8 колёс');
});

test('no driven / no steering wheels', () => {
  const c = createTemplateCar();
  c.wheels.forEach((w) => { w.driven = false; w.steering = false; });
  const errs = validateCar(c);
  expect(errs).toContain('Нет ведущих колёс');
  expect(errs).toContain('Нет рулевых колёс');
});

test('no beams', () => {
  expect(validateCar(createEmptyCar('x'))).toContain('Нет балок');
});

test('collinear wheels', () => {
  const c = createEmptyCar('x');
  for (const [i, z] of [-1, 0, 1].entries()) c.nodes.push({ id: `n${i}`, x: 0, y: 0.3, z });
  c.beams.push({ id: 'b0', a: 'n0', b: 'n1' }, { id: 'b1', a: 'n1', b: 'n2' });
  c.wheels = c.nodes.map((n) => ({ id: `w${n.id}`, node: n.id, radius: 0.3, steering: true, driven: true }));
  c.nodes.push({ id: 'e', x: 0.5, y: 0.3, z: 0 });
  c.beams.push({ id: 'b2', a: 'n1', b: 'e' });
  c.engine = { node: 'e' };
  expect(validateCar(c)).toContain('Колёса стоят на одной линии — машина опрокинется');
});

test('disconnected wheel node', () => {
  const c = createTemplateCar();
  c.nodes.push({ id: 'lone', x: 1, y: 0.3, z: 1 });
  c.wheels.push({ id: 'wl', node: 'lone', radius: 0.3, steering: false, driven: false });
  expect(validateCar(c)).toContain('Каркас не связный: колёса и двигатель должны быть соединены балками');
});

test('deleting the engine node removes the engine and reports it', () => {
  const c = deleteNode(createTemplateCar(), 'en', true);
  expect(c.engine).toBeNull();
  expect(c.beams.some((b) => b.a === 'en' || b.b === 'en')).toBe(false);
  expect(validateCar(c)).toContain('Нет двигателя');
});
