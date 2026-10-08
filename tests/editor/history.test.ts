import { expect, test } from 'vitest';
import { createEmptyCar } from '../../src/model/car';
import { History } from '../../src/editor/history';

const car = (name: string) => createEmptyCar(name);

test('undo and redo walk the snapshots', () => {
  const h = new History();
  h.push(car('A'));
  h.push(car('B'));
  expect(h.undo()?.name).toBe('A');
  expect(h.undo()).toBeNull();
  expect(h.redo()?.name).toBe('B');
  expect(h.redo()).toBeNull();
});

test('push after undo drops the redo branch', () => {
  const h = new History();
  h.push(car('A'));
  h.push(car('B'));
  h.undo();
  h.push(car('C'));
  expect(h.redo()).toBeNull();
  expect(h.undo()?.name).toBe('A');
});

test('keeps at most limit undo steps', () => {
  const h = new History(100);
  for (let i = 0; i <= 101; i++) h.push(car(String(i)));
  let n = 0;
  while (h.undo()) n++;
  expect(n).toBe(100);
});
