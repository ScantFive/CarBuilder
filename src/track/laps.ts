/** Lap counting over centreline indices: checkpoints must be passed in order. */
export class LapTimer {
  last: number | null = null;
  best: number | null = null;
  private next = 1;
  private lapStart = 0;
  private started = false;
  private readonly span: number;

  constructor(private readonly pointCount: number, private readonly checkpoints = 20) {
    this.span = pointCount / checkpoints;
  }

  private cp(k: number): number {
    return Math.floor((k * this.pointCount) / this.checkpoints);
  }

  get isStarted(): boolean {
    return this.started;
  }

  start(nowMs: number): void {
    this.started = true;
    this.lapStart = nowMs;
    this.next = 1;
  }

  update(index: number, nowMs: number): { lapCompleted: boolean; lapMs?: number } {
    if (!this.started) return { lapCompleted: false };
    if (this.next < this.checkpoints) {
      const c = this.cp(this.next);
      if (index >= c && index < c + this.span) this.next += 1;
      return { lapCompleted: false };
    }
    if (index < this.span) {
      const lapMs = nowMs - this.lapStart;
      this.last = lapMs;
      this.best = this.best === null ? lapMs : Math.min(this.best, lapMs);
      this.lapStart = nowMs;
      this.next = 1;
      return { lapCompleted: true, lapMs };
    }
    return { lapCompleted: false };
  }

  current(nowMs: number): number {
    return this.started ? nowMs - this.lapStart : 0;
  }

  /** Centreline index of the last checkpoint passed (the start line before any). */
  lastCheckpointIndex(): number {
    return this.cp(this.next - 1);
  }
}
