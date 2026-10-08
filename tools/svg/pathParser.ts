export type P2 = [number, number];

const TOKEN = /([MmLlHhVvCcSsQqTtZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

/** Parses an SVG path `d` attribute into polylines, one per subpath. Curves are flattened. */
export function parsePathD(d: string, curveSegments = 8): P2[][] {
  const tokens: (string | number)[] = [];
  for (const m of d.matchAll(TOKEN)) tokens.push(m[1] ?? Number(m[2]));

  const subs: P2[][] = [];
  let cur: P2[] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastCtrl: P2 | null = null;
  let cmd = '';
  let i = 0;
  const num = () => tokens[i++] as number;
  const hasNum = () => typeof tokens[i] === 'number';
  const flush = () => {
    if (cur.length > 0) subs.push(cur);
    cur = [];
  };
  const cubic = (p0: P2, p1: P2, p2: P2, p3: P2) => {
    for (let k = 1; k <= curveSegments; k++) {
      const t = k / curveSegments;
      const u = 1 - t;
      cur.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  };

  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') cmd = tokens[i++] as string;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        flush();
        x = ox + num();
        y = oy + num();
        startX = x;
        startY = y;
        cur.push([x, y]);
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        break;
      }
      case 'L':
        x = ox + num();
        y = oy + num();
        cur.push([x, y]);
        lastCtrl = null;
        break;
      case 'H':
        x = ox + num();
        cur.push([x, y]);
        lastCtrl = null;
        break;
      case 'V':
        y = oy + num();
        cur.push([x, y]);
        lastCtrl = null;
        break;
      case 'C': {
        const p1: P2 = [ox + num(), oy + num()];
        const p2: P2 = [ox + num(), oy + num()];
        const p3: P2 = [ox + num(), oy + num()];
        cubic([x, y], p1, p2, p3);
        [x, y] = p3;
        lastCtrl = p2;
        break;
      }
      case 'S': {
        const p1: P2 = lastCtrl ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const p2: P2 = [ox + num(), oy + num()];
        const p3: P2 = [ox + num(), oy + num()];
        cubic([x, y], p1, p2, p3);
        [x, y] = p3;
        lastCtrl = p2;
        break;
      }
      case 'Q': {
        const q: P2 = [ox + num(), oy + num()];
        const p3: P2 = [ox + num(), oy + num()];
        cubic([x, y], [x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y)], [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])], p3);
        [x, y] = p3;
        lastCtrl = null;
        break;
      }
      case 'T':
        x = ox + num();
        y = oy + num();
        cur.push([x, y]);
        lastCtrl = null;
        break;
      case 'Z':
        x = startX;
        y = startY;
        lastCtrl = null;
        // Close: the next command starts a new subpath from the start point.
        if (hasNum()) throw new Error('number after Z');
        flush();
        cur = [];
        break;
      default:
        throw new Error(`Unsupported path command ${cmd}`);
    }
  }
  flush();
  return subs;
}

export function polylineLength(p: P2[], closed: boolean): number {
  let len = 0;
  const n = closed ? p.length : p.length - 1;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

/** Evenly spaced points along the polyline with spacing ~step. */
export function resample(p: P2[], step: number, closed: boolean): P2[] {
  const total = polylineLength(p, closed);
  const count = Math.max(2, Math.round(total / step));
  const spacing = total / count;
  const out: P2[] = [];
  const segs = closed ? p.length : p.length - 1;
  let seg = 0;
  let segStart = 0;
  for (let k = 0; k < (closed ? count : count + 1); k++) {
    const target = k * spacing;
    while (seg < segs - 1) {
      const a = p[seg];
      const b = p[(seg + 1) % p.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (segStart + len >= target) break;
      segStart += len;
      seg++;
    }
    const a = p[seg];
    const b = p[(seg + 1) % p.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = Math.min(1, Math.max(0, (target - segStart) / len));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
