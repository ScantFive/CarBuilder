/** Track file format (tracks/*.json). Points are the closed centreline in world metres (x, z). */
export interface TrackData {
  name: string;
  width: number;
  closed: true;
  points: [number, number][];
  startIndex: number;
}

/** Validates parsed JSON as a track. Throws Error with a user-facing message. */
export function parseTrack(json: unknown): TrackData {
  const fail = (what: string): never => {
    throw new Error(`Файл трассы повреждён: ${what}`);
  };
  if (typeof json !== 'object' || json === null) fail('ожидался объект');
  const t = json as Record<string, unknown>;
  if (typeof t.name !== 'string') fail('нет имени');
  if (typeof t.width !== 'number' || !(t.width > 0)) fail('неверная ширина');
  if (!Array.isArray(t.points) || t.points.length < 10) fail('слишком мало точек');
  const points = (t.points as unknown[]).map((p) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) fail('неверная точка');
    return [p[0], p[1]] as [number, number];
  });
  const startIndex = typeof t.startIndex === 'number' ? t.startIndex : 0;
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= points.length) fail('неверный старт');
  return { name: t.name as string, width: t.width as number, closed: true, points, startIndex };
}
