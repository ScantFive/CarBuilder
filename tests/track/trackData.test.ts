import { expect, test } from 'vitest';
import { parseTrack } from '../../src/track/trackData';
import yas from '../../tracks/yas-marina.json';

test('bundled Yas Marina track parses', () => {
  const t = parseTrack(yas);
  expect(t.points.length).toBeGreaterThan(1000);
  expect(t.width).toBe(14);
});

test('rejects malformed tracks', () => {
  expect(() => parseTrack({})).toThrow();
  expect(() => parseTrack({ name: 'x', width: 14, closed: true, points: [[0, 0]], startIndex: 0 })).toThrow();
  expect(() => parseTrack({ name: 'x', width: -1, closed: true, points: Array(20).fill([0, 0]), startIndex: 0 })).toThrow();
});
