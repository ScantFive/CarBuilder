# CarBuilder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Браузерный 3D-конструктор гоночной машины (узлы, балки, колёса, двигатель) с тест-заездом по трассе Yas Marina на WASD.

**Architecture:** Pure-модель машины и логика трассы/кругов (без Three.js/Rapier, покрыты Vitest) + два экрана: 3D-редактор (Three.js) и заезд (Three.js + Rapier raycast vehicle). Трасса один раз конвертируется из SVG в JSON Node-скриптом.

**Tech Stack:** TypeScript (strict), Vite, Three.js, @dimforge/rapier3d-compat, Vitest, Playwright, tsx.

**Spec:** `docs/superpowers/specs/2026-10-08-carbuilder-design.md`

## Global Constraints

- Единицы — метры, килограммы, секунды. +Y вверх, +Z вперёд по машине, +X вправо.
- Весь видимый пользователю текст — на русском.
- Pure-модули (`src/model/*`, `src/track/laps.ts`, `src/track/trackGeometry.ts` расчётная часть, `tools/svg/*`) не импортируют `three` и `@dimforge/*`.
- Масса: балка 8 кг/м, двигатель 150 кг, колесо 10 кг. Радиус колеса 0.2..0.6 м.
- Границы узлов: |x| ≤ 1.5, 0 ≤ y ≤ 1.5, |z| ≤ 3; привязка к сетке 0.1 м.
- Колёс 3..8, двигатель ровно 1.
- Трасса: длина круга 5281 м, ширина 14 м, стены 1 м, 20 чекпоинтов.
- Двигатель 9000 Н на 0 км/ч → 0 Н на 300 км/ч; задний ход 30 %; руль 30° → 10° на 200 км/ч.
- Фиксированный шаг физики 1/60 с.
- Ключи localStorage: `carbuilder.cars`, `carbuilder.current`, `carbuilder.best.<имя>`.
- Зависимости фиксировать точными версиями в package.json.

## Review Focus

1. Повреждённый JSON при импорте/в localStorage или недоступный localStorage → понятное сообщение, приложение не падает, текущая машина не меняется (тесты в Task 5).
2. Удаление узла с двигателем/колесом → двигатель `null`, колесо и балки удалены, валидация показывает ошибку (тест в Task 4).
3. Узел с |x| < 0.05 при включённой симметрии → не создаётся зеркальный дубликат; зеркальная балка не дублирует существующую (тест в Task 4).
4. Шпилька (поворот 7, радиус < width/2) → кромки без петель/выбросов, стены не перекрывают проезжую часть (тест в Task 7 на синтетической шпильке).
5. Колесо на узле y=0 с r=0.6 → машина спавнится колёсами на асфальте, не в полу (тест `spawnHeight` в Task 3).

---

### Task 1: Каркас проекта

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `src/main.ts`, `src/style.css`, `.gitignore`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: скрипты npm `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`), `e2e` (`playwright test`), `track` (`tsx tools/svg-to-track.ts`). `index.html` содержит `<div id="app">`.

- [ ] **Step 1:** `npm init`, установить `three @types/three @dimforge/rapier3d-compat`, dev: `typescript vite vitest tsx @playwright/test` с точными версиями (`--save-exact`).
- [ ] **Step 2:** `tests/smoke.test.ts`: `expect(1 + 1).toBe(2)`; `playwright.config.ts` — `webServer: npm run dev`, порт 5173, `launchOptions.executablePath` из env `CHROMIUM_PATH` либо `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` если файл существует.
- [ ] **Step 3:** Run `npm test && npm run build` → PASS, `dist/` создан.
- [ ] **Step 4:** Commit `chore: scaffold Vite + TS project`.

### Task 2: Модель машины и шаблон

**Files:**
- Create: `src/model/car.ts`, `tests/model/car.test.ts`

**Interfaces:**
- Produces:
  - Типы `CarNode {id,x,y,z}`, `Beam {id,a,b}`, `Wheel {id,node,radius,steering,driven}`, `CarDesign` (как в спеке, `version: 1`).
  - `newId(prefix: string): string`
  - `createTemplateCar(): CarDesign` — рама 1.8×4 м: узлы (±0.9, 0.3, ±2) и (±0.9, 0.3, 0) , балки по периметру + поперечины + диагонали, колёса r=0.35 на 4 угловых узлах (передние z=+2 рулевые, задние ведущие), двигатель на узле (0, 0.3, -1.6) (центральный, соединён балками с задними угловыми).
  - `createEmptyCar(name: string): CarDesign`
  - `serializeCar(c): string`, `parseCar(json: string): CarDesign` — бросает `CarParseError` (message на русском) при неверной структуре/версии/ссылках на несуществующие узлы.

