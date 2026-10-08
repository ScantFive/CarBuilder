import type { DriveInput } from './driveModel';

/** Keyboard state for driving. Uses physical key codes so it works with any layout. */
export class KeyboardInput {
  readonly state: DriveInput = { w: false, s: false, a: false, d: false, space: false };
  private readonly map: Record<string, keyof DriveInput> = {
    KeyW: 'w', ArrowUp: 'w',
    KeyS: 's', ArrowDown: 's',
    KeyA: 'a', ArrowLeft: 'a',
    KeyD: 'd', ArrowRight: 'd',
    Space: 'space',
  };
  private readonly down = (e: KeyboardEvent) => this.set(e, true);
  private readonly up = (e: KeyboardEvent) => this.set(e, false);
  private readonly blur = () => {
    for (const k of Object.keys(this.state) as (keyof DriveInput)[]) this.state[k] = false;
  };

  constructor(private readonly onCommand: (cmd: 'reset' | 'exit') => void) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
  }

  private set(e: KeyboardEvent, pressed: boolean): void {
    const key = this.map[e.code];
    if (key) {
      this.state[key] = pressed;
      e.preventDefault();
      return;
    }
    if (pressed && !e.repeat && e.code === 'KeyR') this.onCommand('reset');
    if (pressed && e.code === 'Escape') this.onCommand('exit');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
  }
}
