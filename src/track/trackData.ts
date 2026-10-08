/** Track file format (tracks/*.json). Points are the closed centreline in world metres (x, z). */
export interface TrackData {
  name: string;
  width: number;
  closed: true;
  points: [number, number][];
  startIndex: number;
}
