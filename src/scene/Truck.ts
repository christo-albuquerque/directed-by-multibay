import * as THREE from 'three';
import { BELT_Y, TRUCK_DOCK_X } from './layout';
import { box, mat, shadowAll } from './util';

const ROAD_TOP = 0.15;
const SPEED = 4.5;

/** Open-bed truck. Origin is the middle of the bed, so a product on the bed shares its x. */
export class Truck {
  readonly group = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private beacon: THREE.Mesh;
  private lights: THREE.Mesh[] = [];
  private moving = false;

  constructor() {
    const floorY = BELT_Y - ROAD_TOP;
    // Chassis and bed.
    this.group.add(box(1.9, 0.2, 1.3, 0x2f3542, -0.1, floorY - 0.2));
    for (const z of [-0.62, 0.62]) this.group.add(box(1.9, 0.28, 0.07, 0x3d4658, -0.1, floorY, z));
    this.group.add(box(0.07, 0.28, 1.3, 0x3d4658, -1.05, floorY));
    // Cab.
    this.group.add(box(0.95, 0.95, 1.3, 0xd9552b, 1.45, floorY - 0.2));
    this.group.add(box(0.05, 0.4, 1.0, 0x9fd8ee, 1.94, floorY + 0.35));
    // Headlights glow at night.
    for (const z of [-0.4, 0.4]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.2), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffe680, emissiveIntensity: 0.6 }));
      l.position.set(1.95, floorY - 0.02, z);
      this.lights.push(l);
      this.group.add(l);
    }
    // Wheels.
    for (const x of [-0.7, 1.4]) {
      for (const z of [-0.68, 0.68]) {
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 14), mat(0x1c1e24));
        tyre.rotation.x = Math.PI / 2;
        const hub = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.18), mat(0x9aa4b2));
        const w = new THREE.Group();
        w.add(tyre, hub);
        w.position.set(x, 0.24, z);
        this.wheels.push(w);
        this.group.add(w);
      }
    }
    // Beacon on the cab roof.
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8a00, emissiveIntensity: 1.2 }));
    this.beacon.position.set(1.4, floorY + 0.85 + 0.1, 0);
    this.group.add(this.beacon);
    shadowAll(this.group);
    this.group.position.set(TRUCK_DOCK_X, ROAD_TOP, 0);
  }

  get x(): number {
    return this.group.position.x;
  }

  update(dt: number, elapsed: number, targetX: number, night: number): void {
    const dx = targetX - this.group.position.x;
    const step = Math.sign(dx) * Math.min(Math.abs(dx), SPEED * dt);
    this.group.position.x += step;
    this.moving = Math.abs(step) > 1e-4;
    for (const w of this.wheels) w.rotation.z -= step / 0.24;
    const m = this.beacon.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = this.moving ? 0.8 + Math.sin(elapsed * 18) * 0.7 : 0.3;
    for (const l of this.lights) (l.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + night * 1.6;
  }
}
