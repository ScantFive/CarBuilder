import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { TrackData } from '../track/trackData';
import { computeEdges, type P2 } from '../track/trackGeometry';

type Rapier = typeof RAPIER_NS;

export const WALL_HEIGHT = 1;
const WALL_THICKNESS = 0.5;
const KERB_WIDTH = 0.6;

function strip(a: P2[], b: P2[], y: number, color: number): THREE.Mesh {
  const n = a.length;
  const pos = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    pos.set([a[i][0], y, a[i][1]], i * 6);
    pos.set([b[i][0], y, b[i][1]], i * 6 + 3);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide }));
}

function lerp2(a: P2, b: P2, t: number): P2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function checkerTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 4; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Adds the visual track and its static colliders (floor + walls along both edges). */
/** Returns the centreline tangents for placing cars. */
export function buildTrackScene(R: Rapier, world: RAPIER_NS.World, scene: THREE.Scene, t: TrackData): P2[] {
  const { left, right, tangents } = computeEdges(t);
  const kerbT = KERB_WIDTH / t.width;

  // Ground, asphalt and kerbs.
  const xs = t.points.map((p) => p[0]);
  const zs = t.points.map((p) => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 800;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x4c7a3a, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  scene.add(grass);
  scene.add(strip(left, right, 0.02, 0x3b3d42));
  const leftIn = left.map((p, i) => lerp2(p, right[i], kerbT));
  const rightIn = right.map((p, i) => lerp2(p, left[i], kerbT));
  scene.add(strip(left, leftIn, 0.03, 0xe8e8e8), strip(rightIn, right, 0.03, 0xe8e8e8));

  // Chequered start line across the track at the start index.
  const s = t.startIndex;
  const [sx, sz] = t.points[s];
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(t.width, 2),
    new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.9 }),
  );
  line.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(line);
  holder.position.set(sx, 0.04, sz);
  holder.rotation.y = Math.atan2(tangents[s][0], tangents[s][1]);
  scene.add(holder);

  // Floor collider.
  const floor = world.createRigidBody(R.RigidBodyDesc.fixed());
  world.createCollider(R.ColliderDesc.cuboid(size / 2, 0.5, size / 2).setTranslation(0, -0.5, 0).setFriction(1), floor);

  // Walls: one box per edge segment, pushed outwards by half the wall thickness.
  const walls = world.createRigidBody(R.RigidBodyDesc.fixed());
  const boxes: { x: number; z: number; yaw: number; len: number; stripe: boolean }[] = [];
  const addEdge = (edge: P2[], outward: 1 | -1) => {
    for (let i = 0; i < edge.length; i++) {
      const a = edge[i];
      const b = edge[(i + 1) % edge.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      // Outward normal: left of the driving direction is (dz, -dx).
      const nx = (outward * dz) / len;
      const nz = (outward * -dx) / len;
      boxes.push({
        x: (a[0] + b[0]) / 2 + nx * (WALL_THICKNESS / 2),
        z: (a[1] + b[1]) / 2 + nz * (WALL_THICKNESS / 2),
        yaw: Math.atan2(dx, dz),
        len: len + 0.2,
        stripe: Math.floor(i / 2) % 2 === 0,
      });
    }
  };
  addEdge(left, 1);
  addEdge(right, -1);

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    boxes.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const red = new THREE.Color(0xd33a2c);
  const white = new THREE.Color(0xf2f2f2);
  boxes.forEach((bx, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), bx.yaw);
    m.compose(new THREE.Vector3(bx.x, WALL_HEIGHT / 2, bx.z), q, new THREE.Vector3(1, 1, bx.len));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, bx.stripe ? red : white);
    world.createCollider(
      R.ColliderDesc.cuboid(WALL_THICKNESS / 2, WALL_HEIGHT / 2, bx.len / 2)
        .setTranslation(bx.x, WALL_HEIGHT / 2, bx.z)
        .setRotation({ x: 0, y: Math.sin(bx.yaw / 2), z: 0, w: Math.cos(bx.yaw / 2) })
        .setFriction(0.3),
      walls,
    );
  });
  scene.add(mesh);
  return tangents;
}

/** Position and heading (yaw, radians) for a car placed `back` metres behind centreline index i. */
export function trackPose(t: TrackData, tangents: P2[], i: number, back = 0): { x: number; z: number; heading: number } {
  const [tx, tz] = tangents[i];
  const [x, z] = t.points[i];
  return { x: x - tx * back, z: z - tz * back, heading: Math.atan2(tx, tz) };
}
