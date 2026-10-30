import * as THREE from 'three';
import { SurfacePath, type PathSample } from '../../globe/path';
import { R, lonLatDir } from '../../globe/surface';
import { M, Prefab, glowMat } from '../kit';
import { InstancePool, surfaceMatrix } from '../pools';
import { courierDrone, hoverCar } from '../vehicles';

interface Lane {
  path: SurfacePath;
  count: number;
  speed: number;
}

interface Vehicle {
  lane: number;
  s: number;
  speed: number;
  kind: number;
  /** Small sideways offset so cars in a lane do not stack in one line. */
  lateral: number;
}

const sample: PathSample = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
const m4 = new THREE.Matrix4();
const v3 = new THREE.Vector3();

/** A loop through points given as [lon, lat] at a given height above ground. */
function loop(pts: [number, number][], h: number): SurfacePath {
  const p3 = [...pts, pts[0], pts[1]].map(([lo, la]) => lonLatDir(lo, la).multiplyScalar(R + h));
  return SurfacePath.through3D(p3, 2);
}

function satellitePrefab(): Prefab {
  return new Prefab().box(1.4, 1.4, 2.4, M(0xc9ccd2), 0, -0.7, 0).box(7, 0.12, 2, M(0x1d3a7a, { metal: 0.6 }), 0, 0, 0).box(0.3, 0.3, 0.3, glowMat('sky', 0x39ffe0, 1.2, 3), 0, 0.8, 0);
}

/**
 * Everything that flies: hover cars on neon sky lanes, delivery drones criss-crossing the planet, and satellites
 * on endless orbits. All loops are closed, so vehicles simply keep circling and never need to appear or vanish.
 */
export class Skyways {
  private lanes: Lane[] = [];
  private cars: Vehicle[] = [];
  private drones: Vehicle[] = [];
  private carPools: InstancePool[] = [
    new InstancePool(hoverCar('city', 0xe94b8b, 0xff2d95), 40, false, false),
    new InstancePool(hoverCar('city', 0x3b82f6, 0x39ffe0), 40, false, false),
    new InstancePool(hoverCar('city', 0xf5b73a, 0xffb02e), 40, false, false),
  ];
  private dronePool = new InstancePool(courierDrone('city'), 40, false, false);
  private sats = new InstancePool(satellitePrefab(), 18, false, false);
  private orbits: { axis: THREE.Vector3; radius: number; rate: number; phase: number; tilt: number }[] = [];

  constructor() {
    const L = (pts: [number, number][], h: number, count: number, speed: number): void => void this.lanes.push({ path: loop(pts, h), count, speed });
    // City rings and a figure-eight above the market.
    L([[-30, -2], [-18, -16], [0, -22], [18, -16], [30, -2], [18, 8], [0, 12], [-18, 8]], 24, 9, 17);
    L([[-24, -10], [0, 2], [24, -10], [24, -22], [0, -10], [-24, -22]], 30, 8, 21);
    // Long commuter loops over the factory continent and out to the port.
    L([[0, -8], [-24, 10], [-28, 26], [-24, 42], [0, 48], [24, 42], [28, 26], [24, 10]], 38, 10, 24);
    L([[0, -8], [30, 0], [58, 14], [74, 30], [58, 16], [30, -2]], 40, 8, 26);
    L([[0, -8], [-40, -2], [-66, 8], [-60, -22], [-30, -36], [10, -34], [50, -30], [66, -14], [40, 6]], 48, 9, 28);
    this.lanes.forEach((lane, li) => {
      for (let i = 0; i < lane.count; i++) this.cars.push({ lane: li, s: (i / lane.count) * lane.path.length, speed: lane.speed * (0.85 + Math.random() * 0.3), kind: (i + li) % 3, lateral: (Math.random() - 0.5) * 2.4 });
    });
    // Package drones on slower, lower loops between the market and the factories.
    const dl = [loop([[0, -8], [-18, 6], [-24, 14], [-12, 4]], 22), loop([[0, -8], [18, 6], [24, 14], [12, 4]], 24), loop([[0, -8], [-26, 26], [-8, 40], [10, 26]], 28), loop([[0, -8], [26, 26], [8, 40], [-10, 26]], 31)];
    dl.forEach((path, li) => {
      this.lanes.push({ path, count: 0, speed: 0 });
      for (let i = 0; i < 6; i++) this.drones.push({ lane: this.lanes.length - 1, s: (i / 6) * path.length, speed: 9 + Math.random() * 4, kind: li, lateral: 0 });
    });
    // Satellites on tilted orbits well above the clouds.
    for (let i = 0; i < 14; i++) {
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      this.orbits.push({ axis, radius: R + 210 + Math.random() * 190, rate: (0.025 + Math.random() * 0.045) * (Math.random() < 0.5 ? -1 : 1), phase: Math.random() * 6.28, tilt: Math.random() });
    }
  }

  get meshes(): THREE.Object3D[] {
    return [...this.carPools.map((p) => p.mesh), this.dronePool.mesh, this.sats.mesh];
  }

  update(dt: number, elapsed: number, camDist: number): void {
    for (const p of this.carPools) p.begin();
    this.dronePool.begin();
    this.sats.begin();
    for (const c of this.cars) {
      const lane = this.lanes[c.lane];
      c.s = (c.s + c.speed * dt) % lane.path.length;
      if (camDist > 650) continue;
      lane.path.at(c.s, sample);
      v3.crossVectors(sample.up, sample.tangent).normalize();
      sample.pos.addScaledVector(v3, c.lateral);
      surfaceMatrix(sample.pos, sample.tangent, sample.up, m4);
      this.carPools[c.kind].push(m4);
    }
    for (const d of this.drones) {
      const lane = this.lanes[d.lane];
      d.s = (d.s + d.speed * dt) % lane.path.length;
      lane.path.at(d.s, sample);
      sample.pos.addScaledVector(sample.up, Math.sin(elapsed * 1.7 + d.s) * 0.4);
      surfaceMatrix(sample.pos, sample.tangent, sample.up, m4);
      this.dronePool.push(m4);
    }
    // Satellites: rotate a point on a circle about each orbit's axis.
    const q = new THREE.Quaternion();
    this.orbits.forEach((o) => {
      const a = o.phase + elapsed * o.rate;
      const base = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), o.tilt * 1.4);
      q.setFromAxisAngle(o.axis, a);
      const pos = base.applyQuaternion(q).multiplyScalar(o.radius);
      const up = pos.clone().normalize();
      const fwd = new THREE.Vector3().crossVectors(o.axis, up).normalize();
      surfaceMatrix(pos, fwd, up, m4, 1.4);
      this.sats.push(m4);
    });
    for (const p of this.carPools) p.end();
    this.dronePool.end();
    this.sats.end();
  }
}
