import { beforeEach, expect, test } from 'vitest';
import { createTemplateCar } from '../../src/model/car';
import { CarStorage } from '../../src/storage/carStorage';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

class BrokenStorage extends MemStorage {
  getItem(): string | null { throw new Error('denied'); }
  setItem(): void { throw new Error('denied'); }
}

let mem: MemStorage;
beforeEach(() => { mem = new MemStorage(); });

test('save, list and load roundtrip', () => {
  const s = new CarStorage(mem);
  const c = { ...createTemplateCar(), name: 'Болид' };
  s.save(c);
  expect(s.list()).toEqual(['Болид']);
  expect(s.load('Болид')).toEqual(c);
  s.remove('Болид');
  expect(s.list()).toEqual([]);
});

test('garbage in storage gives an empty list without throwing', () => {
  mem.setItem('carbuilder.cars', 'мусор');
  mem.setItem('carbuilder.current', '{"version":1');
  const s = new CarStorage(mem);
  expect(s.list()).toEqual([]);
  expect(s.loadCurrent()).toBeNull();
});

test('corrupt entries are skipped, valid ones kept', () => {
  const good = createTemplateCar();
  mem.setItem('carbuilder.cars', JSON.stringify({ ok: good, bad: { version: 7 } }));
  const s = new CarStorage(mem);
  expect(s.list()).toEqual(['ok']);
  expect(s.load('bad')).toBeNull();
});

test('a throwing storage never throws out of CarStorage', () => {
  const s = new CarStorage(new BrokenStorage());
  expect(() => s.save(createTemplateCar())).not.toThrow();
  expect(s.load('Шаблон')).toBeNull();
  expect(s.list()).toEqual([]);
  expect(() => s.saveCurrent(createTemplateCar())).not.toThrow();
  expect(s.getBest('x')).toBeNull();
});

test('null storage works as no-op', () => {
  const s = new CarStorage(null);
  s.save(createTemplateCar());
  expect(s.list()).toEqual([]);
});

test('current car and best lap', () => {
  const s = new CarStorage(mem);
  s.saveCurrent(createTemplateCar());
  expect(s.loadCurrent()?.name).toBe('Шаблон');
  expect(s.getBest('Шаблон')).toBeNull();
  s.setBest('Шаблон', 93456);
  expect(s.getBest('Шаблон')).toBe(93456);
});
