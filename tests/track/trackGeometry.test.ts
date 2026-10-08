import { expect, test } from 'vitest';
import { computeEdges, nearestIndex, type P2 } from '../../src/track/trackGeometry';
import type { TrackData } from '../../src/track/trackData';

const track = (points: P2[], width = 14): TrackData => ({ name: 't', width, closed: true, points, startIndex: 0 });

function circle(r: number, n: number): P2[] {
  return Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);
}

function distToPolyline(p: P2, pts: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz));
  }
  return best;
}

function segmentsIntersect(a: P2, b: P2, c: P2, d: P2): boolean {
  const cross = (o: P2, p: P2, q: P2) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
}

function selfIntersects(p: P2[]): boolean {
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 2; j < p.length; j++) {
      if (i === 0 && j === p.length - 1) continue;
      if (segmentsIntersect(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length])) return true;
    }
  }
  return false;
}

/** Hairpin: two legs diverging from a tight apex with centreline radius 4 (< width/2). */
function hairpin(): P2[] {
  const pts: P2[] = [];
  const r = 4;
  const open = 0.35; // legs open outward
  // Leg A going up-left to the apex, the apex arc, leg B going down-right, closed by a big arc.
  for (let s = 200; s > 0; s -= 5) pts.push([-r - s * Math.sin(open), -s * Math.cos(open)]);
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI - (Math.PI * k) / 12;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  for (let s = 5; s <= 200; s += 5) pts.push([r + s * Math.sin(open), -s * Math.cos(open)]);
  const ax = r + 200 * Math.sin(open);
  const az = -200 * Math.cos(open);
  for (let k = 1; k < 40; k++) {
    const a = (Math.PI * k) / 40;
    pts.push([ax * Math.cos(a), az - ax * Math.sin(a) * 0.5]);
  }
  return pts;
}

test('edges of a circle are offset by half the width on both sides', () => {
  const { left, right } = computeEdges(track(circle(100, 200)));
  const radii = (e: P2[]) => e.map((p) => Math.hypot(p[0], p[1]));
  const l = radii(left);
  const r = radii(right);
  const outer = l[0] > r[0] ? l : r;
  const inner = l[0] > r[0] ? r : l;
  outer.forEach((v) => expect(Math.abs(v - 107)).toBeLessThan(0.5));
  inner.forEach((v) => expect(Math.abs(v - 93)).toBeLessThan(0.5));
});

test('left edge is on the left of the driving direction', () => {
  // Counter-clockwise circle seen with x right, z down: driving direction at index 0 is +z.
  const { left } = computeEdges(track(circle(100, 200)));
  // At (100, 0) heading +z; "left" of the driver (y up) is +x.
  expect(left[0][0]).toBeGreaterThan(100);
});

test('hairpin edges stay clear of the centreline and do not loop', () => {
  const pts = hairpin();
  const { left, right } = computeEdges(track(pts));
  for (const e of [left, right]) {
    for (const p of e) expect(distToPolyline(p, pts)).toBeGreaterThanOrEqual(6.3 - 1e-6);
    expect(selfIntersects(e)).toBe(false);
    for (let i = 0; i < e.length; i++) {
      const a = e[i];
      const b = e[(i + 1) % e.length];
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(28);
    }
  }
});

test('nearestIndex finds the closest point, with and without hint', () => {
  const t = track(circle(100, 200));
  expect(nearestIndex(t, 100, 1)).toBe(0);
  expect(nearestIndex(t, -100, 0)).toBe(100);
  expect(nearestIndex(t, -100, 0, 95)).toBe(100);
  expect(nearestIndex(t, 100, -2.8, 1)).toBe(199);
});
