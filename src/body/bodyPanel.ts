import { BODY_SHAPES, SHAPE_LABELS, type BodyShape } from '../model/body';

export type BodyMode = 'select' | 'mount';
export type GizmoMode = 'translate' | 'rotate' | 'scale';

export const BODY_MODE_HINTS: Record<BodyMode, string> = {
  select: 'Клик по детали — выбрать. Гизмо: G перемещение, R поворот, S масштаб. Delete — удалить.',
  mount: 'Клик по поверхности детали ставит точку крепления, клик по жёлтой точке — удаляет её.',
};

export interface BodyPanelRefs {
  root: HTMLElement;
  addButtons: Map<BodyShape, HTMLButtonElement>;
  modeSelect: HTMLButtonElement;
  modeMount: HTMLButtonElement;
  hint: HTMLElement;
  mirror: HTMLInputElement;
  undo: HTMLButtonElement;
  redo: HTMLButtonElement;
  partBox: HTMLElement;
  fields: Record<'px' | 'py' | 'pz' | 'rx' | 'ry' | 'rz' | 'sx' | 'sy' | 'sz', HTMLInputElement>;
  color: HTMLInputElement;
  gizmo: Record<GizmoMode, HTMLButtonElement>;
  duplicate: HTMLButtonElement;
  remove: HTMLButtonElement;
  stats: HTMLElement;
  done: HTMLButtonElement;
  toast: HTMLElement;
}

const field = (id: string, step: string) => `<input data-testid="part-${id}" type="number" step="${step}">`;

const html = `
<div class="panel-section">
  <h1>Кузов</h1>
  <p class="hint">Соберите кузов из деталей и поставьте точки крепления. В редакторе каркаса соедините их балками с узлами.</p>
</div>
<div class="panel-section">
  <h2>Добавить деталь</h2>
  <div class="modes" data-ref="add"></div>
</div>
<div class="panel-section">
  <h2>Инструмент</h2>
  <div class="modes">
    <button data-testid="body-mode-select">1 Выбор</button>
    <button data-testid="body-mode-mount">2 Крепления</button>
  </div>
  <p class="hint" data-ref="hint"></p>
  <label class="row"><input data-testid="body-mirror" type="checkbox" checked> Симметрия слева/справа</label>
  <div class="row"><button data-testid="body-undo" title="Ctrl+Z">↶ Отменить</button><button data-testid="body-redo" title="Ctrl+Shift+Z">↷ Повторить</button></div>
</div>
<div class="panel-section" data-testid="body-part" hidden>
  <h2>Деталь</h2>
  <div class="modes three">
    <button data-testid="part-gizmo-move" title="G">Двигать</button>
    <button data-testid="part-gizmo-rotate" title="R">Вращать</button>
    <button data-testid="part-gizmo-scale" title="S">Размер</button>
  </div>
  <div class="grid3"><span>Позиция, м</span>${field('px', '0.05')}${field('py', '0.05')}${field('pz', '0.05')}</div>
  <div class="grid3"><span>Поворот, °</span>${field('rx', '5')}${field('ry', '5')}${field('rz', '5')}</div>
  <div class="grid3"><span>Размер, м</span>${field('sx', '0.05')}${field('sy', '0.05')}${field('sz', '0.05')}</div>
  <label class="row">Цвет <input data-testid="part-color" type="color"></label>
  <div class="row"><button data-testid="part-duplicate">Дублировать</button><button data-testid="part-delete">Удалить</button></div>
</div>
<div class="panel-section">
  <div class="stats" data-testid="body-stats"></div>
  <button class="primary" data-testid="body-done">✓ Готово</button>
</div>
<div class="toast" data-testid="body-toast" hidden></div>
`;

export function createBodyPanel(container: HTMLElement): BodyPanelRefs {
  const root = document.createElement('aside');
  root.className = 'panel';
  root.innerHTML = html;
  container.appendChild(root);
  const t = <T extends HTMLElement>(id: string) => root.querySelector(`[data-testid="${id}"]`) as T;
  const r = <T extends HTMLElement>(id: string) => root.querySelector(`[data-ref="${id}"]`) as T;

  const addButtons = new Map<BodyShape, HTMLButtonElement>();
  for (const shape of BODY_SHAPES) {
    const b = document.createElement('button');
    b.dataset.testid = `body-add-${shape}`;
    b.textContent = `+ ${SHAPE_LABELS[shape]}`;
    r('add').appendChild(b);
    addButtons.set(shape, b);
  }

  const f = (id: string) => t<HTMLInputElement>(`part-${id}`);
  return {
    root,
    addButtons,
    modeSelect: t('body-mode-select'),
    modeMount: t('body-mode-mount'),
    hint: r('hint'),
    mirror: t('body-mirror'),
    undo: t('body-undo'),
    redo: t('body-redo'),
    partBox: t('body-part'),
    fields: { px: f('px'), py: f('py'), pz: f('pz'), rx: f('rx'), ry: f('ry'), rz: f('rz'), sx: f('sx'), sy: f('sy'), sz: f('sz') },
    color: t('part-color'),
    gizmo: { translate: t('part-gizmo-move'), rotate: t('part-gizmo-rotate'), scale: t('part-gizmo-scale') },
    duplicate: t('part-duplicate'),
    remove: t('part-delete'),
    stats: t('body-stats'),
    done: t('body-done'),
    toast: t('body-toast'),
  };
}
