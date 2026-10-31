import * as THREE from 'three';
import { SurfacePath } from '../globe/path';
import { lonLatDir, R } from '../globe/surface';
import { ZONES, zoneChart } from '../globe/zones';
import { registerCorridor } from './corridors';
import { LOOKS, walkLimbs, type GrainPose } from './crowd';
import { M, Prefab, StaticBatch, glowMat } from './kit';
import type { Line } from './line/Line';
import { hood } from './line/prefabs';
import { InstancePool, LitPool, surfaceMatrix } from './pools';
import { roadGeometry } from './scatter';
import type { Env, Pools } from './types';
import { deliveryTruck, deliveryTruckLights } from './vehicles';

const H = 0.37;
const LANE = 1.4;
const SPEED = 11;
const SHED = 9;
/** Where porters walk, in the line's chart: from the truck's side to the depot door. */
const PORT_A = { x: -49, z: -8.4 };
const PORT_DOOR = { x: -43.2, z: -8.4 };
const BAY = { x: -49.5, z: -11 };
const TRUCK_STOP = 0;

/** A flat trolley cart that porters push: deck, four wheels and a handle. Forward is +z. */
export function trolleyPrefab(): Prefab {
  const p = new Prefab().box(0.9, 0.1, 1.5, M(0x6b7280), 0, 0.3, 0).box(0.9, 0.35, 0.08, M(0x4b5563), 0, 0.4, -0.7).box(0.07, 0.9, 0.07, M(0x9aa4b2), -0.4, 0.4, -0.75).box(0.07, 0.9, 0.07, M(0x9aa4b2), 0.4, 0.4, -0.75).box(0.9, 0.07, 0.07, M(0x9aa4b2), 0, 1.25, -0.75);
  for (const x of [-0.5, 0.5]) for (const z of [-0.55, 0.55]) p.pipe(0.14, 0.12, M(0x15171c), x, 0.14, z, 'x', 8);
  return p;
}

/** A loading shed on the ground: trucks drive in here to be loaded unseen. */
function shed(zone: string, tint: number): Prefab {
  const p = new Prefab();
  p.add(hood(8.4, 9, 4.8, tint), 0, 0, 0, 0);
  p.box(5, 0.4, 0.5, glowMat(zone, 0xffb02e, 0.3, 3), 0, 4.9, 4.6);
  return p;
}

type Phase = 'load' | 'drive' | 'unload' | 'turn' | 'return';
interface Porter {
  mode: 'idle' | 'out' | 'grab' | 'back';
  t: number;
  /** Seconds before this porter starts work once the truck is parked. */
  delay: number;
}
interface Run {
  line: Line;
  kind: 'crop' | 'ore';
  path: SurfacePath;
  phase: Phase;
  s: number;
  t: number;
  crates: number;
  porters: Porter[];
  pos: THREE.Vector3;
}

const sample = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
const side = new THREE.Vector3();
const dirV = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const m5 = new THREE.Matrix4();
const v3 = new THREE.Vector3();
const smooth = (t: number): number => THREE.MathUtils.smoothstep(t, 0, 1);

/**
 * Supply by road: crop trucks from the farm and ore trucks from the mine drive to every line's depot, park at its
 * bay, and porters unload crates onto trolleys and push them into the depot. There are no belts outside factories.
 */
export class Supply {
  readonly meshes: THREE.Object3D[];
  private trucks = new LitPool(deliveryTruck(), deliveryTruckLights(), 24, true, true);
  private trolleys = new InstancePool(trolleyPrefab(), 24, false, false);
  private runs: Run[] = [];
  private farmBay: THREE.Vector3;

