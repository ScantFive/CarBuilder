import { newId, type CarDesign } from '../model/car';
import { BODY_LIMITS, DEFAULT_PART_COLOR, DEFAULT_PART_SIZE, type BodyDesign, type BodyPart, type BodyShape } from '../model/body';
import type { Vec3 } from '../model/physicsProps';

/** Body editing operations. All pure; a missing body is created on demand. Optionally mirrored across x=0. */

const CENTRE = 0.05;
const SAME = 0.01;
const DUPLICATE_OFFSET = 0.1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, step: number) => Number((Math.round(v / step) * step).toFixed(6)) + 0;

function withBody(c: CarDesign): CarDesign & { body: BodyDesign } {
  const out = structuredClone(c);
  out.body ??= { parts: [], mounts: [] };
  return out as CarDesign & { body: BodyDesign };
}

function clampPosition(p: Vec3): Vec3 {
  return {
    x: clamp(p.x, -BODY_LIMITS.x, BODY_LIMITS.x),
    y: clamp(p.y, 0, BODY_LIMITS.yMax),
    z: clamp(p.z, -BODY_LIMITS.z, BODY_LIMITS.z),
  };
}

function clampSize(s: Vec3): Vec3 {
  const f = (v: number) => clamp(v, BODY_LIMITS.sizeMin, BODY_LIMITS.sizeMax);
  return { x: f(s.x), y: f(s.y), z: f(s.z) };
}

const near = (a: Vec3, b: Vec3) => Math.abs(a.x - b.x) < SAME && Math.abs(a.y - b.y) < SAME && Math.abs(a.z - b.z) < SAME;
const reflect = (p: Vec3): Vec3 => ({ x: -p.x, y: p.y, z: p.z });

/** Mirrored copy of a part (x -> -x, ry -> -ry, rz -> -rz). */
function mirrored(p: BodyPart, id: string): BodyPart {
  return { ...structuredClone(p), id, position: reflect(p.position), rotation: { x: p.rotation.x, y: -p.rotation.y, z: -p.rotation.z } };
}

export function mirrorPartOf(c: CarDesign, id: string): string | null {
  const parts = c.body?.parts ?? [];
  const p = parts.find((q) => q.id === id);
  if (!p || Math.abs(p.position.x) < CENTRE) return null;
  const twin = parts.find((q) => q.id !== id && q.shape === p.shape && near(q.position, reflect(p.position)));
  return twin?.id ?? null;
}

export function mirrorMountOf(c: CarDesign, id: string): string | null {
  const mounts = c.body?.mounts ?? [];
  const m = mounts.find((q) => q.id === id);
  if (!m || Math.abs(m.x) < CENTRE) return null;
  return mounts.find((q) => q.id !== id && near(q, reflect(m)))?.id ?? null;
}

/** New parts appear at x=0, so `_mirror` never creates a twin here; it keeps the op signatures uniform. */
export function addPart(c: CarDesign, shape: BodyShape, _mirror: boolean): { car: CarDesign; id: string } {
  if ((c.body?.parts.length ?? 0) >= BODY_LIMITS.parts) return { car: c, id: '' };
  const out = withBody(c);
  const id = newId('p');
  out.body.parts.push({
    id,
    shape,
    position: { x: 0, y: 0.6, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    size: { ...DEFAULT_PART_SIZE[shape] },
    color: DEFAULT_PART_COLOR,
  });
  return { car: out, id };
}

export function updatePart(c: CarDesign, id: string, patch: Partial<Omit<BodyPart, 'id'>>, mirror: boolean): CarDesign {
  const twinId = mirror ? mirrorPartOf(c, id) : null;
  const out = withBody(c);
  const part = out.body.parts.find((p) => p.id === id);
  if (!part) return c;
  Object.assign(part, structuredClone(patch));
  part.position = clampPosition(part.position);
  part.size = clampSize(part.size);
  if (!mirror) return out;

  const centred = Math.abs(part.position.x) < CENTRE;
  const idx = twinId ? out.body.parts.findIndex((p) => p.id === twinId) : -1;
  if (centred) {
    if (idx >= 0) out.body.parts.splice(idx, 1);
  } else if (idx >= 0) {
    out.body.parts[idx] = mirrored(part, twinId!);
  } else if (out.body.parts.length < BODY_LIMITS.parts) {
    out.body.parts.push(mirrored(part, newId('p')));
  }
  return out;
}

export function duplicatePart(c: CarDesign, id: string, mirror: boolean): { car: CarDesign; id: string } {
  const src = c.body?.parts.find((p) => p.id === id);
  if (!src || c.body!.parts.length >= BODY_LIMITS.parts) return { car: c, id: '' };
  const out = withBody(c);
  const copy: BodyPart = { ...structuredClone(src), id: newId('p') };
  copy.position = clampPosition({ ...copy.position, z: copy.position.z + DUPLICATE_OFFSET });
  out.body.parts.push(copy);
  return { car: mirror ? updatePart(out, copy.id, {}, true) : out, id: copy.id };
}

export function deletePart(c: CarDesign, id: string, mirror: boolean): CarDesign {
  const ids = new Set([id, ...(mirror ? [mirrorPartOf(c, id)].filter((x): x is string => !!x) : [])]);
  const out = withBody(c);
  out.body.parts = out.body.parts.filter((p) => !ids.has(p.id));
  return out;
}

export function addMount(c: CarDesign, p: Vec3, mirror: boolean): CarDesign {
  const out = withBody(c);
  const q = clampPosition({ x: round(p.x, 0.01), y: round(p.y, 0.01), z: round(p.z, 0.01) });
  const targets = mirror && Math.abs(q.x) >= CENTRE ? [q, reflect(q)] : [q];
  for (const t of targets) {
    if (out.body.mounts.length >= BODY_LIMITS.mounts) break;
    if (!out.body.mounts.some((m) => near(m, t))) out.body.mounts.push({ id: newId('m'), ...t });
  }
  return out;
}

/** Removes a mount (and its mirror twin) together with every beam attached to it. */
export function deleteMount(c: CarDesign, id: string, mirror: boolean): CarDesign {
  const ids = new Set([id, ...(mirror ? [mirrorMountOf(c, id)].filter((x): x is string => !!x) : [])]);
  const out = withBody(c);
  out.body.mounts = out.body.mounts.filter((m) => !ids.has(m.id));
  out.beams = out.beams.filter((b) => !ids.has(b.a) && !ids.has(b.b));
  return out;
}
