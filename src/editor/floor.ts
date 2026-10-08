import * as THREE from 'three';
import { BOUNDS } from './symmetry';

/** Ground grid with a "ПЕРЕД" arrow marking the car's front (+Z). */
export function buildEditorFloor(): THREE.Object3D {
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
