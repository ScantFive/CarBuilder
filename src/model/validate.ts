import type { CarDesign } from './car';

export const WHEELS_MIN = 3;
export const WHEELS_MAX = 8;

/** Returns user-facing problems that prevent a test drive; empty when the car is drivable. */
export function validateCar(c: CarDesign): string[] {
  const errors: string[] = [];
  if (c.beams.length === 0) errors.push('Нет балок');
  if (c.wheels.length < WHEELS_MIN || c.wheels.length > WHEELS_MAX) errors.push('Нужно от 3 до 8 колёс');
  if (!c.engine) errors.push('Нет двигателя');
  if (c.wheels.length > 0 && !c.wheels.some((w) => w.driven)) errors.push('Нет ведущих колёс');
  if (c.wheels.length > 0 && !c.wheels.some((w) => w.steering)) errors.push('Нет рулевых колёс');
  if (!isConnected(c)) errors.push('Каркас не связный: колёса и двигатель должны быть соединены балками');
  if (c.wheels.length >= WHEELS_MIN && wheelsCollinear(c)) errors.push('Колёса стоят на одной линии — машина опрокинется');
  return errors;
}

function isConnected(c: CarDesign): boolean {
  const required = [...c.wheels.map((w) => w.node), ...(c.engine ? [c.engine.node] : [])];
  if (required.length <= 1) return true;
  const adj = new Map<string, string[]>();
  for (const b of c.beams) {
    adj.set(b.a, [...(adj.get(b.a) ?? []), b.b]);
    adj.set(b.b, [...(adj.get(b.b) ?? []), b.a]);
  }
  const seen = new Set([required[0]]);
  const stack = [required[0]];
  while (stack.length) {
    for (const next of adj.get(stack.pop()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return required.every((id) => seen.has(id));
}

function wheelsCollinear(c: CarDesign): boolean {
  const pts = c.wheels
    .map((w) => c.nodes.find((n) => n.id === w.node))
    .filter((n) => n !== undefined)
    .map((n) => [n.x, n.z] as const);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      for (let k = j + 1; k < pts.length; k++) {
        const [a, b, d] = [pts[i], pts[j], pts[k]];
        const area = Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (b[1] - a[1])) / 2;
        if (area > 0.01) return false;
      }
    }
  }
  return true;
}