  constructor(batch: StaticBatch, lines: Line[]) {
    const asphalt = M(0x24262d, { rough: 0.9 });
    const farm = ZONES.find((z) => z.kind === 'farm')!;
    const mine = ZONES.find((z) => z.kind === 'mine')!;
    const fc = zoneChart(farm);
    const mc = zoneChart(mine);
    // Loading sheds sit on the ground at the farm's south end and the mine's north rim.
    batch.placeOn(shed('farm', 0x7a8a5a), fc, 0, 52, 0.3, Math.PI);
    batch.placeOn(shed('mine', 0x6b5a4a), mc, 8, -40, 0.3, 0);
    this.farmBay = fc.point(0, 52, H);
    const sources = {
      crop: [fc.point(0, 50, H), fc.point(0, 38, H), fc.point(14, 36, H)],
      ore: [mc.point(8, -42, H), mc.point(8, -48, H), mc.point(-4, -50, H)],
    };
    // Trunk roads run past the lines' outer ends; branches turn into each depot bay.
    const trunk = {
      crop: [lonLatDir(-54, -11), lonLatDir(-47, -8), lonLatDir(-46, -2)],
      ore: [lonLatDir(56, -2), lonLatDir(47, 2), lonLatDir(46, 6)],
    };
    const to = (v: THREE.Vector3): THREE.Vector3 => v.clone().multiplyScalar(R + H);

    for (const line of lines) {
      const i = line.zone.index ?? 0;
      const kind: 'crop' | 'ore' = i % 2 === 0 ? 'crop' : 'ore';
      const c = line.chart;
      const bay = c.point(BAY.x, BAY.z, H);
      const approach = c.point(-57, BAY.z, H);
      const near = c.point(-53, BAY.z, H);
      // The trunk is joined at the bay's own latitude on the outer road.
      const join = new THREE.Vector3().copy(bay).normalize();
      const lat = Math.asin(join.y);
      const lonJoin = kind === 'crop' ? -46 : 46;
      const joinPt = lonLatDir(lonJoin, (lat * 180) / Math.PI);
      const pts = [...sources[kind], ...trunk[kind].map(to), to(joinPt), approach, near, bay];
      const path = SurfacePath.through3D(pts, 1.5);
      batch.addGeometry(asphalt, roadGeometry(path, 1.8));
      registerCorridor(path, 3.4);
      const phase: Phase = 'load';
      this.runs.push({ line, kind, path, phase, s: 0, t: -(i * 6.5), crates: 0, porters: [{ mode: 'idle', t: 0, delay: 0 }, { mode: 'idle', t: 0, delay: 3 }], pos: new THREE.Vector3() });
    }
    this.meshes = [...this.trucks.meshes, this.trolleys.mesh];
  }

  /** Supply trucks that are out on the road, for clicking to follow. */
  followables(): { pos: THREE.Vector3; follow: () => THREE.Vector3 | null }[] {
    return this.runs.filter((r) => r.phase !== 'load').map((r) => ({ pos: r.pos, follow: () => (r.phase === 'load' ? null : r.pos.clone()) }));
  }

  /** Where the farm's shed is, for anything that wants to point at it. */
  get farmShed(): THREE.Vector3 {
    return this.farmBay;
  }

  update(env: Env, night = 0): void {
    this.trucks.setNight(night);
    const dt = env.dt;
    for (const r of this.runs) {
      const L = r.path.length;
      switch (r.phase) {
        case 'load':
          r.t += dt;
          if (r.t > 5) {
            r.phase = 'drive';
            r.crates = 3;
            r.s = 0;
          }
          break;
        case 'drive':
          r.s += SPEED * dt;
          if (r.s >= L) {
            r.s = L;
            r.phase = 'unload';
            r.t = 0;
            for (const p of r.porters) {
              p.mode = 'idle';
              p.t = 0;
            }
          }
          break;
        case 'unload': {
          r.t += dt;
          for (const p of r.porters) this.porter(r, p, dt);
          if (r.crates <= 0 && r.porters.every((p) => p.mode === 'idle') && r.t > 4) {
            r.phase = 'turn';
            r.t = 0;
          }
          break;
        }
        case 'turn':
          r.t += dt;
          if (r.t >= 1.4) r.phase = 'return';
          break;
        case 'return':
          r.s -= SPEED * dt;
          if (r.s <= TRUCK_STOP) {
            r.s = 0;
            r.phase = 'load';
            r.t = 0;
          }
          break;
      }
    }
  }

  private porter(r: Run, p: Porter, dt: number): void {
    p.t += dt;
    switch (p.mode) {
      case 'idle':
        if (r.t > p.delay && r.crates > 0) {
          p.mode = 'out';
          p.t = 0;
        }
        break;
      case 'out':
        if (p.t >= 2.4) {
          p.mode = 'grab';
          p.t = 0;
        }
        break;
      case 'grab':
        if (p.t >= 0.7) {
          r.crates = Math.max(0, r.crates - 1);
          p.mode = 'back';
          p.t = 0;
        }
        break;
      case 'back':
        if (p.t >= 2.4) {
          p.mode = 'idle';
          // A short pause inside the depot while the crate is racked.
          p.t = -1.2;
        }
        break;
    }
  }

