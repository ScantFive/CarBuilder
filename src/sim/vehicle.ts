import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { CarDesign } from '../model/car';
import { computeMassProperties, spawnHeight, steerSign, SUSPENSION_REST } from '../model/physicsProps';
import { buildCarMeshes, buildWheelMesh } from '../editor/carMeshes';
import type { DriveOutput } from './driveModel';

type Rapier = typeof RAPIER_NS;


const SUSPENSION = { stiffness: 30, compression: 4.4, relaxation: 2.3, frictionSlip: 2.5, maxTravel: 0.3, sideFrictionStiffness: 1 };
const BEAM_RADIUS = 0.05;
const GRAVITY = 9.81;
/** Service brake deceleration (in g) at full pedal. */
const BRAKE_G = 1.6;
const HANDBRAKE_G = 2.5;

export interface Vehicle {
  readonly body: RAPIER_NS.RigidBody;
  readonly group: THREE.Group;
  /** Applies controls; call once per fixed physics step before world.step(). */
  update(out: DriveOutput, dt: number): void;
  /** Syncs meshes with physics; call once per rendered frame. */
  syncVisuals(): void;
  speedKmh(): number;
  /** Y component of the car's up vector (1 = upright, < 0 = upside down). */
  upY(): number;
  reset(x: number, z: number, heading: number): void;
  dispose(): void;
}

const yawQuat = (heading: number) => ({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) });

export function createVehicle(R: Rapier, world: RAPIER_NS.World, c: CarDesign, spawn: { x: number; z: number; heading: number }): Vehicle {
  const { mass, com, inertia } = computeMassProperties(c);
  const lift = spawnHeight(c, SUSPENSION_REST) + 0.1;
  const nodes = new Map(c.nodes.map((n) => [n.id, n]));

  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, lift, spawn.z)
      .setRotation(yawQuat(spawn.heading))
      .setAdditionalMassProperties(mass, com, { x: Math.max(inertia.x, 1), y: Math.max(inertia.y, 1), z: Math.max(inertia.z, 1) }, { x: 0, y: 0, z: 0, w: 1 })
      .setCanSleep(false)
      .setCcdEnabled(true),
  );

  // Chassis colliders carry no mass: mass properties come from the design.
  const up = new THREE.Vector3(0, 1, 0);
  for (const b of c.beams) {
    const a = nodes.get(b.a);
    const e = nodes.get(b.b);
    if (!a || !e) continue;
    const va = new THREE.Vector3(a.x, a.y, a.z);
    const ve = new THREE.Vector3(e.x, e.y, e.z);
    const len = va.distanceTo(ve);
    if (len < 1e-3) continue;
    const q = new THREE.Quaternion().setFromUnitVectors(up, ve.clone().sub(va).normalize());
    const mid = va.add(ve).multiplyScalar(0.5);
    world.createCollider(
      R.ColliderDesc.capsule(len / 2, BEAM_RADIUS).setTranslation(mid.x, mid.y, mid.z).setRotation(q).setDensity(0).setFriction(0.3),
      body,
    );
  }
  if (c.engine) {
    const n = nodes.get(c.engine.node);
    if (n) world.createCollider(R.ColliderDesc.cuboid(0.2, 0.15, 0.2).setTranslation(n.x, n.y, n.z).setDensity(0), body);
  }
  for (const w of c.wheels) {
    const n = nodes.get(w.node);
    if (n) world.createCollider(R.ColliderDesc.ball(w.radius * 0.8).setTranslation(n.x, n.y, n.z).setDensity(0).setFriction(0.2), body);
  }

  const controller = world.createVehicleController(body);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;
  const wheels = c.wheels.filter((w) => nodes.has(w.node));
  wheels.forEach((w, i) => {
    const n = nodes.get(w.node)!;
    controller.addWheel({ x: n.x, y: n.y, z: n.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, SUSPENSION_REST, w.radius);
    controller.setWheelSuspensionStiffness(i, SUSPENSION.stiffness);
    controller.setWheelSuspensionCompression(i, SUSPENSION.compression);
    controller.setWheelSuspensionRelaxation(i, SUSPENSION.relaxation);
    controller.setWheelFrictionSlip(i, SUSPENSION.frictionSlip);
    controller.setWheelMaxSuspensionTravel(i, SUSPENSION.maxTravel);
    controller.setWheelSideFrictionStiffness(i, SUSPENSION.sideFrictionStiffness);
    controller.setWheelMaxSuspensionForce(i, mass * GRAVITY * 6);
  });
  const signs = wheels.map((w) => steerSign(c, w));
  const drivenCount = Math.max(1, wheels.filter((w) => w.driven).length);
  const allSteer = wheels.every((w) => w.steering);

  // Visuals: chassis meshes plus separately animated wheels.
  const group = buildCarMeshes(c, { withWheels: false });
  const wheelMeshes = wheels.map((w) => {
    const holder = new THREE.Group();
    const spin = buildWheelMesh(w.radius, w.steering, w.driven);
    holder.add(spin);
    group.add(holder);
    return { holder, spin };
  });
  // The meshes are placed in the body frame; physics positions the body origin.

  const forward = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  const vehicle: Vehicle = {
    body,
    group,
    update(out, dt) {
      const perWheelG = (mass * GRAVITY * dt) / wheels.length;
      wheels.forEach((w, i) => {
        controller.setWheelEngineForce(i, w.driven ? out.force / drivenCount : 0);
        controller.setWheelSteering(i, w.steering ? out.steer * signs[i] : 0);
        let brake = out.brake * BRAKE_G * perWheelG;
        if (out.handbrake && (!w.steering || allSteer)) brake = Math.max(brake, HANDBRAKE_G * perWheelG);
        controller.setWheelBrake(i, brake);
      });
      controller.updateVehicle(dt);
    },
    syncVisuals() {
      const p = body.translation();
      const r = body.rotation();
      group.position.set(p.x, p.y, p.z);
      group.quaternion.set(r.x, r.y, r.z, r.w);
      wheels.forEach((w, i) => {
        const n = nodes.get(w.node)!;
        const len = controller.wheelSuspensionLength(i) ?? SUSPENSION_REST;
        const { holder, spin } = wheelMeshes[i];
        holder.position.set(n.x, n.y - len, n.z);
        holder.rotation.set(0, controller.wheelSteering(i) ?? 0, 0);
        spin.rotation.set(controller.wheelRotation(i) ?? 0, 0, 0);
      });
    },
    speedKmh() {
      const v = body.linvel();
      const r = body.rotation();
      quat.set(r.x, r.y, r.z, r.w);
      forward.set(0, 0, 1).applyQuaternion(quat);
      return (v.x * forward.x + v.y * forward.y + v.z * forward.z) * 3.6;
    },
    upY() {
      const r = body.rotation();
      return 1 - 2 * (r.x * r.x + r.z * r.z);
    },
    reset(x, z, heading) {
      body.setTranslation({ x, y: lift, z }, true);
      body.setRotation(yawQuat(heading), true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },
    dispose() {
      world.removeVehicleController(controller);
    },
  };
  vehicle.syncVisuals();
  return vehicle;
}
