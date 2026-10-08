import { expect, test } from 'vitest';
import { parsePathD, polylineLength, resample } from '../../tools/svg/pathParser';

test('lines and close', () => {
  expect(parsePathD('M0 0l10 0 0 10z')).toEqual([[[0, 0], [10, 0], [10, 10]]]);
});

test('absolute H/V and implicit lineto after M', () => {
  expect(parsePathD('M1,1 5,1 H9 V4')).toEqual([[[1, 1], [5, 1], [9, 1], [9, 4]]]);
});

test('cubic curve is flattened into curveSegments points ending exactly at the end point', () => {
  const [sub] = parsePathD('M0 0c0,10 10,10 10,0', 8);
  expect(sub).toHaveLength(9);
  expect(sub[8][0]).toBeCloseTo(10);
  expect(sub[8][1]).toBeCloseTo(0);
  expect(sub[4][1]).toBeCloseTo(7.5);
});

test('relative commands after z start from the subpath start', () => {
  const subs = parsePathD('M10 10l5 0 0 5zm1 1l1 0');
  expect(subs).toHaveLength(2);
  expect(subs[1]).toEqual([[11, 11], [12, 11]]);
});

test('compact number syntax like 1.5.5 and -1-2', () => {
  expect(parsePathD('M1.5.5l-1-2')).toEqual([[[1.5, 0.5], [0.5, -1.5]]]);
});

test('polylineLength and resample', () => {
  const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  expect(polylineLength(sq, true)).toBeCloseTo(40);
  expect(polylineLength(sq, false)).toBeCloseTo(30);
  expect(resample(sq, 1, true)).toHaveLength(40);
});
