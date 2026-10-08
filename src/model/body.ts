import type { Vec3 } from './physicsProps';

export type BodyShape = 'box' | 'wedge' | 'cylinder' | 'sphere' | 'wing';
export const BODY_SHAPES: BodyShape[] = ['box', 'wedge', 'cylinder', 'sphere', 'wing'];

export interface BodyPart {
  id: string;
  shape: BodyShape;
  /** Centre in car coordinates, metres. */
  position: Vec3;
  /** Euler angles XYZ (Three.js order), degrees. */
  rotation: Vec3;
  /** Extents along the part's own axes before rotation, metres. */
  size: Vec3;
  color: string;
}

export interface BodyMount {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface BodyDesign {
  parts: BodyPart[];
  mounts: BodyMount[];
}

export const BODY_LIMITS = { parts: 60, mounts: 16, sizeMin: 0.02, sizeMax: 4, x: 1.6, yMax: 2, z: 3.5 };
export const SHELL_KG_PER_M2 = 6;
export const DEFAULT_PART_COLOR = '#d33a2c';
export const DEFAULT_PART_SIZE: Record<BodyShape, Vec3> = {
  box: { x: 1, y: 0.05, z: 1 },
  wedge: { x: 1, y: 0.4, z: 0.8 },
  cylinder: { x: 0.6, y: 0.3, z: 0.3 },
  sphere: { x: 0.5, y: 0.5, z: 0.5 },
  wing: { x: 1.6, y: 0.04, z: 0.4 },
};
export const SHAPE_LABELS: Record<BodyShape, string> = {
  box: 'Панель',
  wedge: 'Клин',
  cylinder: 'Цилиндр',
  sphere: 'Сфера',
  wing: 'Крыло',
};

const CYLINDER_SEGMENTS = 16;
const SPHERE_LON = 8;
const SPHERE_LAT = 6;
const WING_PLATE_THICKNESS = 0.02;

/** Height of the wing end plates. */
export const wingEndplateHeight = (sy: number) => 3 * sy + 0.1;

function boxCorners(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push({ x: cx + sx * hx, y: cy + sy * hy, z: cz + sz * hz });
  return out;
}

/** Vertices in the part's local frame (centred, unrotated). */
export function localVertices(shape: BodyShape, s: Vec3): Vec3[] {
  const hx = s.x / 2;
  const hy = s.y / 2;
  const hz = s.z / 2;
  switch (shape) {
    case 'box':
      return boxCorners(0, 0, 0, hx, hy, hz);
    case 'wedge': {
      // Right triangle in YZ: bottom edge along z, vertical rear wall at z = -sz/2.
      const tri = [
        { y: -hy, z: -hz },
        { y: -hy, z: hz },
        { y: hy, z: -hz },
      ];
      return [-hx, hx].flatMap((x) => tri.map((t) => ({ x, ...t })));
    }
    case 'cylinder': {
      const out: Vec3[] = [];
      for (const x of [-hx, hx]) {
        for (let i = 0; i < CYLINDER_SEGMENTS; i++) {
          const a = (2 * Math.PI * i) / CYLINDER_SEGMENTS;
          out.push({ x, y: hy * Math.cos(a), z: hz * Math.sin(a) });
        }
      }
      return out;
    }
    case 'sphere': {
      const out: Vec3[] = [{ x: 0, y: hy, z: 0 }, { x: 0, y: -hy, z: 0 }];
      for (let i = 1; i <= SPHERE_LAT; i++) {
        const phi = (Math.PI * i) / (SPHERE_LAT + 1);
        for (let j = 0; j < SPHERE_LON; j++) {
          const th = (2 * Math.PI * j) / SPHERE_LON;
          out.push({ x: hx * Math.sin(phi) * Math.cos(th), y: hy * Math.cos(phi), z: hz * Math.sin(phi) * Math.sin(th) });
        }
      }
      return out;
    }
    case 'wing': {
      const h = wingEndplateHeight(s.y) / 2;
      const t = WING_PLATE_THICKNESS / 2;
      return [...boxCorners(0, 0, 0, hx, hy, hz), ...boxCorners(-hx, 0, 0, t, h, hz), ...boxCorners(hx, 0, 0, t, h, hz)];
    }
  }
}

const DEG = Math.PI / 180;

/** Rotates by Euler XYZ (Three.js convention: v' = Rx·Ry·Rz·v). */
export function rotateXYZ(v: Vec3, r: Vec3): Vec3 {
  const [cx, sx] = [Math.cos(r.x * DEG), Math.sin(r.x * DEG)];
  const [cy, sy] = [Math.cos(r.y * DEG), Math.sin(r.y * DEG)];
  const [cz, sz] = [Math.cos(r.z * DEG), Math.sin(r.z * DEG)];
  // Rz
  let x = v.x * cz - v.y * sz;
  let y = v.x * sz + v.y * cz;
  let z = v.z;
  // Ry
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  // Rx
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  return { x, y, z };
}

/** Part vertices in car coordinates. */
export function partVertices(p: BodyPart): Vec3[] {
  return localVertices(p.shape, p.size).map((v) => {
    const r = rotateXYZ(v, p.rotation);
    return { x: r.x + p.position.x, y: r.y + p.position.y, z: r.z + p.position.z };
  });
}

const boxArea = (s: Vec3) => 2 * (s.x * s.y + s.y * s.z + s.x * s.z);

export function partArea(p: BodyPart): number {
  const s = p.size;
  switch (p.shape) {
    case 'box':
      return boxArea(s);
    case 'wedge':
      return s.y * s.z + s.x * (s.y + s.z + Math.hypot(s.y, s.z));
    case 'cylinder': {
      const a = s.y / 2;
      const b = s.z / 2;
      return s.x * Math.PI * (a + b) + 2 * Math.PI * a * b;
    }
    case 'sphere': {
      const P = 1.6075;
      const [a, b, c] = [s.x / 2, s.y / 2, s.z / 2];
      return 4 * Math.PI * (((a * b) ** P + (a * c) ** P + (b * c) ** P) / 3) ** (1 / P);
    }
    case 'wing':
      return boxArea(s) + 2 * 2 * wingEndplateHeight(s.y) * s.z;
  }
}

export function partMass(p: BodyPart): number {
  return partArea(p) * SHELL_KG_PER_M2;
}

export function bodyMinY(b: BodyDesign): number {
  let min = Infinity;
  for (const p of b.parts) for (const v of partVertices(p)) min = Math.min(min, v.y);
  return min;
}
