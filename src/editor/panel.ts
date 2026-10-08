export type Mode = 'node' | 'beam' | 'wheel' | 'engine' | 'move' | 'delete';

export const MODES: { mode: Mode; label: string; hint: string }[] = [
  { mode: 'node', label: 'Узел', hint: 'Клик по рабочей плоскости — новый узел. Q/E — высота плоскости.' },
  { mode: 'beam', label: 'Балка', hint: 'Клик по двум узлам (или узлу и жёлтой точке крепления кузова) соединяет их балкой.' },
  { mode: 'wheel', label: 'Колесо', hint: 'Клик по узлу ставит или выбирает колесо.' },
  { mode: 'engine', label: 'Двигатель', hint: 'Клик по узлу переносит туда двигатель.' },
  { mode: 'move', label: 'Перемещение', hint: 'Тяните узел по плоскости; с Shift — по высоте.' },
  { mode: 'delete', label: 'Удаление', hint: 'Клик по узлу, балке, колесу или двигателю удаляет его.' },
];

export interface PanelRefs {
  root: HTMLElement;
  modeButtons: Map<Mode, HTMLButtonElement>;
  hint: HTMLElement;
  planeHeight: HTMLInputElement;
  planeHeightValue: HTMLElement;
  mirror: HTMLInputElement;
  showBody: HTMLInputElement;
  btnBody: HTMLButtonElement;
  name: HTMLInputElement;
  errors: HTMLUListElement;
  stats: HTMLElement;
  wheelBox: HTMLElement;
  wheelRadius: HTMLInputElement;
  wheelRadiusValue: HTMLElement;
  wheelSteering: HTMLInputElement;
  wheelDriven: HTMLInputElement;
  wheelRemove: HTMLButtonElement;
  btnTest: HTMLButtonElement;
  btnNew: HTMLButtonElement;
  btnTemplate: HTMLButtonElement;
  btnUndo: HTMLButtonElement;
  btnRedo: HTMLButtonElement;
  btnSave: HTMLButtonElement;
  savedList: HTMLSelectElement;
  btnLoad: HTMLButtonElement;
  btnDelete: HTMLButtonElement;
  btnExport: HTMLButtonElement;
  btnImport: HTMLButtonElement;
  importInput: HTMLInputElement;
  toast: HTMLElement;
}

const html = `
<div class="panel-section">
  <h1>CarBuilder</h1>
  <label class="row">Имя <input data-testid="car-name" class="grow" maxlength="40"></label>
</div>
<div class="panel-section">
  <h2>Инструмент</h2>
  <div class="modes"></div>
  <p class="hint" data-testid="mode-hint"></p>
  <label class="row">Плоскость <input data-testid="plane-height" type="range" min="0" max="1.5" step="0.1" class="grow"><span class="val" data-ref="phv"></span> м</label>
  <label class="row"><input data-testid="mirror" type="checkbox"> Симметрия слева/справа</label>
  <label class="row"><input data-testid="show-body" type="checkbox" checked> Показать кузов</label>
  <div class="row"><button data-testid="btn-undo" title="Ctrl+Z">↶ Отменить</button><button data-testid="btn-redo" title="Ctrl+Shift+Z">↷ Повторить</button></div>
</div>
<div class="panel-section" data-ref="wheelBox" hidden>
  <h2>Колесо</h2>
  <label class="row">Радиус <input data-testid="wheel-radius" type="range" min="0.2" max="0.6" step="0.05" class="grow"><span class="val" data-ref="wrv"></span> м</label>
  <label class="row"><input data-testid="wheel-steering" type="checkbox"> <span class="dot steer"></span> Рулевое</label>
  <label class="row"><input data-testid="wheel-driven" type="checkbox"> <span class="dot drive"></span> Ведущее</label>
  <button data-testid="wheel-remove">Снять колесо</button>
</div>
<div class="panel-section">
  <h2>Машина</h2>
  <div class="stats" data-testid="stats"></div>
  <ul class="errors" data-testid="errors"></ul>
  <button data-testid="btn-body" class="wide">🚗 Кузов…</button>
  <button class="primary" data-testid="btn-test">▶ Тест</button>
</div>
<div class="panel-section">
  <h2>Файлы</h2>
  <div class="row"><button data-testid="btn-new">Новая</button><button data-testid="btn-template">Шаблон</button><button data-testid="btn-save">Сохранить</button></div>
  <div class="row"><select data-testid="saved-list" class="grow"></select><button data-testid="btn-load">Открыть</button><button data-testid="btn-delete" title="Удалить сохранённую">✕</button></div>
  <div class="row"><button data-testid="btn-export">Экспорт</button><button data-testid="btn-import">Импорт</button><input type="file" accept=".json,application/json" hidden data-ref="importInput"></div>
</div>
<div class="panel-section keys">
  1–6 инструменты · Q/E высота · ПКМ вращать · колесо зум · СКМ сдвиг
</div>
<div class="toast" data-testid="toast" hidden></div>
`;

export function createPanel(container: HTMLElement): PanelRefs {
  const root = document.createElement('aside');
  root.className = 'panel';
  root.innerHTML = html;
  container.appendChild(root);
  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const t = <T extends HTMLElement>(id: string) => q<T>(`[data-testid="${id}"]`);
  const r = <T extends HTMLElement>(id: string) => q<T>(`[data-ref="${id}"]`);

  const modeButtons = new Map<Mode, HTMLButtonElement>();
  const modesBox = q<HTMLElement>('.modes');
  MODES.forEach((m, i) => {
    const b = document.createElement('button');
    b.dataset.testid = `mode-${m.mode}`;
    b.textContent = `${i + 1} ${m.label}`;
    modesBox.appendChild(b);
    modeButtons.set(m.mode, b);
  });

  return {
    root,
    modeButtons,
    hint: t('mode-hint'),
    planeHeight: t('plane-height'),
    planeHeightValue: r('phv'),
    mirror: t('mirror'),
    showBody: t('show-body'),
    btnBody: t('btn-body'),
    name: t('car-name'),
    errors: t('errors'),
    stats: t('stats'),
    wheelBox: r('wheelBox'),
    wheelRadius: t('wheel-radius'),
    wheelRadiusValue: r('wrv'),
    wheelSteering: t('wheel-steering'),
    wheelDriven: t('wheel-driven'),
    wheelRemove: t('wheel-remove'),
    btnTest: t('btn-test'),
    btnNew: t('btn-new'),
    btnTemplate: t('btn-template'),
    btnUndo: t('btn-undo'),
    btnRedo: t('btn-redo'),
    btnSave: t('btn-save'),
    savedList: t('saved-list'),
    btnLoad: t('btn-load'),
    btnDelete: t('btn-delete'),
    btnExport: t('btn-export'),
    btnImport: t('btn-import'),
    importInput: r('importInput'),
    toast: t('toast'),
  };
}