- [ ] **Step 1: Тесты:** `template has 4 wheels, engine, 2 steering, 2 driven`; `parseCar(serializeCar(t))` deepEqual `t`; `parseCar('{')` throws CarParseError; `parseCar` с `version: 2` throws; балка со ссылкой на неизвестный узел → throws; колесо radius 0.9 → throws.
- [ ] **Step 2:** Run `npx vitest run tests/model/car.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(model): car design types, template, serialization`.

### Task 3: Физические свойства

**Files:**
- Create: `src/model/physicsProps.ts`, `tests/model/physicsProps.test.ts`

**Interfaces:**
- Consumes: `CarDesign` (Task 2).
- Produces:
  - `type Vec3 = {x:number;y:number;z:number}`
  - `MASS = { beamPerMeter: 8, engine: 150, wheel: 10 }`
  - `computeMassProperties(c): { mass: number; com: Vec3; inertia: Vec3 }` — inertia — диагональ тензора относительно ЦМ по точечным массам (балка = 3 точки: концы по ¼ массы, середина ½).
  - `defaultWheelRoles(c, nodeId): { steering: boolean; driven: boolean }` — по правилам спеки (порог двигателя ±0.3 м от ЦМ по z).
  - `steerSign(c, wheel): 1 | -1` — −1 если узел колеса позади ЦМ.
  - `spawnHeight(c, suspensionRest: number): number` — высота, на которую поднять начало координат машины, чтобы низ всех колёс был на y=0: `max(radius + suspensionRest - node.y)` по колёсам.

- [ ] **Step 1: Тесты:** одна балка 0..(0,0,2) без всего → mass 16, com z=1; шаблон: com.z < 0 (двигатель сзади); двигатель на z=+1.6 → defaultWheelRoles передних = {steering:true, driven:true}; двигатель на z=com.z → driven true для всех; `steerSign` заднего колеса = −1; `spawnHeight` для колеса на y=0, r=0.6, rest=0.3 → 0.9.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(model): mass properties and wheel roles`.

### Task 4: Валидация, операции редактирования с симметрией, история

**Files:**
- Create: `src/model/validate.ts`, `src/editor/symmetry.ts`, `src/editor/history.ts`
- Test: `tests/model/validate.test.ts`, `tests/editor/symmetry.test.ts`, `tests/editor/history.test.ts`

**Interfaces:**
- Consumes: Task 2, 3.
- Produces:
  - `validateCar(c): string[]` — сообщения:
    `"Нужно от 3 до 8 колёс"`, `"Нет двигателя"`, `"Нет ведущих колёс"`, `"Нет рулевых колёс"`, `"Нет балок"`, `"Каркас не связный: колёса и двигатель должны быть соединены балками"`, `"Колёса стоят на одной линии — машина опрокинется"` (коллинеарность в XZ, допуск площади 0.01 м²).
  - Все операции pure, возвращают новый `CarDesign`, параметр `mirror: boolean`:
    `addNode(c, p: Vec3, mirror)`, `addBeam(c, a, b, mirror)`, `setWheel(c, nodeId, props: Partial<Omit<Wheel,'id'|'node'>>, mirror)`, `setEngine(c, nodeId)`, `moveNode(c, id, p, mirror)`, `deleteNode(c, id, mirror)`, `deleteBeam(c, id, mirror)`, `mirrorOf(c, nodeId): string | null` (узел с x≈−x, теми же y,z, допуск 0.01). Позиции клампятся в границы и привязываются к 0.1. Центральный порог |x| < 0.05. Новое колесо без props получает `defaultWheelRoles` и r=0.35.
  - `class History { constructor(limit = 100); push(c); undo(): CarDesign|null; redo(): CarDesign|null; }`

- [ ] **Step 1: Тесты валидации:** шаблон → `[]`; без двигателя → содержит "Нет двигателя"; 2 колеса → "Нужно от 3 до 8 колёс"; 3 колеса на z-оси → "на одной линии"; отдельно висящий узел с колесом → "не связный"; **deleteNode узла двигателя шаблона → engine null и validate содержит "Нет двигателя"** (Review Focus 2).
- [ ] **Step 2: Тесты симметрии:** addNode (0.5,0.3,1) mirror → 2 узла, второй x=−0.5; **addNode (0.03,…) mirror → 1 узел, x=0** (Review Focus 3); addBeam между двумя правыми → 2 балки, повторный вызов → всё ещё 2; setWheel на правом → колесо и на левом с теми же props; deleteNode правого с mirror → левый тоже удалён вместе с балками; addNode (5, 9, 0) → клампится к (1.5, 1.5, 0).
- [ ] **Step 3: Тесты истории:** push A, push B, undo → A, redo → B; 101 push → undo доступно 100 раз.
- [ ] **Step 4:** Run → FAIL. **Step 5:** Implement. **Step 6:** Run → PASS.
- [ ] **Step 7:** Commit `feat(model): validation, mirrored edit ops, undo history`.

### Task 5: Хранилище машин

**Files:**
- Create: `src/storage/carStorage.ts`, `tests/storage/carStorage.test.ts`

**Interfaces:**
- Consumes: `serializeCar`, `parseCar` (Task 2).
- Produces: `class CarStorage { constructor(store: Storage | null) ; list(): string[]; save(c): void; load(name): CarDesign | null; remove(name): void; saveCurrent(c): void; loadCurrent(): CarDesign | null; getBest(name): number | null; setBest(name, ms): void }` — все обращения к `store` в try/catch, повреждённые записи пропускаются. `exportCar(c): void` (Blob-скачивание `<имя>.car.json`), `importCarFile(f: File): Promise<CarDesign>` (reject с `CarParseError`).

- [ ] **Step 1: Тесты** (in-memory Storage-стаб): save/list/load roundtrip; **`carbuilder.cars` = "мусор" → list() === [] без исключения**; **store, чей getItem/setItem бросают → методы не бросают, load → null** (Review Focus 1); setBest/getBest.
- [ ] **Step 2:** FAIL → **Step 3:** Implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(storage): car save/load with localStorage`.

