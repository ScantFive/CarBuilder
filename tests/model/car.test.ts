import { describe, expect, test } from 'vitest';
import { CarParseError, createEmptyCar, createTemplateCar, parseCar, serializeCar } from '../../src/model/car';

describe('template car', () => {
  test('has 4 wheels, an engine, 2 steering and 2 driven wheels', () => {
    const c = createTemplateCar();
    expect(c.wheels).toHaveLength(4);
    expect(c.engine).not.toBeNull();
    expect(c.wheels.filter((w) => w.steering)).toHaveLength(2);
    expect(c.wheels.filter((w) => w.driven)).toHaveLength(2);
  });

  test('steering wheels are at the front, driven at the back', () => {
    const c = createTemplateCar();
    const z = (id: string) => c.nodes.find((n) => n.id === id)!.z;
    for (const w of c.wheels) {
      if (w.steering) expect(z(w.node)).toBeGreaterThan(0);
      if (w.driven) expect(z(w.node)).toBeLessThan(0);
    }
  });

  test('empty car has no parts', () => {
    const c = createEmptyCar('Пустая');
    expect(c).toMatchObject({ version: 1, name: 'Пустая', nodes: [], beams: [], wheels: [], engine: null });
  });
});

describe('serialization', () => {
  test('roundtrips the template', () => {
    const t = createTemplateCar();
    expect(parseCar(serializeCar(t))).toEqual(t);
  });

  test('rejects invalid JSON', () => {
    expect(() => parseCar('{')).toThrow(CarParseError);
  });

  test('rejects unknown version', () => {
    const t = { ...createTemplateCar(), version: 2 };
    expect(() => parseCar(JSON.stringify(t))).toThrow(CarParseError);
  });

  test('rejects beam referencing unknown node', () => {
    const t = createTemplateCar();
    t.beams.push({ id: 'bx', a: t.nodes[0].id, b: 'nope' });
    expect(() => parseCar(serializeCar(t))).toThrow(CarParseError);
  });

  test('rejects wheel radius out of range', () => {
    const t = createTemplateCar();
    t.wheels[0].radius = 0.9;
    expect(() => parseCar(serializeCar(t))).toThrow(CarParseError);
  });

  test('rejects engine on unknown node', () => {
    const t = createTemplateCar();
    t.engine = { node: 'ghost' };
    expect(() => parseCar(serializeCar(t))).toThrow(CarParseError);
  });
});
