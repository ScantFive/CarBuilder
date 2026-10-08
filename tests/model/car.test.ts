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
    expect(c).toMatchObject({ version: 2, name: 'Пустая', nodes: [], beams: [], wheels: [], engine: null });
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
    const t = { ...createTemplateCar(), version: 3 };
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

describe('body and migration', () => {
  const withBody = () => {
    const t = createTemplateCar();
    t.body = {
      parts: [{ id: 'p1', shape: 'box', position: { x: 0, y: 0.6, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 0.05, z: 1 }, color: '#d33a2c' }],
      mounts: [{ id: 'm1', x: 0.5, y: 0.6, z: 0 }],
    };
    t.beams.push({ id: 'bm', a: 'fr', b: 'm1' });
    return t;
  };

  test('version 1 file loads as version 2 without a body', () => {
    const t = createTemplateCar();
    const v1 = { ...t, version: 1 } as Record<string, unknown>;
    delete v1.body;
    const c = parseCar(JSON.stringify(v1));
    expect(c.version).toBe(2);
    expect(c.body).toBeNull();
    expect(c.nodes).toEqual(t.nodes);
    expect(c.beams).toEqual(t.beams);
  });

  test('car with body roundtrips', () => {
    const t = withBody();
    expect(parseCar(serializeCar(t))).toEqual(t);
  });

  test('beam to a missing mount is rejected', () => {
    const t = withBody();
    t.beams.push({ id: 'bx', a: 'fr', b: 'm_ghost' });
    expect(() => parseCar(serializeCar(t))).toThrow(CarParseError);
  });

  test('unknown shape, bad size, bad colour are rejected', () => {
    for (const mutate of [
      (t: ReturnType<typeof withBody>) => ((t.body!.parts[0] as { shape: string }).shape = 'cone'),
      (t: ReturnType<typeof withBody>) => (t.body!.parts[0].size.x = 5),
      (t: ReturnType<typeof withBody>) => (t.body!.parts[0].color = 'red'),
    ]) {
      const t = withBody();
      mutate(t);
      expect(() => parseCar(serializeCar(t))).toThrow(CarParseError);
    }
  });

  test('wheel on a mount is rejected', () => {
    const t = withBody();
    t.wheels.push({ id: 'wm', node: 'm1', radius: 0.3, steering: false, driven: false });
    expect(() => parseCar(serializeCar(t))).toThrow(CarParseError);
  });
});
