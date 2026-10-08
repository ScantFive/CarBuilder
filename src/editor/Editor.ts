import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEmptyCar, createTemplateCar, CarParseError, type CarDesign } from '../model/car';
import { computeMassProperties } from '../model/physicsProps';
import { validateCar } from '../model/validate';
import { CarStorage, exportCar, importCarFile } from '../storage/carStorage';
import { buildCarMeshes, COLORS, disposeGroup, type PartKind } from './carMeshes';
import { History } from './history';
import { createPanel, MODES, type Mode, type PanelRefs } from './panel';
import { addBeam, addNode, BOUNDS, deleteBeam, deleteNode, moveNode, normalizePoint, removeWheel, setEngine, setWheel } from './symmetry';

interface Pick {
  kind: PartKind;
  id: string;
}

export class Editor {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly panel: PanelRefs;
  private readonly viewport: HTMLElement;
  private readonly history = new History();
  private readonly workPlane = new THREE.Group();
  private readonly ghost: THREE.Mesh;
  private carGroup = new THREE.Group();
  private design: CarDesign;
  private mode: Mode = 'node';
  private mirror = true;
  private planeY = 0.3;
  private showBody = true;
  private beamStart: string | null = null;
  private selectedWheelNode: string | null = null;
  private drag: { id: string; base: CarDesign; vertical: boolean } | null = null;
  private active = false;
  private frame = 0;
  private toastTimer = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor(
    private readonly root: HTMLElement,
    private readonly storage: CarStorage,
    private readonly onTest: (c: CarDesign) => void,
    private readonly onOpenBody: () => void,
  ) {
    root.classList.add('editor');
    this.viewport = document.createElement('div');
    this.viewport.className = 'viewport';
    root.appendChild(this.viewport);
    this.panel = createPanel(root);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.viewport.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x2a2e36);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 8, 3);
    this.scene.add(sun);
    this.scene.add(this.buildFloor());
    this.scene.add(this.workPlane);
    this.buildWorkPlane();

    this.ghost = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 8),
      new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0.6 }),
    );
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.scene.add(this.carGroup);

    this.camera.position.set(5.5, 4, 6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.3, 0);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.enableDamping = true;
    this.controls.maxDistance = 30;
    this.controls.update();

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerup', () => this.onPointerUp());
    el.addEventListener('pointerleave', () => (this.ghost.visible = false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);

    this.design = storage.loadCurrent() ?? createTemplateCar();
    this.history.push(this.design);
    this.wirePanel();
    this.setMode('node');
    this.refresh();
  }

  getDesign(): CarDesign {
    return this.design;
  }

  setDesign(c: CarDesign): void {
    this.selectedWheelNode = null;
    this.beamStart = null;
    this.commit(c);
  }

  /** Shows the editor and runs its render loop, or hides and pauses it. */
  setActive(active: boolean): void {
    this.active = active;
    this.root.hidden = !active;
    if (active) {
      window.addEventListener('keydown', this.onKey);
      this.resize();
      const loop = () => {
        if (!this.active) return;
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.frame = requestAnimationFrame(loop);
      };
      loop();
    } else {
      window.removeEventListener('keydown', this.onKey);
      cancelAnimationFrame(this.frame);
    }
  }

  dispose(): void {
    this.setActive(false);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.root.replaceChildren();
  }

  // ---------- scene ----------

  private buildFloor(): THREE.Object3D {
    const g = new THREE.Group();
    const grid = new THREE.GridHelper(20, 20, 0x4a5060, 0x3a3f4b);
    g.add(grid);
    // Forward arrow and label (+Z is the front of the car).
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.01, BOUNDS.z + 0.2), 0.8, 0x46e08a, 0.3, 0.2);
    g.add(arrow);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#46e08a';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ПЕРЕД', 128, 46);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
    sprite.scale.set(1.2, 0.3, 1);
    sprite.position.set(0, 0.3, BOUNDS.z + 1.3);
    g.add(sprite);
    return g;
  }

  private buildWorkPlane(): void {
    const pts: number[] = [];
    const major: number[] = [];
    const step = 0.1;
    for (let x = -BOUNDS.x; x <= BOUNDS.x + 1e-6; x += step) {
      const isMajor = Math.abs(Math.round(x * 10) % 5) === 0;
      (isMajor ? major : pts).push(x, 0, -BOUNDS.z, x, 0, BOUNDS.z);
    }
    for (let z = -BOUNDS.z; z <= BOUNDS.z + 1e-6; z += step) {
      const isMajor = Math.abs(Math.round(z * 10) % 5) === 0;
      (isMajor ? major : pts).push(-BOUNDS.x, 0, z, BOUNDS.x, 0, z);
    }
    const lines = (arr: number[], color: number, opacity: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    };
    this.workPlane.add(lines(pts, 0x6a8cff, 0.18), lines(major, 0x6a8cff, 0.45));
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(BOUNDS.x * 2, BOUNDS.z * 2),
      new THREE.MeshBasicMaterial({ color: 0x6a8cff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }),
    );
    fill.rotation.x = -Math.PI / 2;
    this.workPlane.add(fill);
  }

  private resize(): void {
    const w = this.viewport.clientWidth || 1;
    const h = this.viewport.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private rebuildMeshes(): void {
    this.scene.remove(this.carGroup);
    disposeGroup(this.carGroup);
    this.carGroup = buildCarMeshes(this.design, { showCom: true, body: this.showBody ? 'ghost' : 'mounts' });
    const highlighted = new Set([this.beamStart, this.selectedWheelNode].filter((x): x is string => !!x));
    this.carGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.userData.kind === 'node' || o.userData.kind === 'mount') && highlighted.has(o.userData.id)) {
        (o.material as THREE.MeshStandardMaterial).color.set(COLORS.highlight);
        o.scale.setScalar(1.6);
      }
    });
    this.scene.add(this.carGroup);
    // Picking may happen before the next render; world matrices must be current.
    this.carGroup.updateMatrixWorld(true);
  }

  // ---------- state ----------

  private commit(c: CarDesign): void {
    if (c === this.design) return;
    this.design = c;
    this.history.push(c);
    this.storage.saveCurrent(c);
    this.refresh();
  }

  private refresh(): void {
    if (this.selectedWheelNode && !this.design.wheels.some((w) => w.node === this.selectedWheelNode)) this.selectedWheelNode = null;
    if (this.beamStart && !this.design.nodes.some((n) => n.id === this.beamStart) && !this.design.body?.mounts.some((m) => m.id === this.beamStart)) {
      this.beamStart = null;
    }
    this.rebuildMeshes();
    this.updatePanel();
  }

  private undo(): void {
    const c = this.history.undo();
    if (c) this.applyHistory(c);
  }

  private redo(): void {
    const c = this.history.redo();
    if (c) this.applyHistory(c);
  }

  private applyHistory(c: CarDesign): void {
    this.design = c;
    this.storage.saveCurrent(c);
    this.refresh();
  }

  // ---------- panel ----------

  private wirePanel(): void {
    const p = this.panel;
    p.modeButtons.forEach((b, mode) => b.addEventListener('click', () => this.setMode(mode)));
    p.planeHeight.value = String(this.planeY);
    p.planeHeight.addEventListener('input', () => this.setPlaneY(Number(p.planeHeight.value)));
    p.mirror.checked = this.mirror;
    p.mirror.addEventListener('change', () => (this.mirror = p.mirror.checked));
    p.showBody.addEventListener('change', () => {
      this.showBody = p.showBody.checked;
      this.rebuildMeshes();
    });
    p.btnBody.addEventListener('click', () => this.onOpenBody());
    p.name.addEventListener('change', () => this.commit({ ...this.design, name: p.name.value.trim() || 'Без имени' }));
    p.btnUndo.addEventListener('click', () => this.undo());
    p.btnRedo.addEventListener('click', () => this.redo());

    const wheelChange = () => {
      if (!this.selectedWheelNode) return;
      this.commit(
        setWheel(
          this.design,
          this.selectedWheelNode,
          { radius: Number(p.wheelRadius.value), steering: p.wheelSteering.checked, driven: p.wheelDriven.checked },
          this.mirror,
        ),
      );
    };
    p.wheelRadius.addEventListener('change', wheelChange);
    p.wheelRadius.addEventListener('input', () => (p.wheelRadiusValue.textContent = Number(p.wheelRadius.value).toFixed(2)));
    p.wheelSteering.addEventListener('change', wheelChange);
    p.wheelDriven.addEventListener('change', wheelChange);
    p.wheelRemove.addEventListener('click', () => {
      if (this.selectedWheelNode) this.commit(removeWheel(this.design, this.selectedWheelNode, this.mirror));
    });

    p.btnTest.addEventListener('click', () => this.tryTest());
    p.btnNew.addEventListener('click', () => this.setDesign(createEmptyCar('Новая машина')));
    p.btnTemplate.addEventListener('click', () => this.setDesign(createTemplateCar()));
    p.btnSave.addEventListener('click', () => {
      this.storage.save(this.design);
      this.updateSavedList();
      p.savedList.value = this.design.name;
      this.toast(`Сохранено: «${this.design.name}»`);
    });
    p.btnLoad.addEventListener('click', () => {
      const c = this.storage.load(p.savedList.value);
      if (c) this.setDesign(c);
      else this.toast('Нечего открыть');
    });
    p.btnDelete.addEventListener('click', () => {
      const name = p.savedList.value;
      if (!name || !confirm(`Удалить сохранённую машину «${name}»?`)) return;
      this.storage.remove(name);
      this.updateSavedList();
    });
    p.btnExport.addEventListener('click', () => exportCar(this.design));
    p.btnImport.addEventListener('click', () => p.importInput.click());
    p.importInput.addEventListener('change', async () => {
      const f = p.importInput.files?.[0];
      p.importInput.value = '';
      if (!f) return;
      try {
        this.setDesign(await importCarFile(f));
        this.toast(`Загружено: «${this.design.name}»`);
      } catch (err) {
        this.toast(err instanceof CarParseError ? err.message : 'Не удалось прочитать файл', true);
      }
    });
    this.updateSavedList();
  }

  private updateSavedList(): void {
    const sel = this.panel.savedList;
    const names = this.storage.list();
    sel.replaceChildren(
      ...(names.length ? names : ['— нет сохранённых —']).map((n) => {
        const o = document.createElement('option');
        o.value = names.length ? n : '';
        o.textContent = n;
        return o;
      }),
    );
  }

  private updatePanel(): void {
    const p = this.panel;
    const c = this.design;
    if (document.activeElement !== p.name) p.name.value = c.name;
    p.planeHeightValue.textContent = this.planeY.toFixed(1);
    const errors = validateCar(c);
    p.errors.replaceChildren(
      ...errors.map((e) => {
        const li = document.createElement('li');
        li.textContent = e;
        return li;
      }),
    );
    p.errors.classList.toggle('ok', errors.length === 0);
    p.btnTest.disabled = false;
    const { mass, com } = computeMassProperties(c);
    p.stats.textContent = `Масса ${Math.round(mass)} кг · колёс ${c.wheels.length} · балок ${c.beams.length} · ЦМ z=${com.z.toFixed(2)} м`;

    const wheel = this.selectedWheelNode ? c.wheels.find((w) => w.node === this.selectedWheelNode) : undefined;
    p.wheelBox.hidden = !wheel;
    if (wheel) {
      p.wheelRadius.value = String(wheel.radius);
      p.wheelRadiusValue.textContent = wheel.radius.toFixed(2);
      p.wheelSteering.checked = wheel.steering;
      p.wheelDriven.checked = wheel.driven;
    }
  }

  private tryTest(): void {
    const errors = validateCar(this.design);
    if (errors.length > 0) {
      this.panel.errors.classList.remove('flash');
      void this.panel.errors.offsetWidth;
      this.panel.errors.classList.add('flash');
      this.toast('Машина не готова к тесту — см. список ошибок', true);
      return;
    }
    this.onTest(this.design);
  }

  private toast(text: string, error = false): void {
    const t = this.panel.toast;
    t.textContent = text;
    t.classList.toggle('error', error);
    t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.hidden = true), 3000);
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.beamStart = null;
    this.ghost.visible = false;
    this.panel.modeButtons.forEach((b, m) => b.classList.toggle('active', m === mode));
    this.panel.hint.textContent = MODES.find((m) => m.mode === mode)!.hint;
    this.rebuildMeshes();
  }

  private setPlaneY(y: number): void {
    this.planeY = Math.min(BOUNDS.yMax, Math.max(0, Math.round(y * 10) / 10));
    this.workPlane.position.y = this.planeY;
    this.panel.planeHeight.value = String(this.planeY);
    this.panel.planeHeightValue.textContent = this.planeY.toFixed(1);
  }

  private handleKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if ((t instanceof HTMLInputElement && t.type === 'text') || t instanceof HTMLSelectElement) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'я')) {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (key === 'y' || key === 'н')) {
      e.preventDefault();
      this.redo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const idx = Number(e.key) - 1;
    if (idx >= 0 && idx < MODES.length) this.setMode(MODES[idx].mode);
    else if (key === 'q' || key === 'й') this.setPlaneY(this.planeY - 0.1);
    else if (key === 'e' || key === 'у') this.setPlaneY(this.planeY + 0.1);
    else if (e.key === 'Escape') {
      this.beamStart = null;
      this.selectedWheelNode = null;
      this.refresh();
    }
  }

  // ---------- pointer ----------

  private setRay(e: PointerEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private pick(kinds: PartKind[]): Pick | null {
    for (const hit of this.raycaster.intersectObject(this.carGroup, true)) {
      const { kind, id } = hit.object.userData as Partial<Pick>;
      if (kind && id && kinds.includes(kind)) return { kind, id };
    }
    return null;
  }

  private planePoint(y: number): THREE.Vector3 | null {
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out);
  }

  private wheelNodeOf(id: string): string | undefined {
    return this.design.wheels.find((w) => w.id === id)?.node;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.setRay(e);
    const c = this.design;
    switch (this.mode) {
      case 'node': {
        const p = this.planePoint(this.planeY);
        if (p) this.commit(addNode(c, p, this.mirror));
        break;
      }
      case 'beam': {
        const raw = this.pick(['node', 'mount', 'wheel', 'engine']);
        // Wheels and the engine hide their node: clicking them means their node.
        const hit = raw && raw.kind === 'wheel' ? { kind: 'node' as const, id: this.wheelNodeOf(raw.id) ?? '' } : raw;
        if (!hit || !hit.id) {
          this.beamStart = null;
        } else if (!this.beamStart) {
          this.beamStart = hit.id;
        } else if (hit.id !== this.beamStart) {
          const a = this.beamStart;
          this.beamStart = hit.id; // chain: continue from the last node
          this.commit(addBeam(c, a, hit.id, this.mirror));
          return;
        }
        this.rebuildMeshes();
        break;
      }
      case 'wheel': {
        const hit = this.pick(['node', 'wheel']);
        const node = hit ? (hit.kind === 'wheel' ? this.wheelNodeOf(hit.id) : hit.id) : undefined;
        if (!node) {
          this.selectedWheelNode = null;
          this.refresh();
          break;
        }
        if (c.engine?.node === node) {
          this.toast('На узле с двигателем не может быть колеса', true);
          break;
        }
        this.selectedWheelNode = node;
        if (c.wheels.some((w) => w.node === node)) this.refresh();
        else if (c.wheels.length >= 8) this.toast('Не больше 8 колёс', true);
        else this.commit(setWheel(c, node, {}, this.mirror));
        break;
      }
      case 'engine': {
        const hit = this.pick(['node', 'wheel']);
        const node = hit ? (hit.kind === 'wheel' ? this.wheelNodeOf(hit.id) : hit.id) : undefined;
        if (node) this.commit(setEngine(c, node));
        break;
      }
      case 'move': {
        const hit = this.pick(['node', 'wheel', 'engine']);
        const node = hit ? (hit.kind === 'wheel' ? this.wheelNodeOf(hit.id) : hit.id) : undefined;
        if (node) {
          this.drag = { id: node, base: c, vertical: e.shiftKey };
          this.controls.enabled = false;
          this.renderer.domElement.setPointerCapture(e.pointerId);
        }
        break;
      }
      case 'delete': {
        const hit = this.pick(['wheel', 'engine', 'node', 'mount', 'beam']);
        if (!hit) break;
        if (hit.kind === 'mount') {
          this.toast('Точки крепления удаляются в окне «Кузов»');
          break;
        }
        if (hit.kind === 'node') this.commit(deleteNode(c, hit.id, this.mirror));
        else if (hit.kind === 'beam') this.commit(deleteBeam(c, hit.id, this.mirror));
        else if (hit.kind === 'wheel') {
          const node = this.wheelNodeOf(hit.id);
          if (node) this.commit(removeWheel(c, node, this.mirror));
        } else this.commit({ ...structuredClone(c), engine: null });
        break;
      }
    }
  }

  private onPointerMove(e: PointerEvent): void {
    this.setRay(e);
    if (this.drag) {
      const base = this.drag.base;
      const n = base.nodes.find((q) => q.id === this.drag!.id);
      if (!n) return;
      let target: THREE.Vector3 | null;
      if (this.drag.vertical || e.shiftKey) {
        const normal = new THREE.Vector3();
        this.camera.getWorldDirection(normal);
        normal.y = 0;
        normal.normalize();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(n.x, n.y, n.z));
        const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
        target = hit ? new THREE.Vector3(n.x, hit.y, n.z) : null;
      } else {
        target = this.planePoint(n.y);
      }
      if (target) {
        this.design = moveNode(base, this.drag.id, target, this.mirror);
        this.rebuildMeshes();
        this.updatePanel();
      }
      return;
    }
    if (this.mode === 'node') {
      const p = this.planePoint(this.planeY);
      this.ghost.visible = !!p;
      if (p) {
        const q = normalizePoint(p);
        this.ghost.position.set(q.x, q.y, q.z);
      }
    }
  }

  private onPointerUp(): void {
    if (!this.drag) return;
    const { base } = this.drag;
    this.drag = null;
    this.controls.enabled = true;
    const moved = this.design;
    if (JSON.stringify(moved) !== JSON.stringify(base)) {
      this.design = base;
      this.commit(moved);
    }
  }
}