  draw(env: Env, pools: Pools): void {
    this.trucks.begin();
    this.trolleys.begin();
    for (const r of this.runs) {
      const L = r.path.length;
      // Trucks that are loading, or still inside their shed, are out of sight.
      if (r.phase === 'load' || ((r.phase === 'drive' || r.phase === 'return') && r.s < SHED)) continue;
      r.path.at(r.s, sample);
      side.crossVectors(sample.up, sample.tangent).normalize();
      const outbound = r.phase === 'drive' || r.phase === 'unload' || r.phase === 'turn';
      // Opposite lanes each way, fading to the centre at both ends where the truck parks or enters its shed.
      const lane = (outbound ? -1 : 1) * LANE * smooth(Math.min(r.s, L - r.s) / 10);
      v3.copy(sample.pos).addScaledVector(side, lane);
      dirV.copy(sample.tangent);
      if (!outbound) dirV.negate();
      if (r.phase === 'turn') {
        const u = smooth(r.t / 1.4);
        dirV.applyAxisAngle(sample.up, Math.PI * u);
      }
      surfaceMatrix(v3, dirV, sample.up, m4);
      r.pos.copy(v3);
      this.trucks.push(m4, r.kind === 'crop' ? 0xffffff : 0xb9c2d4);
      // Crates on the bed.
      const slots: [number, number, number][] = [[-0.55, 1.75, -1.1], [0.55, 1.75, -1.1], [0, 1.75, -2.5]];
      const loaded = r.phase === 'unload' || r.phase === 'turn' ? r.crates : r.phase === 'drive' ? 3 : 0;
      for (let k = 0; k < Math.min(3, loaded); k++) {
        m5.copy(m4).multiply(new THREE.Matrix4().makeTranslation(...slots[k]));
        pools.crates.push(m5, r.kind === 'crop' ? 0xe8d27a : 0x7b8394);
      }
      if (r.phase === 'unload') this.drawPorters(r, env, pools);
    }
    this.trucks.end();
    this.trolleys.end();
  }

  private drawPorters(r: Run, env: Env, pools: Pools): void {
    const c = r.line.chart;
    const g: GrainPose = { pos: v3, forward: dirV, up: sample.up, look: LOOKS.rice, armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, lean: 0, roll: 0 };
    r.porters.forEach((p, k) => {
      if (p.mode === 'idle') return;
      let u: number;
      let east: boolean;
      let laden = false;
      if (p.mode === 'out') {
        u = 1 - p.t / 2.4;
        east = false;
      } else if (p.mode === 'grab') {
        u = 0;
        east = true;
      } else {
        u = p.t / 2.4;
        east = true;
        laden = true;
      }
      const x = THREE.MathUtils.lerp(PORT_A.x, PORT_DOOR.x, THREE.MathUtils.clamp(u, 0, 1));
      // Porters step through the depot door and vanish inside it.
      if (x > PORT_DOOR.x - 0.6) return;
      const rot = east ? Math.PI / 2 : -Math.PI / 2;
      const m = c.matrix(x, PORT_A.z, 0.35, rot);
      v3.setFromMatrixPosition(m);
      sample.up.setFromMatrixColumn(m, 1).normalize();
      dirV.setFromMatrixColumn(m, 2).normalize();
      g.look = LOOKS[k === 0 ? 'rice' : 'corn'];
      Object.assign(g, p.mode === 'grab' ? { armL: -1.0, armR: -1.0, legL: 0, legR: 0, bob: 0, lean: 0.25 + Math.sin(env.elapsed * 9) * 0.1, roll: 0 } : walkLimbs(env.elapsed * 7.5 + k * 2, 1.5));
      if (p.mode !== 'grab') Object.assign(g, { armL: -1.2, armR: -1.2 });
      pools.crowd.draw(g);
      // The trolley goes ahead of its pusher.
      m5.copy(m).multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.1));
      this.trolleys.push(m5);
      if (laden) {
        m5.multiply(new THREE.Matrix4().makeTranslation(0, 0.78, 0));
        pools.crates.push(m5, r.kind === 'crop' ? 0xe8d27a : 0x7b8394);
      }
    });
  }
}
