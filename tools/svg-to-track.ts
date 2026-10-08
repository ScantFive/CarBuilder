/**
 * Converts a circuit drawing (SVG) into a track JSON file.
 * Usage: npm run track -- <in.svg> <out.json> [--road-class fil2] [--name "Yas Marina"] [--length 5281] [--width 14]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parsePathD, polylineLength, resample, type P2 } from './svg/pathParser';
import { centerlineFromRing, polygonArea } from './svg/centerline';
import type { TrackData } from '../src/track/trackData';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

function die(msg: string): never {
  console.error(`Ошибка: ${msg}`);
  process.exit(1);
}

const [input, output] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
if (!input || !output) die('укажите входной SVG и выходной JSON');
const svg = readFileSync(input, 'utf8');
const roadClass = arg('road-class', 'fil2');
const lapLength = Number(arg('length', '5281'));
const width = Number(arg('width', '14'));
const name = arg('name', 'Yas Marina');

// Road outline: the longest path of the road class.
const roadPaths = [...svg.matchAll(new RegExp(`<path[^>]*class="${roadClass}"[^>]*\\sd="([^"]*)"`, 'g'))].map((m) => m[1]);
if (roadPaths.length === 0) die(`нет path с class="${roadClass}"`);
const d = roadPaths.sort((a, b) => b.length - a.length)[0];
const subs = parsePathD(d).sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
if (subs.length < 2) die('контур дороги должен состоять из двух кромок');
const [outer, inner] = subs;

let center = centerlineFromRing(outer, inner);

// Start line: centre of the chequered squares (rects with a transform matrix).
const rectCentres: P2[] = [...svg.matchAll(/<rect[^>]*transform="matrix\(([^)]*)\)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/g)].map((m) => {
  const [a, b, c, dd, e, f] = m[1].trim().split(/[\s,]+/).map(Number);
  const w = Number(m[2]) / 2;
  const h = Number(m[3]) / 2;
  return [a * w + c * h + e, b * w + dd * h + f];
});
if (rectCentres.length === 0) die('не найдена линия старта (клетчатые rect)');
const start: P2 = [
  rectCentres.reduce((s, p) => s + p[0], 0) / rectCentres.length,
  rectCentres.reduce((s, p) => s + p[1], 0) / rectCentres.length,
];

// Direction arrow: centroid of the white arrow polygon relative to the start line.
const arrowMatch = svg.match(/<polygon[^>]*class="fil6"[^>]*points="([^"]*)"/);
if (!arrowMatch) die('не найдена стрелка направления (polygon class="fil6")');
const arrowPts = arrowMatch[1].trim().split(/\s+/).map((p) => p.split(',').map(Number) as P2);
const arrow: P2 = [
  arrowPts.reduce((s, p) => s + p[0], 0) / arrowPts.length,
  arrowPts.reduce((s, p) => s + p[1], 0) / arrowPts.length,
];

const nearestIdx = (pts: P2[], p: P2) => {
  let best = 0;
  let bd = Infinity;
  pts.forEach((q, i) => {
    const dd = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  });
  return best;
};

// Orient along the arrow, then rotate so the start line is index 0.
let s0 = nearestIdx(center, start);
const next = center[(s0 + 1) % center.length];
const tangent: P2 = [next[0] - center[s0][0], next[1] - center[s0][1]];
const dir: P2 = [arrow[0] - start[0], arrow[1] - start[1]];
if (tangent[0] * dir[0] + tangent[1] * dir[1] < 0) center = center.reverse();
s0 = nearestIdx(center, start);
center = [...center.slice(s0), ...center.slice(0, s0)];

// Scale to the real lap length; SVG (x, y-down) maps to world (x, z) seen from above.
const k = lapLength / polylineLength(center, true);
let world: P2[] = center.map(([x, y]) => [x * k, y * k]);
const xs = world.map((p) => p[0]);
const zs = world.map((p) => p[1]);
const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
world = world.map(([x, z]) => [x - cx, z - cz]);
// Resample from index 0 so the start stays at index 0.
world = resample(world, 5, true).map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]);

const track: TrackData = { name, width, closed: true, points: world, startIndex: 0 };
writeFileSync(output, JSON.stringify(track));
console.log(`${name}: ${world.length} точек, длина ${polylineLength(world, true).toFixed(0)} м, масштаб ${k.toFixed(3)} м/ед.`);
