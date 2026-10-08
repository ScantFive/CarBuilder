import type { TrackData } from './trackData';

export type P2 = [number, number];

/** Edge points closer than this fraction of the width to the centreline are folded (hairpins). */
const MIN_CLEARANCE = 0.45;
const TANGENT_WINDOW = 3;

function distToSegment(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

function clearance(p: P2, pts: P2[], limit: number): boolean {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    if (Math.abs(a[0] - p[0]) > limit + 50 || Math.abs(a[1] - p[1]) > limit + 50) continue;
    if (distToSegment(p, a, pts[(i + 1) % pts.length]) < limit) return false;
  }
  return true;
}

/** Replaces inadmissible points with the nearest admissible neighbour (by index). */
function fold(edge: P2[], ok: boolean[]): P2[] {
  const n = edge.length;
  if (!ok.some(Boolean)) return edge;
  return edge.map((p, i) => {
    if (ok[i]) return p;
    for (let k = 1; k < n; k++) {
      if (ok[(i + k) % n]) return edge[(i + k) % n];
      if (ok[(i - k + n) % n]) return edge[(i - k + n) % n];
    }
    return p;
  });
}

/**
 * Left/right road edges (relative to the driving direction, y up) and unit tangents.
 * Driving direction d = (dx, dz) has its left at (dz, -dx).
 */
export function computeEdges(t: TrackData): { left: P2[]; right: P2[]; tangents: P2[] } {
  const pts = t.points;
  const n = pts.length;
  const half = t.width / 2;
  const tangents: P2[] = pts.map((_, i) => {
    const a = pts[(i - TANGENT_WINDOW + n) % n];
    const b = pts[(i + TANGENT_WINDOW) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  });
  const offset = (sign: number): P2[] =>
    pts.map((p, i) => [p[0] + sign * tangents[i][1] * half, p[1] - sign * tangents[i][0] * half]);
  const limit = MIN_CLEARANCE * t.width;
  const left = offset(1);
  const right = offset(-1);
  return {
    left: fold(left, left.map((p) => clearance(p, pts, limit))),
    right: fold(right, right.map((p) => clearance(p, pts, limit))),
    tangents,
  };
}

/** Index of the centreline point closest to (x, z); with a hint, searches ±40 points around it. */
export function nearestIndex(t: TrackData, x: number, z: number, hint?: number): number {
  const n = t.points.length;
  const check = (i: number, best: { i: number; d: number }) => {
    const p = t.points[i];
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < best.d) {
      best.i = i;
      best.d = d;
    }
  };
  const best = { i: 0, d: Infinity };
  if (hint === undefined) {
    for (let i = 0; i < n; i++) check(i, best);
  } else {
    for (let k = -40; k <= 40; k++) check((hint + k + n) % n, best);
  }
  return best.i;
}
