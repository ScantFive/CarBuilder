export function formatLap(ms: number | null): string {
  if (ms === null) return '—:——.———';
  const m = Math.floor(ms / 60000);
  const s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export class Hud {
  private readonly speed: HTMLElement;
  private readonly lap: HTMLElement;
  private readonly last: HTMLElement;
  private readonly best: HTMLElement;
  private readonly hint: HTMLElement;
  readonly exitButton: HTMLButtonElement;

  constructor(root: HTMLElement, carName: string) {
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `
      <div class="hud-top">
        <button data-testid="btn-exit">← В редактор (Esc)</button>
        <span class="hud-car"></span>
      </div>
      <div class="hud-times">
        <div><span>Круг</span><b data-testid="hud-lap"></b></div>
        <div><span>Последний</span><b data-testid="hud-last"></b></div>
        <div><span>Лучший</span><b data-testid="hud-best"></b></div>
      </div>
      <div class="hud-speed"><b data-testid="hud-speed">0</b><span>км/ч</span></div>
      <div class="hud-hint" data-testid="hud-hint" hidden>Застряли? Нажмите <b>R</b> — сброс на трассу</div>
      <div class="hud-keys">W газ · S тормоз/назад · A/D руль · Пробел ручник · R сброс</div>`;
    root.appendChild(el);
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    this.speed = q('hud-speed');
    this.lap = q('hud-lap');
    this.last = q('hud-last');
    this.best = q('hud-best');
    this.hint = q('hud-hint');
    this.exitButton = q('btn-exit') as HTMLButtonElement;
    (el.querySelector('.hud-car') as HTMLElement).textContent = carName;
  }

  update(v: { speedKmh: number; lapMs: number; lastMs: number | null; bestMs: number | null; started: boolean; showHint: boolean }): void {
    this.speed.textContent = String(Math.round(Math.abs(v.speedKmh)));
    this.lap.textContent = v.started ? formatLap(v.lapMs) : 'Жмите W';
    this.last.textContent = formatLap(v.lastMs);
    this.best.textContent = formatLap(v.bestMs);
    this.hint.hidden = !v.showHint;
  }
}
