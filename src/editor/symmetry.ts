import { newId, WHEEL_RADIUS_DEFAULT, WHEEL_RADIUS_MAX, WHEEL_RADIUS_MIN, type CarDesign, type Wheel } from '../model/car';
import { defaultWheelRoles, type Vec3 } from '../model/physicsProps';
import { mirrorMountOf } from '../body/bodyOps';

/** Editing operations on CarDesign. All are pure and optionally mirrored across x=0. */

export const BOUNDS = { x: 1.5, yMax: 1.5, z: 3 };
export const GRID = 0.1;
const CENTRE = 0.05;
const SAME = 0.01;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snap = (v: number) => Math.round(v / GRID) * GRID + 0; // +0 turns -0 into 0
const round = (v: number) => Math.round(v * 1000) / 1000;

export function normalizePoint(p: Vec3): Vec3 {
  let x = round(snap(clamp(p.x, -BOUNDS.x, BOUNDS.x)));
  if (Math.abs(x) < CENTRE) x = 0;
  return { x, y: round(snap(clamp(p.y, 0, BOUNDS.yMax))), z: round(snap(clamp(p.z, -BOUNDS.z, BOUNDS.z))) };
}

const clone = (c: CarDesign): CarDesign => structuredClone(c);

function nodeAt(c: CarDesign, p: Vec3): string | null {
  const n = c.nodes.find((q) => Math.abs(q.x - p.x) < SAME && Math.abs(q.y - p.y) < SAME && Math.abs(q.z - p.z) < SAME);
  return n ? n.id : null;
}

/** Id of the node (or body mount) mirrored across x=0, or null for centre points / points without a partner. */
export function mirrorOf(c: CarDesign, nodeId: string): string | null {
  if (c.body?.mounts.some((m) => m.id === nodeId)) return mirrorMountOf(c, nodeId);
  const n = c.nodes.find((q) => q.id === nodeId);
  if (!n || Math.abs(n.x) < CENTRE) return null;
  return nodeAt(c, { x: -n.x, y: n.y, z: n.z });
}

export function addNode(c: CarDesign, p: Vec3, mirror: boolean): CarDesign {
  const out = clone(c);
  const q = normalizePoint(p);
  const targets = mirror && q.x !== 0 ? [q, { ...q, x: -q.x }] : [q];
  for (const t of targets) {
    if (!nodeAt(out, t)) out.nodes.push({ id: newId('n'), ...t });
  }
  return out;
}

function hasBeam(c: CarDesign, a: string, b: string): boolean {
  return c.beams.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
}

export function addBeam(c: CarDesign, a: string, b: string, mirror: boolean): CarDesign {
  const out = clone(c);
  const pairs: [string, string][] = [[a, b]];
  if (mirror) {
    const ma = mirrorOf(c, a) ?? (isCentre(c, a) ? a : null);
    const mb = mirrorOf(c, b) ?? (isCentre(c, b) ? b : null);
    if (ma && mb) pairs.push([ma, mb]);
  }
  for (const [x, y] of pairs) {
    if (x !== y && !hasBeam(out, x, y)) out.beams.push({ id: newId('b'), a: x, b: y });
  }
  return out;
}

function isCentre(c: CarDesign, id: string): boolean {
  const n = c.nodes.find((q) => q.id === id) ?? c.body?.mounts.find((m) => m.id === id);
  return !!n && Math.abs(n.x) < CENTRE;
}

function withMirror(c: CarDesign, id: string, mirror: boolean): string[] {
  const m = mirror ? mirrorOf(c, id) : null;
  return m ? [id, m] : [id];
}

export type WheelProps = Partial<Omit<Wheel, 'id' | 'node'>>;

/** Places (or updates) a wheel on a node. Ignored on the engine node. */
export function setWheel(c: CarDesign, nodeId: string, props: WheelProps, mirror: boolean): CarDesign {
  const out = clone(c);
  for (const id of withMirror(c, nodeId, mirror)) {
    if (!out.nodes.some((n) => n.id === id) || out.engine?.node === id) continue;
    const existing = out.wheels.find((w) => w.node === id);
    if (existing) {
      Object.assign(existing, props);
    } else {
      out.wheels.push({ id: newId('w'), node: id, radius: WHEEL_RADIUS_DEFAULT, ...defaultWheelRoles(c, nodeId), ...props });
    }
  }
  for (const w of out.wheels) w.radius = clamp(w.radius, WHEEL_RADIUS_MIN, WHEEL_RADIUS_MAX);
  return out;
}

export function removeWheel(c: CarDesign, nodeId: string, mirror: boolean): CarDesign {
  const ids = new Set(withMirror(c, nodeId, mirror));
  const out = clone(c);
  out.wheels = out.wheels.filter((w) => !ids.has(w.node));
  return out;
}

/** Moves the single engine to a node; a wheel on that node is removed. */
export function setEngine(c: CarDesign, nodeId: string): CarDesign {
  if (!c.nodes.some((n) => n.id === nodeId)) return c;
  const out = clone(c);
  out.engine = { node: nodeId };
  out.wheels = out.wheels.filter((w) => w.node !== nodeId);
  return out;
}

export function moveNode(c: CarDesign, id: string, p: Vec3, mirror: boolean): CarDesign {
  const out = clone(c);
  const partner = mirror ? mirrorOf(c, id) : null;
  const q = normalizePoint(p);
  const n = out.nodes.find((x) => x.id === id);
  if (!n) return c;
  Object.assign(n, q);
  if (partner) {
    const m = out.nodes.find((x) => x.id === partner)!;
    Object.assign(m, { ...q, x: q.x === 0 ? 0 : -q.x });
  }
  return out;
}

export function deleteNode(c: CarDesign, id: string, mirror: boolean): CarDesign {
  const ids = new Set(withMirror(c, id, mirror));
  const out = clone(c);
  out.nodes = out.nodes.filter((n) => !ids.has(n.id));
  out.beams = out.beams.filter((b) => !ids.has(b.a) && !ids.has(b.b));
  out.wheels = out.wheels.filter((w) => !ids.has(w.node));
  if (out.engine && ids.has(out.engine.node)) out.engine = null;
  return out;
}

export function deleteBeam(c: CarDesign, beamId: string, mirror: boolean): CarDesign {
  const beam = c.beams.find((b) => b.id === beamId);
  if (!beam) return c;
  const out = clone(c);
  const drop = new Set([beamId]);
  if (mirror) {
    const ma = mirrorOf(c, beam.a) ?? beam.a;
    const mb = mirrorOf(c, beam.b) ?? beam.b;
    const m = c.beams.find((b) => (b.a === ma && b.b === mb) || (b.a === mb && b.b === ma));
    if (m) drop.add(m.id);
  }
  out.beams = out.beams.filter((b) => !drop.has(b.id));
  return out;
}
