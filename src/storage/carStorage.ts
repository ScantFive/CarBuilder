import { parseCar, serializeCar, type CarDesign } from '../model/car';

const KEY_CARS = 'carbuilder.cars';
const KEY_CURRENT = 'carbuilder.current';
const KEY_BEST = 'carbuilder.best.';

/** Car persistence on top of a (possibly missing or failing) Web Storage. Never throws. */
export class CarStorage {
  constructor(private readonly store: Storage | null) {}

  private get(key: string): string | null {
    try {
      return this.store?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private set(key: string, value: string): void {
    try {
      this.store?.setItem(key, value);
    } catch {
      // Storage full or blocked: saving is best-effort.
    }
  }

  private readAll(): Record<string, CarDesign> {
    const out: Record<string, CarDesign> = {};
    let raw: unknown;
    try {
      raw = JSON.parse(this.get(KEY_CARS) ?? '{}');
    } catch {
      return out;
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
    for (const [name, value] of Object.entries(raw)) {
      try {
        out[name] = parseCar(JSON.stringify(value));
      } catch {
        // Skip corrupt entry.
      }
    }
    return out;
  }

  list(): string[] {
    return Object.keys(this.readAll()).sort((a, b) => a.localeCompare(b, 'ru'));
  }

  save(c: CarDesign): void {
    const all = this.readAll();
    all[c.name] = c;
    this.set(KEY_CARS, JSON.stringify(all));
  }

  load(name: string): CarDesign | null {
    return this.readAll()[name] ?? null;
  }

  remove(name: string): void {
    const all = this.readAll();
    delete all[name];
    this.set(KEY_CARS, JSON.stringify(all));
  }

  saveCurrent(c: CarDesign): void {
    this.set(KEY_CURRENT, serializeCar(c));
  }

  loadCurrent(): CarDesign | null {
    const raw = this.get(KEY_CURRENT);
    if (!raw) return null;
    try {
      return parseCar(raw);
    } catch {
      return null;
    }
  }

  getBest(name: string): number | null {
    const v = Number(this.get(KEY_BEST + name));
    return this.get(KEY_BEST + name) !== null && Number.isFinite(v) && v > 0 ? v : null;
  }

  setBest(name: string, ms: number): void {
    this.set(KEY_BEST + name, String(Math.round(ms)));
  }
}

/** Downloads the car as `<name>.car.json`. */
export function exportCar(c: CarDesign): void {
  const blob = new Blob([serializeCar(c)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${c.name || 'car'}.car.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Reads a car file chosen by the user; rejects with CarParseError on bad content. */
export async function importCarFile(f: File): Promise<CarDesign> {
  return parseCar(await f.text());
}
