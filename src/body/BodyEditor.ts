import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { CarDesign } from '../model/car';
import { partMass, type BodyPart } from '../model/body';
import type { CarStorage } from '../storage/carStorage';
import { buildCarMeshes, disposeGroup } from '../editor/carMeshes';
import { buildEditorFloor } from '../editor/floor';
import { History } from '../editor/history';
import { buildBodyMeshes } from './bodyMeshes';
import { addMount, addPart, deleteMount, deletePart, duplicatePart, updatePart } from './bodyOps';
import { BODY_MODE_HINTS, createBodyPanel, type BodyMode, type BodyPanelRefs, type GizmoMode } from './bodyPanel';

const DEG = Math.PI / 180;
const CLICK_SLOP_PX = 4;
const round = (v: number, step: number) => Number((Math.round(v / step) * step).toFixed(6)) + 0;

/** The body screen: build the car body from parts and place mount points, with the frame shown as a ghost. */
export class BodyEditor {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  private readonly orbit: OrbitControls;
  private readonly gizmo: TransformControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly viewport: HTMLElement;
  private readonly panel: BodyPanelRefs;
  private history = new History();
  private design: CarDesign | null = null;
  private frameGroup = new THREE.Group();
  private bodyGroup = new THREE.Group();
  private partObjects = new Map<string, THREE.Object3D>();
  private mode: BodyMode = 'select';
  private gizmoMode: GizmoMode = 'translate';
  private mirror = true;
  private selected: string | null = null;
  private dragBase: { car: CarDesign; part: BodyPart } | null = null;
  private down: { x: number; y: number } | null = null;
  private active = false;
  private frame = 0;
  private toastTimer = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor(
    private readonly root: HTMLElement,
    private readonly storage: CarStorage,
    private readonly onDone: (c: CarDesign) => void,
  ) {
    root.classList.add('editor');
    this.viewport = document.createElement('div');
    this.viewport.className = 'viewport';
    root.appendChild(this.viewport);
    this.panel = createBodyPanel(root);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.viewport.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x2a2e36);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 8, 3);
    this.scene.add(sun);
    this.scene.add(buildEditorFloor(), this.frameGroup, this.bodyGroup);

    this.camera.position.set(5.5, 4, 6);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, 0.5, 0);
    this.orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.orbit.enableDamping = true;
    this.orbit.update();

    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setTranslationSnap(0.05);
    this.gizmo.setRotationSnap(5 * DEG);
    this.gizmo.setSpace('local');
    this.gizmo.size = 0.8;
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (e) => this.onGizmoDragging(Boolean(e.value)));

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.down = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);
    this.wirePanel();
    this.setMode('select');
  }

  /** Starts editing the body of `c` with a fresh undo history. */
  open(c: CarDesign): void {
    this.design = c;
    this.history = new History();
    this.history.push(c);
    this.selected = null;
    this.rebuildFrame();
    this.refresh();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.root.hidden = !active;
    if (active) {
      window.addEventListener('keydown', this.onKey);
      this.resize();
      const loop = () => {
        if (!this.active) return;
        this.orbit.update();
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
    this.gizmo.dispose();
    this.orbit.dispose();
    this.renderer.dispose();
    this.root.replaceChildren();
  }

  // ---------- state ----------

  private commit(c: CarDesign): void {
    if (c === this.design) return;
    this.design = c;
    this.history.push(c);
    this.storage.saveCurrent(c);
    this.refresh();
  }

  private applyHistory(c: CarDesign | null): void {
    if (!c) return;
    this.design = c;
    this.storage.saveCurrent(c);
    this.refresh();
  }

  private part(id: string | null): BodyPart | undefined {
    return id ? this.design?.body?.parts.find((p) => p.id === id) : undefined;
  }

  private refresh(): void {
    if (this.selected && !this.part(this.selected)) this.selected = null;
    this.rebuildBody();
    this.updatePanel();
  }

  // ---------- scene ----------

  private resize(): void {
    const w = this.viewport.clientWidth || 1;
    const h = this.viewport.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private rebuildFrame(): void {
    this.scene.remove(this.frameGroup);
    disposeGroup(this.frameGroup);
    this.frameGroup = this.design ? buildCarMeshes(this.design, { body: 'hidden' }) : new THREE.Group();
    this.frameGroup.traverse((o) => {
      o.userData = {};
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        m.transparent = true;
        m.opacity = 0.25;
        m.depthWrite = false;
      }
    });
    this.scene.add(this.frameGroup);
  }

  private rebuildBody(): void {
    this.gizmo.detach();
    this.scene.remove(this.bodyGroup);
    disposeGroup(this.bodyGroup);
    this.partObjects.clear();
    const body = this.design?.body;
    this.bodyGroup = body ? buildBodyMeshes(body, { pickableParts: true, showMounts: true }) : new THREE.Group();
    this.bodyGroup.children.forEach((o) => {
      if (o.userData.kind === 'part') this.partObjects.set(o.userData.id, o);
    });
    this.scene.add(this.bodyGroup);
    this.bodyGroup.updateMatrixWorld(true);
    const sel = this.selected ? this.partObjects.get(this.selected) : undefined;
    if (sel && this.mode === 'select') {
      this.gizmo.attach(sel);
      this.gizmo.setMode(this.gizmoMode);
    }
  }

  // ---------- gizmo ----------

  private onGizmoDragging(dragging: boolean): void {
    this.orbit.enabled = !dragging;
    const obj = this.gizmo.object;
    const part = this.part(this.selected);
    if (dragging) {
      this.dragBase = this.design && part ? { car: this.design, part } : null;
      return;
    }
    const base = this.dragBase;
    this.dragBase = null;
    if (!base || !obj) return;
    const r = obj.rotation;
    const patch: Partial<BodyPart> = {
      position: { x: round(obj.position.x, 0.001), y: round(obj.position.y, 0.001), z: round(obj.position.z, 0.001) },
      rotation: { x: round(r.x / DEG, 0.1), y: round(r.y / DEG, 0.1), z: round(r.z / DEG, 0.1) },
      size: {
        x: round(base.part.size.x * Math.abs(obj.scale.x), 0.01),
        y: round(base.part.size.y * Math.abs(obj.scale.y), 0.01),
        z: round(base.part.size.z * Math.abs(obj.scale.z), 0.01),
      },
    };
    this.commit(updatePart(base.car, base.part.id, patch, this.mirror));
  }

  private setGizmoMode(m: GizmoMode): void {
    this.gizmoMode = m;
    this.gizmo.setMode(m);
    (Object.keys(this.panel.gizmo) as GizmoMode[]).forEach((k) => this.panel.gizmo[k].classList.toggle('active', k === m));
  }

  // ---------- panel ----------

  private wirePanel(): void {
    const p = this.panel;
    p.addButtons.forEach((b, shape) =>
      b.addEventListener('click', () => {
        if (!this.design) return;
        const r = addPart(this.design, shape, this.mirror);
        if (!r.id) return this.toast('Не больше 60 деталей', true);
        this.selected = r.id;
        this.setMode('select');
        this.commit(r.car);
      }),
    );
    p.modeSelect.addEventListener('click', () => this.setMode('select'));
    p.modeMount.addEventListener('click', () => this.setMode('mount'));
    p.mirror.addEventListener('change', () => (this.mirror = p.mirror.checked));
    p.undo.addEventListener('click', () => this.applyHistory(this.history.undo()));
    p.redo.addEventListener('click', () => this.applyHistory(this.history.redo()));
    (Object.keys(p.gizmo) as GizmoMode[]).forEach((k) => p.gizmo[k].addEventListener('click', () => this.setGizmoMode(k)));

    const fromFields = () => {
      const v = (k: keyof BodyPanelRefs['fields']) => Number(p.fields[k].value) || 0;
      return {
        position: { x: v('px'), y: v('py'), z: v('pz') },
        rotation: { x: v('rx'), y: v('ry'), z: v('rz') },
        size: { x: v('sx'), y: v('sy'), z: v('sz') },
      };
    };
    Object.values(p.fields).forEach((input) =>
      input.addEventListener('change', () => {
        if (this.design && this.selected) this.commit(updatePart(this.design, this.selected, fromFields(), this.mirror));
      }),
    );
    p.color.addEventListener('change', () => {
      if (this.design && this.selected) this.commit(updatePart(this.design, this.selected, { color: p.color.value }, this.mirror));
    });
    p.duplicate.addEventListener('click', () => this.duplicateSelected());
    p.remove.addEventListener('click', () => this.deleteSelected());
    p.done.addEventListener('click', () => this.finish());
  }

  private duplicateSelected(): void {
    if (!this.design || !this.selected) return;
    const r = duplicatePart(this.design, this.selected, this.mirror);
    if (!r.id) return this.toast('Не больше 60 деталей', true);
    this.selected = r.id;
    this.commit(r.car);
  }

  private deleteSelected(): void {
    if (!this.design || !this.selected) return;
    const id = this.selected;
    this.selected = null;
    this.commit(deletePart(this.design, id, this.mirror));
  }

  private finish(): void {
    if (this.design) this.onDone(this.design);
  }

  private updatePanel(): void {
    const p = this.panel;
    const body = this.design?.body;
    const parts = body?.parts ?? [];
    const mass = parts.reduce((s, q) => s + partMass(q), 0);
    p.stats.textContent = `Деталей ${parts.length} · креплений ${body?.mounts.length ?? 0} · масса кузова ${Math.round(mass)} кг`;
    const part = this.part(this.selected);
    p.partBox.hidden = !part;
    if (part) {
      const set = (k: keyof BodyPanelRefs['fields'], v: number) => {
        if (document.activeElement !== p.fields[k]) p.fields[k].value = String(Math.round(v * 1000) / 1000);
      };
      set('px', part.position.x);
      set('py', part.position.y);
      set('pz', part.position.z);
      set('rx', part.rotation.x);
      set('ry', part.rotation.y);
      set('rz', part.rotation.z);
      set('sx', part.size.x);
      set('sy', part.size.y);
      set('sz', part.size.z);
      p.color.value = part.color;
    }
    this.setGizmoMode(this.gizmoMode);
  }

  private setMode(mode: BodyMode): void {
    this.mode = mode;
    this.panel.modeSelect.classList.toggle('active', mode === 'select');
    this.panel.modeMount.classList.toggle('active', mode === 'mount');
    this.panel.hint.textContent = BODY_MODE_HINTS[mode];
    if (this.design) this.rebuildBody();
  }

  private toast(text: string, error = false): void {
    const t = this.panel.toast;
    t.textContent = text;
    t.classList.toggle('error', error);
    t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.hidden = true), 3000);
  }

  private handleKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && (t.type === 'number' || t.type === 'text')) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'я')) {
      e.preventDefault();
      this.applyHistory(e.shiftKey ? this.history.redo() : this.history.undo());
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (key === 'y' || key === 'н')) {
      e.preventDefault();
      this.applyHistory(this.history.redo());
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '1') this.setMode('select');
    else if (e.key === '2') this.setMode('mount');
    else if (key === 'g' || key === 'п') this.setGizmoMode('translate');
    else if (key === 'r' || key === 'к') this.setGizmoMode('rotate');
    else if (key === 's' || key === 'ы') this.setGizmoMode('scale');
    else if (e.key === 'Delete') this.deleteSelected();
    else if (e.key === 'Escape') {
      if (this.selected) {
        this.selected = null;
        this.refresh();
      } else {
        this.finish();
      }
    }
  }

  // ---------- picking ----------

  private onPointerUp(e: PointerEvent): void {
    const d = this.down;
    this.down = null;
    if (e.button !== 0 || !d || !this.design) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP_PX || this.gizmo.dragging) return;
    // A click on the gizmo handles is not a selection click.
    if (this.gizmo.object && this.gizmo.axis !== null) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.bodyGroup, true).filter((h) => h.object.userData.kind);
    const hit = hits[0];

    if (this.mode === 'select') {
      this.selected = hit && hit.object.userData.kind === 'part' ? (hit.object.userData.id as string) : null;
      this.refresh();
      return;
    }
    if (!hit) return;
    if (hit.object.userData.kind === 'mount') {
      this.commit(deleteMount(this.design, hit.object.userData.id as string, this.mirror));
    } else if ((this.design.body?.mounts.length ?? 0) >= 16) {
      this.toast('Не больше 16 точек крепления', true);
    } else {
      this.commit(addMount(this.design, hit.point, this.mirror));
    }
  }
}
