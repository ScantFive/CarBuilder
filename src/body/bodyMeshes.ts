import * as THREE from 'three';
import { localVertices, wingEndplateHeight, type BodyDesign, type BodyPart } from '../model/body';

export const MOUNT_COLOR = 0xffd400;
const mountGeo = new THREE.OctahedronGeometry(0.07);
const DEG = Math.PI / 180;

function material(color: string, opacity: number): THREE.MeshStandardMaterial {
  const transparent = opacity < 1;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.25,
    transparent,
    opacity,
    depthWrite: !transparent,
    side: THREE.DoubleSide,
    flatShading: true,
  });
}

function wedgeGeometry(p: BodyPart): THREE.BufferGeometry {
  const v = localVertices('wedge', p.size);
  // 0..2: x=-hx (bottom-rear, bottom-front, top-rear); 3..5: same at x=+hx.
  const faces = [
    [0, 2, 1], [3, 4, 5], // sides
    [0, 1, 4], [0, 4, 3], // bottom
    [0, 3, 5], [0, 5, 2], // rear wall
    [1, 2, 5], [1, 5, 4], // slope
  ];
  const pos = faces.flat().flatMap((i) => [v[i].x, v[i].y, v[i].z]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Visual object for one body part, sized by `size` and placed by `position`/`rotation`. */
export function buildPartMesh(p: BodyPart, opts: { opacity?: number } = {}): THREE.Object3D {
  const mat = material(p.color, opts.opacity ?? 1);
  const { x: sx, y: sy, z: sz } = p.size;
  let obj: THREE.Object3D;
  switch (p.shape) {
    case 'box':
      obj = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      break;
    case 'wedge':
      obj = new THREE.Mesh(wedgeGeometry(p), mat);
      break;
    case 'cylinder': {
      const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
      g.rotateZ(Math.PI / 2);
      g.scale(sx, sy, sz);
      obj = new THREE.Mesh(g, mat);
      break;
    }
    case 'sphere': {
      const g = new THREE.SphereGeometry(0.5, 16, 12);
      g.scale(sx, sy, sz);
      obj = new THREE.Mesh(g, mat);
      break;
    }
    case 'wing': {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat));
      const h = wingEndplateHeight(sy);
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, h, sz), mat);
        plate.position.x = (side * sx) / 2;
        group.add(plate);
      }
      obj = group;
      break;
    }
  }
  obj.position.set(p.position.x, p.position.y, p.position.z);
  obj.rotation.set(p.rotation.x * DEG, p.rotation.y * DEG, p.rotation.z * DEG, 'XYZ');
  return obj;
}

function tag(o: THREE.Object3D, kind: string, id: string): void {
  o.traverse((c) => {
    c.userData = { kind, id };
  });
}

/**
 * Body visuals. Parts carry userData {kind:'part', id} only when pickable;
 * mounts always carry {kind:'mount', id}.
 */
export function buildBodyMeshes(
  b: BodyDesign,
  opts: { opacity?: number; showParts?: boolean; showMounts?: boolean; pickableParts?: boolean } = {},
): THREE.Group {
  const group = new THREE.Group();
  if (opts.showParts !== false) {
    for (const p of b.parts) {
      const m = buildPartMesh(p, { opacity: opts.opacity });
      if (opts.pickableParts) tag(m, 'part', p.id);
      group.add(m);
    }
  }
  if (opts.showMounts) {
    for (const m of b.mounts) {
      const mesh = new THREE.Mesh(mountGeo, new THREE.MeshBasicMaterial({ color: MOUNT_COLOR }));
      mesh.position.set(m.x, m.y, m.z);
      tag(mesh, 'mount', m.id);
      group.add(mesh);
    }
  }
  return group;
}

export function isSharedGeometry(g: THREE.BufferGeometry): boolean {
  return g === mountGeo;
}