### Task 6: Конвертер SVG → JSON трассы

**Files:**
- Create: `tools/svg/pathParser.ts`, `tools/svg/centerline.ts`, `tools/svg-to-track.ts`, `tracks/yas-marina.json`
- Test: `tests/tools/pathParser.test.ts`, `tests/tools/centerline.test.ts`

**Interfaces:**
- Produces:
  - `type P2 = [number, number]`
  - `parsePathD(d: string, curveSegments = 8): P2[][]` — подпути; команды M m L l H h V v C c S s Q q Z z, неявные повторы координат.
  - `polylineLength(p: P2[], closed: boolean): number`, `resample(p, step, closed): P2[]`
  - `centerlineFromRing(outer: P2[], inner: P2[]): P2[]` — середины между точками внешней кромки (ресэмпл ~0.5 ед.) и ближайшими точками внутренней, затем сглаживание скользящим средним (окно 5).
  - `TrackData` (определяется в `src/track/trackData.ts`, см. Task 7, конвертер импортирует тип оттуда).
  - CLI: `npm run track -- tracks/source/yas-marina.svg tracks/yas-marina.json [--road-class fil2]`.
  - Алгоритм CLI: путь дороги = `class` из аргумента либо путь с самым длинным `d` среди `fil2`/чёрных; два крупнейших подпути по площади = outer/inner (если один — выйти с ошибкой «контур дороги должен состоять из двух кромок»). Старт = центр клетчатых `rect` (transform matrix → центр); стрелка = центроид `polygon` класса `fil6` минус старт → направление; если направление против порядка точек — развернуть. Сдвинуть массив так, чтобы точка, ближайшая к старту, была индексом 0. Масштаб: `5281 / length`; мир `x = sx*k`, `z = -sy*k`, затем центрировать по bbox. Ресэмпл с шагом 5 м. `width: 14`.
- [ ] **Step 1: Тесты:** `parsePathD("M0 0l10 0 0 10z")` → `[[[0,0],[10,0],[10,10]]]`(Z не дублирует первую); C-кривая даёт 8 точек на сегмент, конечная точка точна; относительные команды после `z` отсчитываются от начала подпути; `centerlineFromRing` на концентрических окружностях r=10 и r=6 → все точки на расстоянии 8±0.2 от центра; `resample` квадрата 10×10 шагом 1 → 40 точек.
- [ ] **Step 2:** FAIL → **Step 3:** Implement → **Step 4:** PASS.
- [ ] **Step 5:** Run `npm run track -- tracks/source/yas-marina.svg tracks/yas-marina.json`. Expected: ~1056 точек, длина ≈5281. Проверка: отрисовать точки в PNG (скрипт в scratchpad, Chromium headless) и сравнить с исходной схемой визуально — форма совпадает, индекс 0 у клетчатой линии, направление вдоль стрелки (к повороту 1).
- [ ] **Step 6:** Commit `feat(tools): SVG to track JSON converter + Yas Marina track`.

### Task 7: Данные трассы, геометрия кромок, логика круга

