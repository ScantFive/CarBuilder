import type { CarDesign } from './car';
import { BODY_LIMITS, bodyMinY } from './body';
import { SUSPENSION_REST } from './physicsProps';

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
  if (c.body) errors.push(...bodyErrors(c));
  return errors;
}

function bodyErrors(c: CarDesign): string[] {
  const body = c.body!;
  const errors: string[] = [];
  if (body.parts.length > BODY_LIMITS.parts) errors.push('Слишком много деталей кузова (максимум 60)');
  if (body.mounts.length > BODY_LIMITS.mounts) errors.push('Слишком много точек крепления (максимум 16)');
  if (body.parts.length > 0) {
    const frame = frameComponent(c);
    if (!body.mounts.some((m) => frame.has(m.id))) errors.push('Кузов не прикреплён к каркасу');
    const wheelBottom = Math.min(
      ...c.wheels.map((w) => {
        const n = c.nodes.find((q) => q.id === w.node);
        return n ? n.y - w.radius - SUSPENSION_REST : Infinity;
      }),
    );
    if (Number.isFinite(wheelBottom) && bodyMinY(body) < wheelBottom) errors.push('Кузов ниже колёс — заденет землю');
  }
  return errors;
}

function requiredIds(c: CarDesign): string[] {
  return [...c.wheels.map((w) => w.node), ...(c.engine ? [c.engine.node] : [])];
}

function isConnected(c: CarDesign): boolean {
  const required = requiredIds(c);
  if (required.length <= 1) return true;
  const seen = reachable(c, required[0]);
  return required.every((id) => seen.has(id));
}

/** Everything reachable by beams from the first wheel/engine node. */
function frameComponent(c: CarDesign): Set<string> {
  const required = requiredIds(c);
  return required.length ? reachable(c, required[0]) : new Set();
}

function reachable(c: CarDesign, start: string): Set<string> {
  const adj = new Map<string, string[]>();
  for (const b of c.beams) {
    adj.set(b.a, [...(adj.get(b.a) ?? []), b.b]);
    adj.set(b.b, [...(adj.get(b.b) ?? []), b.a]);
  }
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    for (const next of adj.get(stack.pop()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
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
