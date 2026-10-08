import type { CarDesign, CarNode, Wheel } from './car';

export type Vec3 = { x: number; y: number; z: number };

export const MASS = { beamPerMeter: 8, engine: 150, wheel: 10 };

/** Engine closer than this to the COM (along z) counts as mid-engine: all wheels driven. */
const MID_ENGINE_THRESHOLD = 0.3;

interface PointMass {
  m: number;
  p: Vec3;
}

function nodeMap(c: CarDesign): Map<string, CarNode> {
  return new Map(c.nodes.map((n) => [n.id, n]));
}

function pointMasses(c: CarDesign): PointMass[] {
  const nodes = nodeMap(c);
  const out: PointMass[] = [];
  for (const b of c.beams) {
    const a = nodes.get(b.a);
    const e = nodes.get(b.b);
    if (!a || !e) continue;
    const m = Math.hypot(e.x - a.x, e.y - a.y, e.z - a.z) * MASS.beamPerMeter;
    if (m <= 0) continue;
    const mid = { x: (a.x + e.x) / 2, y: (a.y + e.y) / 2, z: (a.z + e.z) / 2 };
    out.push({ m: m / 4, p: a }, { m: m / 2, p: mid }, { m: m / 4, p: e });
  }
  const at = (id: string, m: number) => {
    const n = nodes.get(id);
    if (n) out.push({ m, p: n });
  };
  if (c.engine) at(c.engine.node, MASS.engine);
  for (const w of c.wheels) at(w.node, MASS.wheel);
  return out;
}

/** Total mass, centre of mass and diagonal inertia about the COM (point-mass approximation). */
export function computeMassProperties(c: CarDesign): { mass: number; com: Vec3; inertia: Vec3 } {
  const pts = pointMasses(c);
  const mass = pts.reduce((s, q) => s + q.m, 0);
  const com = { x: 0, y: 0, z: 0 };
  if (mass > 0) {
    for (const q of pts) {
      com.x += (q.m * q.p.x) / mass;
      com.y += (q.m * q.p.y) / mass;
      com.z += (q.m * q.p.z) / mass;
    }
  }
  const inertia = { x: 0, y: 0, z: 0 };
  for (const q of pts) {
    const dx = q.p.x - com.x;
    const dy = q.p.y - com.y;
    const dz = q.p.z - com.z;
    inertia.x += q.m * (dy * dy + dz * dz);
    inertia.y += q.m * (dx * dx + dz * dz);
    inertia.z += q.m * (dx * dx + dy * dy);
  }
  return { mass, com, inertia };
}

/** Roles a freshly placed wheel gets: steer if ahead of COM, drive if on the engine's half. */
export function defaultWheelRoles(c: CarDesign, nodeId: string): { steering: boolean; driven: boolean } {
  const nodes = nodeMap(c);
  const node = nodes.get(nodeId);
  if (!node) return { steering: false, driven: false };
  const com = computeMassProperties(c).com;
  const steering = node.z > com.z;
  const engine = c.engine ? nodes.get(c.engine.node) : undefined;
  let driven = true;
  if (engine && Math.abs(engine.z - com.z) > MID_ENGINE_THRESHOLD) {
    driven = Math.sign(node.z - com.z) === Math.sign(engine.z - com.z);
  }
  return { steering, driven };
}

/** Steering wheels behind the COM turn the opposite way (rear-wheel steering). */
export function steerSign(c: CarDesign, wheel: Wheel): 1 | -1 {
  const node = c.nodes.find((n) => n.id === wheel.node);
  const com = computeMassProperties(c).com;
  return node && node.z < com.z ? -1 : 1;
}

/** Height to lift the car origin so every wheel bottom (at suspension rest) touches y=0. */
export function spawnHeight(c: CarDesign, suspensionRest: number): number {
  const nodes = nodeMap(c);
  let h = 0;
  for (const w of c.wheels) {
    const n = nodes.get(w.node);
    if (n) h = Math.max(h, w.radius + suspensionRest - n.y);
  }
  return h;
}
