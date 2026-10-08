import { expect, test } from 'vitest';
import { centerlineFromRing, polygonArea } from '../../tools/svg/centerline';

const circle = (r: number, n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);

test('centreline between concentric circles lies at the mean radius', () => {
  const c = centerlineFromRing(circle(10, 200), circle(6, 150));
  expect(c.length).toBeGreaterThan(50);
  for (const [x, y] of c) expect(Math.hypot(x, y)).toBeCloseTo(8, 0);
  for (const [x, y] of c) expect(Math.abs(Math.hypot(x, y) - 8)).toBeLessThan(0.2);
});

test('polygonArea is signed by orientation', () => {
  const sq: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  expect(polygonArea(sq)).toBeCloseTo(1);
  expect(polygonArea([...sq].reverse())).toBeCloseTo(-1);
});
