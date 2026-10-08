import * as THREE from 'three';
import type { CarDesign } from '../model/car';
import { computeMassProperties } from '../model/physicsProps';

export type PartKind = 'node' | 'beam' | 'wheel' | 'engine';

export const COLORS = {
  node: 0xdfe3ea,
  beam: 0x8a93a3,
  steering: 0x3d8bff,
  driven: 0xff8a1f,
  tyre: 0x222326,
  engine: 0xe0352b,
  com: 0xffd400,
  highlight: 0x46e08a,
};

const nodeGeo = new THREE.SphereGeometry(0.06, 16, 12);
const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 10);
const engineGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
const comGeo = new THREE.OctahedronGeometry(0.09);

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2 });

/** Wheel mesh: tyre cylinder along X with coloured hub discs showing steering (blue) / driven (orange). */
export function buildWheelMesh(radius: number, steering: boolean, driven: boolean): THREE.Group {
  const g = new THREE.Group();
  const width = Math.max(0.18, radius * 0.6);
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24), mat(COLORS.tyre));
  tyre.rotation.z = Math.PI / 2;
  g.add(tyre);
  const hubColor = steering && driven ? null : steering ? COLORS.steering : driven ? COLORS.driven : 0x777777;
  const hubGeo = new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.02, 20);
  if (hubColor !== null) {
    const hub = new THREE.Mesh(hubGeo, mat(hubColor));
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
  } else {
    // Both roles: half blue, half orange.
    for (const [color, start] of [[COLORS.steering, 0], [COLORS.driven, Math.PI]] as const) {
      const half = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.02, 20, 1, false, start, Math.PI), mat(color));
      half.rotation.z = Math.PI / 2;
      g.add(half);
    }
  }
  // Spoke so wheel rotation is visible.
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, radius * 1.6, 0.05), mat(0xdddddd));
  g.add(spoke);
  return g;
}

function tag(o: THREE.Object3D, kind: PartKind, id: string): void {
  o.traverse((c) => {
    c.userData = { kind, id };
  });
}

/** Builds the visual model of a car. Every pickable mesh has userData { kind, id }. */
export function buildCarMeshes(c: CarDesign, opts: { showCom?: boolean; withWheels?: boolean } = {}): THREE.Group {
  const group = new THREE.Group();
  const nodes = new Map(c.nodes.map((n) => [n.id, n]));

  for (const n of c.nodes) {
    const m = new THREE.Mesh(nodeGeo, mat(COLORS.node));
    m.position.set(n.x, n.y, n.z);
    tag(m, 'node', n.id);
    group.add(m);
  }

  const up = new THREE.Vector3(0, 1, 0);
  for (const b of c.beams) {
    const a = nodes.get(b.a);
    const e = nodes.get(b.b);
    if (!a || !e) continue;
    const va = new THREE.Vector3(a.x, a.y, a.z);
    const ve = new THREE.Vector3(e.x, e.y, e.z);
    const len = va.distanceTo(ve);
    if (len < 1e-6) continue;
    const m = new THREE.Mesh(beamGeo, mat(COLORS.beam));
    m.scale.set(1, len, 1);
    m.position.copy(va).add(ve).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, ve.clone().sub(va).normalize());
    tag(m, 'beam', b.id);
    group.add(m);
  }

  if (opts.withWheels !== false) {
    for (const w of c.wheels) {
      const n = nodes.get(w.node);
      if (!n) continue;
      const m = buildWheelMesh(w.radius, w.steering, w.driven);
      m.position.set(n.x, n.y, n.z);
      tag(m, 'wheel', w.id);
      group.add(m);
    }
  }

  if (c.engine) {
    const n = nodes.get(c.engine.node);
    if (n) {
      const m = new THREE.Mesh(engineGeo, mat(COLORS.engine));
      m.position.set(n.x, n.y, n.z);
      tag(m, 'engine', c.engine.node);
      group.add(m);
    }
  }

  if (opts.showCom && c.nodes.length > 0) {
    const { com } = computeMassProperties(c);
    const m = new THREE.Mesh(comGeo, new THREE.MeshBasicMaterial({ color: COLORS.com, depthTest: false }));
    m.renderOrder = 10;
    m.position.set(com.x, com.y, com.z);
    group.add(m);
  }

  return group;
}

/** Disposes per-instance materials/geometries of a group built by buildCarMeshes. */
export function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const shared = o.geometry === nodeGeo || o.geometry === beamGeo || o.geometry === engineGeo || o.geometry === comGeo;
      if (!shared) o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
}
