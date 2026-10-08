import { resample, type P2 } from './pathParser';

/** Shoelace area; positive for counter-clockwise in a y-up frame. */
export function polygonArea(p: P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function nearest(p: P2, pts: P2[]): P2 {
  let best = pts[0];
  let bd = Infinity;
  for (const q of pts) {
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

/** Closed moving average with the given odd window. */
export function smoothClosed(p: P2[], window: number): P2[] {
  const h = Math.floor(window / 2);
  return p.map((_, i) => {
    let sx = 0;
    let sy = 0;
    for (let k = -h; k <= h; k++) {
      const q = p[(i + k + p.length) % p.length];
      sx += q[0];
      sy += q[1];
    }
    return [sx / window, sy / window];
  });
}

/** Midline of a road ring given its outer and inner edges (closed polylines). */
export function centerlineFromRing(outer: P2[], inner: P2[], step = 0.5): P2[] {
  const o = resample(outer, step, true);
  const inn = resample(inner, step / 2, true);
  const mids = o.map((p): P2 => {
    const q = nearest(p, inn);
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  });
  return smoothClosed(mids, 5);
}