**Files:**
- Create: `src/track/trackData.ts`, `src/track/trackGeometry.ts`, `src/track/laps.ts`
- Test: `tests/track/trackGeometry.test.ts`, `tests/track/laps.test.ts`, `tests/track/trackData.test.ts`

**Interfaces:**
- Produces:
  - `interface TrackData { name: string; width: number; closed: true; points: [number, number][]; startIndex: number }`; `parseTrack(json: unknown): TrackData` (бросает при < 10 точек / нет width).
  - `computeEdges(t): { left: P2[]; right: P2[]; tangents: P2[] }` — нормали усредняются по окну ±3 точки; для шпилек: точка кромки, которая оказалась ближе к осевой линии, чем `0.45*width` (до любой точки осевой), заменяется ближайшей допустимой соседней — без петель.
  - `nearestIndex(t, x, z, hint?: number): number` — при `hint` поиск в окне ±40 точек.
  - `class LapTimer { constructor(pointCount: number, checkpoints = 20); start(nowMs); update(index: number, nowMs): { lapCompleted: boolean; lapMs?: number }; current(nowMs): number; last: number | null; best: number | null; lastCheckpointIndex(): number }` — чекпоинт k на индексе `floor(k*N/20)`; засчитывается только по порядку; круг — когда пройден чекпоинт 19 и индекс вернулся в окно [0, N/20).
- [ ] **Step 1: Тесты:** окружность r=100, width 14 → все left на r≈107 или 93 (±0.5) — кромки с обеих сторон; **синтетическая шпилька (две параллельные прямые на расстоянии 6, соединённые полуокружностью r=3, width 14) → каждая точка кромок не ближе 6.3 к осевой линии и соседние точки кромки не дальше 3×шага друг от друга** (Review Focus 4); LapTimer: последовательно индексы 0..N-1, затем 0 → lapCompleted, lapMs = разница времени; прыжок с 0 на N-1 (задом через старт) → круг не засчитан; parseTrack(`{}`) бросает.
- [ ] **Step 2:** FAIL → **Step 3:** Implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(track): track data, edges, lap timer`.

### Task 8: 3D-редактор

**Files:**
- Create: `src/editor/Editor.ts`, `src/editor/carMeshes.ts`, `src/editor/panel.ts`
- Modify: `src/main.ts`, `src/style.css`, `index.html`

**Interfaces:**
- Consumes: Task 2–5.
- Produces:
  - `buildCarMeshes(c: CarDesign, opts?: { showCom?: boolean }): THREE.Group` — узлы-сферы (r 0.06), балки-цилиндры (r 0.04), колёса-цилиндры по оси X (обод синий если steering, оранжевый если driven, оба — синий шина + оранжевый диск), двигатель — красный куб 0.4, ЦМ — жёлтый маркер. `userData = { kind: 'node'|'beam'|'wheel'|'engine', id }` для рейкастинга. Используется и в заезде.
  - `class Editor { constructor(root: HTMLElement, storage: CarStorage, onTest: (c: CarDesign) => void); getDesign(): CarDesign; setDesign(c): void; dispose(): void }`
  - `type Mode = 'node'|'beam'|'wheel'|'engine'|'move'|'delete'`; клавиши 1–6, Q/E высота плоскости, Ctrl+Z/Ctrl+Shift+Z, OrbitControls на правую кнопку (`controls.mouseButtons = { LEFT: null, MIDDLE: PAN, RIGHT: ROTATE }`).
  - Панель (`data-testid` для e2e): `mode-<mode>`, `plane-height`, `mirror`, `car-name`, `errors`, `btn-test`, `btn-new`, `btn-template`, `btn-save`, `saved-list`, `btn-export`, `btn-import`, `wheel-radius`, `wheel-steering`, `wheel-driven`.
  - `src/main.ts`: `showEditor()`, `showTestDrive(c)` — переключение экранов; при старте `storage.loadCurrent() ?? createTemplateCar()`. Каждое изменение — `history.push`, `storage.saveCurrent`, перестроение мешей, обновление `errors`.
  - «Тест» при ошибках валидации подсвечивает список ошибок и не вызывает `onTest`.
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm run build` → PASS.
- [ ] **Step 3:** Ручная проверка через Playwright-скрипт в scratchpad: скриншот с шаблоном; клик в режиме «Узел» по плоскости добавляет 2 узла (симметрия); Ctrl+Z убирает их; удаление узла двигателя → в `errors` появляется «Нет двигателя». Скриншоты просмотреть.
- [ ] **Step 4:** Commit `feat(editor): 3D frame editor`.

### Task 9: Заезд

