import type { CarDesign } from '../model/car';

/** Linear undo/redo over immutable CarDesign snapshots. */
export class History {
  private states: CarDesign[] = [];
  private index = -1;

  constructor(private readonly limit = 100) {}

  push(c: CarDesign): void {
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(c);
    if (this.states.length > this.limit + 1) this.states.shift();
    this.index = this.states.length - 1;
  }

  undo(): CarDesign | null {
    if (this.index <= 0) return null;
    this.index -= 1;
    return this.states[this.index];
  }

  redo(): CarDesign | null {
    if (this.index >= this.states.length - 1) return null;
    this.index += 1;
    return this.states[this.index];
  }
}
