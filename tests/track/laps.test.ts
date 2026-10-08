import { expect, test } from 'vitest';
import { LapTimer } from '../../src/track/laps';

const N = 200;

test('a full lap in order is counted with its time', () => {
  const t = new LapTimer(N);
  t.start(1000);
  for (let i = 0; i < N; i++) expect(t.update(i, 1000 + i).lapCompleted).toBe(false);
  const r = t.update(0, 61000);
  expect(r).toEqual({ lapCompleted: true, lapMs: 60000 });
  expect(t.last).toBe(60000);
  expect(t.best).toBe(60000);
  expect(t.current(61500)).toBe(500);
});

test('reversing over the start line does not count a lap', () => {
  const t = new LapTimer(N);
  t.start(0);
  t.update(0, 1);
  t.update(N - 1, 2);
  expect(t.update(0, 3).lapCompleted).toBe(false);
});

test('skipping checkpoints (cutting the track) does not count', () => {
  const t = new LapTimer(N);
  t.start(0);
  for (let i = 0; i < 100; i++) t.update(i, i);
  for (let i = 150; i < N; i++) t.update(i, i);
  expect(t.update(0, 999).lapCompleted).toBe(false);
});

test('best keeps the fastest lap', () => {
  const t = new LapTimer(N);
  t.start(0);
  const lap = (end: number) => {
    for (let i = 1; i < N; i++) t.update(i, end - 1);
    return t.update(0, end);
  };
  lap(50000);
  lap(90000);
  expect(t.last).toBe(40000);
  expect(t.best).toBe(40000);
});

test('nothing advances before start; lastCheckpointIndex follows progress', () => {
  const t = new LapTimer(N);
  for (let i = 0; i < 50; i++) t.update(i, i);
  expect(t.lastCheckpointIndex()).toBe(0);
  expect(t.current(100)).toBe(0);
  t.start(0);
  for (let i = 0; i < 25; i++) t.update(i, i);
  expect(t.lastCheckpointIndex()).toBe(20);
});