**Files:**
- Create: `src/sim/TestDrive.ts`, `src/sim/vehicle.ts`, `src/sim/trackScene.ts`, `src/sim/input.ts`, `src/sim/hud.ts`, `src/sim/driveModel.ts`, `tests/sim/driveModel.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: Task 2, 3, 5, 7, `buildCarMeshes` (Task 8), `tracks/yas-marina.json` (импорт через Vite JSON).
- Produces:
  - Pure `driveModel.ts`: `engineForce(speedKmh: number): number` (9000→0 линейно к 300); `steerLimitRad(speedKmh)` (30° до 0 км/ч, линейно до 10° на 200, далее 10°); `controlOutputs(input: {w,s,a,d,space:boolean}, speedKmh: number, steer: number, dt: number): { force: number; brake: number; steer: number }` — S при скорости > 1 → тормоз, иначе задний ход −0.3×; руль приближается к цели со скоростью 2.5 рад/с.
  - `buildTrackScene(world, scene, t: TrackData): void` — асфальт-лента, трава-плоскость, клетчатая полоса старта, стены (BoxGeometry + `ColliderDesc.cuboid` на сегмент, высота 1, толщина 0.5, длина сегмента +0.2), пол — cuboid.
  - `createVehicle(world, c, spawn: {x,z,heading}): Vehicle` где `Vehicle { body; controller; meshes: THREE.Group; wheelMeshes; update(out, dt); speedKmh(): number; reset(x,z,heading) }` — коллайдеры по спеке с density 0 + `setAdditionalMassProperties(mass, com, inertia, identity)`; колёса: `addWheel(chassisPoint, dir (0,-1,0), axle (-1,0,0), suspensionRest 0.3, radius)`, стартовые параметры `suspensionStiffness 30`, `compression 4.4`, `relaxation 2.3`, `frictionSlip 2.5`, `maxSuspensionTravel 0.3` (подстраиваются в Step 5); `force/drivenCount` на ведущие, `steer*steerSign` на рулевые; ручник — `brake` 200 на нерулевые (на все, если все рулевые). Высота спавна — `spawnHeight(c, 0.3) + 0.1`.
  - `class TestDrive { constructor(root, design, storage, onExit: () => void); dispose() }` — Rapier `init()` один раз, фиксированный шаг 1/60, камера-преследование (смещение (0, 3, −8) в системе машины, lerp 0.1), R → reset на `lastCheckpointIndex`, Esc/кнопка `btn-exit` → `onExit`, таймер стартует с первого W, лучший круг читается/пишется через `storage.getBest/setBest(design.name)`. HUD `data-testid`: `hud-speed`, `hud-lap`, `hud-last`, `hud-best`, `hud-hint` (показывается при скорости < 1 км/ч > 3 с или при `up.y < 0.3`).
  - При ошибке инициализации WebGL/Rapier — сообщение на экране и кнопка «В редактор».
- [ ] **Step 1: Тесты driveModel:** engineForce(0)=9000, (150)=4500, (400)=0; steerLimitRad(0)≈0.5236, (200)≈0.1745; S при скорости 50 → brake > 0, force 0; S при 0 → force = −0.3×engineForce(0).
- [ ] **Step 2:** FAIL → **Step 3:** Implement driveModel → PASS.
- [ ] **Step 4:** Implement остальные модули.
- [ ] **Step 5:** `npm run build` → PASS; Playwright-скрипт в scratchpad: «Тест», 3 с W, скриншоты, скорость в HUD > 20 км/ч; A удерживается — машина поворачивает; R возвращает на трассу. Подстроить параметры подвески/сцепления, если машина подпрыгивает, переворачивается при старте или не едет.
- [ ] **Step 6:** Commit `feat(sim): test drive with Rapier vehicle, track, HUD`.

### Task 10: E2E-смоук, README, финальная проверка

**Files:**
- Create: `e2e/smoke.spec.ts`
- Modify: `README.md`

- [ ] **Step 1:** `e2e/smoke.spec.ts`: открыть `/` → `errors` пуст → клик `btn-test` → `hud-speed` виден → `keyboard.down('w')` 2 с → число в `hud-speed` > 0 → `Escape` → `btn-test` виден.
- [ ] **Step 2:** Run `npm run e2e` → PASS.
- [ ] **Step 3:** README на русском: что это, запуск (`npm i`, `npm run dev`), управление редактором и заездом, формат трассы и как сконвертировать свою (`npm run track`).
- [ ] **Step 4:** Run `npm test && npm run build && npm run e2e` → всё PASS.
- [ ] **Step 5:** Commit `test: e2e smoke; docs: README` и push.
