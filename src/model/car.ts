export interface CarNode {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface Beam {
  id: string;
  a: string;
  b: string;
}

export interface Wheel {
  id: string;
  node: string;
  radius: number;
  steering: boolean;
  driven: boolean;
}

export interface CarDesign {
  version: 1;
  name: string;
  nodes: CarNode[];
  beams: Beam[];
  wheels: Wheel[];
  engine: { node: string } | null;
}

export const WHEEL_RADIUS_MIN = 0.2;
export const WHEEL_RADIUS_MAX = 0.6;
export const WHEEL_RADIUS_DEFAULT = 0.35;

export class CarParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarParseError';
  }
}

let idCounter = 0;

export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function createEmptyCar(name: string): CarDesign {
  return { version: 1, name, nodes: [], beams: [], wheels: [], engine: null };
}

/** Rectangular 1.8 x 4 m frame, front steering, rear drive, engine at the back. */
export function createTemplateCar(): CarDesign {
  const n = (id: string, x: number, y: number, z: number): CarNode => ({ id, x, y, z });
  const nodes = [
    n('fr', 0.9, 0.3, 2),
    n('fl', -0.9, 0.3, 2),
    n('mr', 0.9, 0.3, 0),
    n('ml', -0.9, 0.3, 0),
    n('rr', 0.9, 0.3, -2),
    n('rl', -0.9, 0.3, -2),
    n('en', 0, 0.3, -1.6),
    n('nose', 0, 0.3, 2.6),
    n('hr', 0.5, 0.9, -0.4),
    n('hl', -0.5, 0.9, -0.4),
  ];
  const pairs: [string, string][] = [
    ['fr', 'mr'], ['mr', 'rr'], ['fl', 'ml'], ['ml', 'rl'],
    ['fr', 'fl'], ['mr', 'ml'], ['rr', 'rl'],
    ['fr', 'ml'], ['mr', 'rl'],
    ['en', 'rr'], ['en', 'rl'], ['en', 'mr'], ['en', 'ml'],
    ['nose', 'fr'], ['nose', 'fl'],
    ['hr', 'mr'], ['hl', 'ml'], ['hr', 'hl'], ['hr', 'en'], ['hl', 'en'],
  ];
  const beams = pairs.map(([a, b], i) => ({ id: `b${i}`, a, b }));
  const wheel = (node: string, front: boolean): Wheel => ({
    id: `w_${node}`,
    node,
    radius: WHEEL_RADIUS_DEFAULT,
    steering: front,
    driven: !front,
  });
  return {
    version: 1,
    name: 'Шаблон',
    nodes,
    beams,
    wheels: [wheel('fr', true), wheel('fl', true), wheel('rr', false), wheel('rl', false)],
    engine: { node: 'en' },
  };
}

export function serializeCar(c: CarDesign): string {
  return JSON.stringify(c, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** Parses and structurally validates a car file. Throws CarParseError with a user-facing message. */
export function parseCar(json: string): CarDesign {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new CarParseError('Файл машины повреждён: это не JSON');
  }
  const fail = (what: string): never => {
    throw new CarParseError(`Файл машины повреждён: ${what}`);
  };
  if (!isObj(raw)) fail('ожидался объект');
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) fail('неподдерживаемая версия');
  if (!isStr(r.name)) fail('нет имени');
  if (!Array.isArray(r.nodes) || !Array.isArray(r.beams) || !Array.isArray(r.wheels)) fail('нет списков узлов/балок/колёс');

  const nodes: CarNode[] = (r.nodes as unknown[]).map((v) => {
    if (!isObj(v) || !isStr(v.id) || !isNum(v.x) || !isNum(v.y) || !isNum(v.z)) fail('неверный узел');
    const o = v as Record<string, number | string>;
    return { id: o.id as string, x: o.x as number, y: o.y as number, z: o.z as number };
  });
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) fail('повторяющиеся узлы');
  const ref = (id: unknown) => {
    if (!isStr(id) || !ids.has(id)) fail('ссылка на несуществующий узел');
    return id as string;
  };

  const beams: Beam[] = (r.beams as unknown[]).map((v) => {
    if (!isObj(v) || !isStr(v.id)) fail('неверная балка');
    const o = v as Record<string, unknown>;
    return { id: o.id as string, a: ref(o.a), b: ref(o.b) };
  });

  const wheels: Wheel[] = (r.wheels as unknown[]).map((v) => {
    if (!isObj(v) || !isStr(v.id) || !isNum(v.radius) || typeof v.steering !== 'boolean' || typeof v.driven !== 'boolean') {
      fail('неверное колесо');
    }
    const o = v as Record<string, unknown>;
    const radius = o.radius as number;
    if (radius < WHEEL_RADIUS_MIN || radius > WHEEL_RADIUS_MAX) fail('радиус колеса вне диапазона');
    return { id: o.id as string, node: ref(o.node), radius, steering: o.steering as boolean, driven: o.driven as boolean };
  });

  let engine: CarDesign['engine'] = null;
  if (r.engine !== null && r.engine !== undefined) {
    if (!isObj(r.engine)) fail('неверный двигатель');
    engine = { node: ref((r.engine as Record<string, unknown>).node) };
  }

  return { version: 1, name: r.name as string, nodes, beams, wheels, engine };
}
