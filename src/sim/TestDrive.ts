import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { CarDesign } from '../model/car';
import type { CarStorage } from '../storage/carStorage';
import { parseTrack, type TrackData } from '../track/trackData';
import { nearestIndex } from '../track/trackGeometry';
import { LapTimer } from '../track/laps';
import trackJson from '../../tracks/yas-marina.json';
import { controlOutputs } from './driveModel';
import { Hud } from './hud';
import { KeyboardInput } from './input';
import { buildTrackScene, trackPose } from './trackScene';
import { createVehicle, type Vehicle } from './vehicle';

const STEP = 1 / 60;
const MAX_STEPS = 5;
const SPAWN_BACK = 8;
const STUCK_MS = 3000;
const CAMERA_OFFSET = new THREE.Vector3(0, 3, -8);

let rapierReady: Promise<void> | null = null;
const initRapier = () => (rapierReady ??= RAPIER.init());

/** The test-drive screen: physics world, track, the player's car, chase camera and HUD. */
export class TestDrive {
  private renderer: THREE.WebGLRenderer | null = null;
  private world: RAPIER.World | null = null;
  private vehicle: Vehicle | null = null;
  private input: KeyboardInput | null = null;
  private frame = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly design: CarDesign,
    private readonly storage: CarStorage,
    private readonly onExit: () => void,
  ) {
    root.classList.add('drive');
    this.start().catch((err) => this.fail(err));
  }

  private fail(err: unknown): void {
    console.error(err);
    if (this.disposed) return;
    this.stopLoop();
    this.root.replaceChildren();
    const box = document.createElement('div');
    box.className = 'fatal';
    box.innerHTML = '<h2>Не удалось запустить заезд</h2><p></p><div><button data-testid="btn-exit">← В редактор</button></div>';
    (box.querySelector('p') as HTMLElement).textContent = err instanceof Error ? err.message : String(err);
    (box.querySelector('button') as HTMLElement).addEventListener('click', () => this.onExit());
    this.root.appendChild(box);
    this.input?.dispose();
    this.input = new KeyboardInput((cmd) => cmd === 'exit' && this.onExit());
  }

  private async start(): Promise<void> {
    await initRapier();
    if (this.disposed) return;
    const track: TrackData = parseTrack(trackJson);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.root.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9cc8ee);
    scene.fog = new THREE.Fog(0x9cc8ee, 150, 900);
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x4c6a3a, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(300, 500, 200);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 2500);

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world = world;
    const tangents = buildTrackScene(RAPIER, world, scene, track);

    const spawn = trackPose(track, tangents, track.startIndex, SPAWN_BACK);
    const vehicle = createVehicle(RAPIER, world, this.design, spawn);
    this.vehicle = vehicle;
    scene.add(vehicle.group);

    const hud = new Hud(this.root, this.design.name);
    hud.exitButton.addEventListener('click', () => this.onExit());
    const laps = new LapTimer(track.points.length);
    laps.best = this.storage.getBest(this.design.name);

    const reset = () => {
      const i = laps.lastCheckpointIndex();
      const back = i === track.startIndex ? SPAWN_BACK : 0;
      const p = trackPose(track, tangents, i, back);
      vehicle.reset(p.x, p.z, p.heading);
      steer = 0;
    };
    this.input = new KeyboardInput((cmd) => (cmd === 'exit' ? this.onExit() : reset()));

    const resize = () => {
      const w = this.root.clientWidth || 1;
      const h = this.root.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(this.root);
    resize();

    const camTarget = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    const placeCamera = (alpha: number) => {
      const p = vehicle.group.position;
      const yaw = new THREE.Euler().setFromQuaternion(vehicle.group.quaternion, 'YXZ').y;
      camPos.copy(CAMERA_OFFSET).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(p);
      camera.position.lerp(camPos, alpha);
      camTarget.set(p.x, p.y + 1, p.z);
      camera.lookAt(camTarget);
    };
    vehicle.syncVisuals();
    placeCamera(1);

    let steer = 0;
    let acc = 0;
    let last = performance.now();
    let progress = track.startIndex;
    let stoppedMs = 0;
    const loop = (now: number) => {
      if (this.disposed) return;
      const frameDt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += frameDt;
      const keys = this.input!.state;
      if (!laps.isStarted && keys.w) laps.start(now);
      let steps = 0;
      while (acc >= STEP && steps < MAX_STEPS) {
        const out = controlOutputs(keys, vehicle.speedKmh(), steer, STEP);
        steer = out.steer;
        vehicle.update(out, STEP);
        world.step();
        acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS) acc = 0;

      vehicle.syncVisuals();
      const pos = vehicle.body.translation();
      progress = nearestIndex(track, pos.x, pos.z, progress);
      const lap = laps.update(progress, now);
      if (lap.lapCompleted && laps.best === lap.lapMs) this.storage.setBest(this.design.name, lap.lapMs!);

      const speed = vehicle.speedKmh();
      stoppedMs = Math.abs(speed) < 1 ? stoppedMs + frameDt * 1000 : 0;
      hud.update({
        speedKmh: speed,
        lapMs: laps.current(now),
        lastMs: laps.last,
        bestMs: laps.best,
        started: laps.isStarted,
        showHint: vehicle.upY() < 0.3 || (laps.isStarted && stoppedMs > STUCK_MS),
      });

      placeCamera(1 - Math.exp(-frameDt * 6));
      renderer.render(scene, camera);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    this.stopLoop();
    this.input?.dispose();
    this.resizeObserver?.disconnect();
    this.vehicle?.dispose();
    this.world?.free();
    this.renderer?.dispose();
    this.root.replaceChildren();
  }
}
