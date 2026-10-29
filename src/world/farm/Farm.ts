import * as THREE from 'three';
import { SurfacePath } from '../../globe/path';
import { Chart } from '../../globe/surface';
import { ZONES, zoneChart, type Zone } from '../../globe/zones';
import { ribbonMesh } from '../belts';
import { LOOKS, walkLimbs, type GrainPose, type LookName } from '../crowd';
import { Dyn } from '../dyn';
import { HUB_HEIGHT, makeOutpost } from '../feeders';
import { M, Prefab, StaticBatch, bentSlab, glowMat, setGlow } from '../kit';
import { InstancePool } from '../pools';
import { tank, lamp } from '../line/prefabs';
import type { Env, Pools } from '../types';
import { combine, planter } from '../vehicles';

const GROW = 52;
const PLANTS = 12;
const ROWS = 11;
const FIELD_W = 30;
const FIELD_D = 34;
const ROW_GAP = 3;
const GROUND = 0.12;

type RowState = 'empty' | 'planting' | 'growing' | 'ripe' | 'harvesting';

interface Row {
  z: number;
  state: RowState;
  t: number;
  prog: number;
  claimed: boolean;
}

interface Vehicle {
  x: number;
  z: number;
  yaw: number;
  mode: 'idle' | 'go' | 'work';
  row: Row | null;
  dir: 1 | -1;
  startX: number;
  speed: number;
}

interface Field {
  cx: number;
  cz: number;
  rows: Row[];
  planter: Vehicle;
  harvester: Vehicle;
  /** Static world matrix per plant, row-major. */
  matrices: THREE.Matrix4[];
}

function plantPrefab(): Prefab {
  // Near-white so the per-instance tint decides the colour: green sprouts to golden grain.
  return new Prefab()
    .cyl(0.07, 0.1, 0.9, M(0xf4f4f4), 0, 0, 0, 5)
    .cone(0.34, 0.8, M(0xffffff), 0.2, 0.3, 0, 5)
    .cone(0.34, 0.8, M(0xe8e8e8), -0.2, 0.5, 0.1, 5)
    .sphere(0.22, M(0xfdfdfd), 0, 1.0, 0, 1.4, 6);
}

const TINT_SPROUT = new THREE.Color(0x86e06a);
const TINT_GREEN = new THREE.Color(0x3f9c3a);
const TINT_RIPE = new THREE.Color(0xe6c340);
const tint = new THREE.Color();
const m4 = new THREE.Matrix4();
const v3 = new THREE.Vector3();

/** Fields that plant, grow and harvest themselves in an endless loop, tended by a seed drill and a combine. */
export class Farm {
  readonly group = new THREE.Group();
  /** Where the crate trunk belt starts (raised, at hub height). */
  readonly out: THREE.Vector3;
  private chart: Chart;
  private fields: Field[] = [];
  private plants = new InstancePool(plantPrefab(), ROWS * PLANTS * 4 + 8, true, false);
  private planters = new InstancePool(planter(), 6, false);
  private combines = new InstancePool(combine(), 6, false);
  private blades: Dyn[] = [];
  private zone: Zone;
  private hands: { path: SurfacePath; s: number; look: LookName; speed: number; phase: number }[] = [];

  constructor(batch: StaticBatch) {
    this.zone = ZONES.find((z) => z.kind === 'farm')!;
    this.chart = zoneChart(this.zone);
    const c = this.chart;
    const id = this.zone.id;

    // Field plots and furrows.
    const centers: [number, number][] = [[-21, -21], [21, -21], [-21, 25], [21, 25]];
    for (const [cx, cz] of centers) {
      batch.addGeometry(M(0x5a3d2b, { side: THREE.DoubleSide }), bentSlab(c, cx, cz, FIELD_W + 4, FIELD_D + 3, GROUND, 1.5, 6));
      const rows: Row[] = [];
      const matrices: THREE.Matrix4[] = [];
      for (let r = 0; r < ROWS; r++) {
        const z = cz - FIELD_D / 2 + 2 + r * ROW_GAP;
        const states: RowState[] = ['growing', 'growing', 'growing', 'ripe', 'empty'];
        const state = states[Math.floor(Math.random() * states.length)];
        rows.push({ z, state, t: state === 'growing' ? Math.random() * GROW : state === 'ripe' ? GROW : 0, prog: 0, claimed: false });
        batch.placeOn(new Prefab().box(FIELD_W - 1, 0.05, 0.7, M(0x3e2a1d), 0, 0, 0), c, cx, z, GROUND);
        for (let j = 0; j < PLANTS; j++) matrices.push(c.matrix(cx - FIELD_W / 2 + 1.8 + j * 2.4, z, GROUND, 0));
      }
      const mk = (): Vehicle => ({ x: cx - 25, z: cz + 20, yaw: 0, mode: 'idle', row: null, dir: 1, startX: 0, speed: 6 });
      this.fields.push({ cx, cz, rows, planter: mk(), harvester: mk(), matrices });
    }

    // Irrigation canals between the fields, and service roads.
    batch.placeOn(new Prefab().box(2, 0.1, 90, M(0x2f6fb5), 0, 0, 0), c, 0, 2, GROUND);
    batch.placeOn(new Prefab().box(84, 0.1, 2, M(0x2f6fb5), 0, 0, 0), c, 0, 2, GROUND);
    const road = SurfacePath.through(c, [[-40, 2], [-20, 2], [0, 2], [20, 2], [40, 2]], 0.2, false, 2);
    const road2 = SurfacePath.through(c, [[0, -50], [0, -25], [0, 2], [0, 25], [0, 50]], 0.2, false, 2);
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x3b3f48, roughness: 0.95, side: THREE.DoubleSide, flatShading: true });
    this.group.add(ribbonMesh(road, 2.4, asphalt), ribbonMesh(road2, 2.4, asphalt));

    // Greenhouse domes at the north end, glowing at night.
    const domeColors = [0x9ad6c8, 0xc9a6ff, 0xffd08a];
    domeColors.forEach((col, i) => {
      const x = -26 + i * 26;
      const dome = new Prefab().sphere(9, M(col, { rough: 0.3 }), 0, -2, 0, 0.8, 14).box(18.6, 0.5, 0.5, glowMat(id, 0xffffff, 0.2, 2.2), 0, 0.2, 0).box(0.5, 0.5, 18.6, glowMat(id, 0xffffff, 0.2, 2.2), 0, 0.2, 0);
      for (let k = 0; k < 6; k++) dome.sphere(1.4, glowMat(id, [0xff5fa8, 0x6bff95, 0xffe06b, 0x6fb4ff, 0xc36bff, 0xff9a4d][k], 0.4, 2.4), Math.cos(k * 1.05) * 5, 2.8 + (k % 3) * 1.2, Math.sin(k * 1.05) * 5, 1, 6);
      batch.placeOn(dome, c, x, -46, GROUND);
    });

    // Silos and the crate out-station at the south end.
    for (let i = 0; i < 4; i++) batch.placeOn(tank(0xcfd3da, 3, 7), c, -15 + i * 10, 42, GROUND);
    batch.placeOn(makeOutpost(id), c, 0, 50, 0.3);
    this.out = c.point(0, 50, HUB_HEIGHT);

    // Wind turbines with turning blades, farmhouses and lamp posts.
    for (let i = 0; i < 3; i++) {
      const x = -38 + i * 3;
      const z = -20 + i * 18;
      batch.placeOn(new Prefab().cyl(0.4, 0.8, 16, M(0xe8ecf2), 0, 0, 0, 8).sphere(0.9, M(0xcfd3da), 0, 16, 0, 1, 8), c, x, z, GROUND);
      const blades = new Prefab().box(0.5, 9, 0.2, M(0xf5f7fa), 0, 0, 0).box(0.5, 9, 0.2, M(0xf5f7fa), 0, -9, 0).box(7.8, 0.5, 0.2, M(0xf5f7fa), -3.9, -0.3, 0).box(7.8, 0.5, 0.2, M(0xf5f7fa), 3.9, -0.3, 0);
      this.blades.push(new Dyn(blades, c.matrix(x, z + 1.0, 16.5 + GROUND, 0), this.group));
    }
    for (const [x, z] of [[-6, -30], [6, -30], [-6, 30], [6, 30], [-40, 2], [40, 2]] as const) batch.placeOn(lamp(id), c, x, z, GROUND);
    batch.placeOn(new Prefab().box(8, 4, 6, M(0xb8643a), 0, 0, 0).box(8.6, 0.6, 6.6, M(0x7a3b2a), 0, 4, 0).box(1.4, 2.4, 0.1, M(0x3d2a1d), 0, 0, 3.05), c, 38, 38, GROUND);

    // A few farmhands walking the service roads.
    const loop = SurfacePath.through(c, [[-38, 2], [-4, 2], [-4, -40], [4, -40], [4, 2], [38, 2], [38, 14], [4, 14], [4, 40], [-4, 40], [-4, 14], [-38, 14], [-38, 2]], GROUND + 0.1, false, 1);
    const looks: LookName[] = ['rice', 'corn', 'millet', 'rice', 'wheat', 'quinoa'];
    looks.forEach((look, i) => this.hands.push({ path: loop, s: (i / looks.length) * loop.length, look, speed: look === 'millet' || look === 'quinoa' ? 2.4 : 1.3, phase: i * 1.7 }));
  }

  update(env: Env, night: number): void {
    setGlow(this.zone.id, night);
    const dt = env.dt;
    for (const f of this.fields) {
      for (const r of f.rows) {
        if (r.state === 'growing') {
          r.t += dt;
          if (r.t >= GROW) r.state = 'ripe';
        }
      }
      this.drive(f, f.planter, 'empty', 'planting', 'growing', dt);
      this.drive(f, f.harvester, 'ripe', 'harvesting', 'empty', dt);
    }
    this.blades.forEach((b, i) => b.set(m4.makeRotationZ(env.elapsed * (0.9 + i * 0.15))));
  }

  /** A seed drill or combine works the next row that needs it, then heads for the next. */
  private drive(f: Field, v: Vehicle, wants: RowState, during: RowState, after: RowState, dt: number): void {
    if (v.mode === 'idle') {
      const row = f.rows.find((r) => r.state === wants && !r.claimed);
      if (!row) {
        // Park at the headland.
        v.yaw = Math.PI / 2;
        return;
      }
      row.claimed = true;
      v.row = row;
      v.dir = Math.abs(v.x - (f.cx - 19)) < Math.abs(v.x - (f.cx + 19)) ? 1 : -1;
      v.startX = v.dir === 1 ? f.cx - FIELD_W / 2 - 3 : f.cx + FIELD_W / 2 + 3;
      v.mode = 'go';
    }
    const row = v.row!;
    if (v.mode === 'go') {
      const dx = v.startX - v.x;
      const dz = row.z - v.z;
      const d = Math.hypot(dx, dz);
      v.yaw = Math.atan2(dx, dz);
      if (d < 0.5) {
        v.x = v.startX;
        v.z = row.z;
        v.mode = 'work';
        row.state = during;
        row.prog = 0;
      } else {
        const step = Math.min(d, v.speed * 1.3 * dt);
        v.x += (dx / d) * step;
        v.z += (dz / d) * step;
      }
    } else if (v.mode === 'work') {
      v.yaw = v.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      v.x += v.dir * 4.2 * dt;
      row.prog = Math.min(1, Math.abs(v.x - v.startX) / (FIELD_W + 6));
      if (row.prog >= 1) {
        row.state = after;
        row.t = 0;
        row.claimed = false;
        row.prog = 0;
        v.mode = 'idle';
        v.row = null;
      }
    }
  }

  draw(env: Env, pools: Pools): void {
    const near = env.camDist < 380;
    this.plants.begin();
    this.planters.begin();
    this.combines.begin();
    if (near) {
      for (const f of this.fields) {
        f.rows.forEach((r, ri) => {
          if (r.state === 'empty') return;
          for (let j = 0; j < PLANTS; j++) {
            const along = (j + 0.5) / PLANTS;
            let scale: number;
            let col = TINT_GREEN;
            const pl = f.planter;
            const hv = f.harvester;
            if (r.state === 'planting') {
              // Seeds go in behind the drill, as it passes each spot.
              const passed = pl.dir === 1 ? along <= (r.prog * (FIELD_W + 6) - 3) / FIELD_W : 1 - along <= (r.prog * (FIELD_W + 6) - 3) / FIELD_W;
              if (!passed) continue;
              scale = 0.1;
              col = TINT_SPROUT;
            } else if (r.state === 'harvesting') {
              const gone = hv.dir === 1 ? along <= (r.prog * (FIELD_W + 6) - 3) / FIELD_W : 1 - along <= (r.prog * (FIELD_W + 6) - 3) / FIELD_W;
              if (gone) continue;
              scale = 1.15;
              col = TINT_RIPE;
            } else if (r.state === 'ripe') {
              scale = 1.15;
              col = TINT_RIPE;
            } else {
              const g = Math.min(1, r.t / GROW);
              scale = 0.1 + 1.05 * g;
              col = tint.copy(TINT_SPROUT).lerp(TINT_GREEN, Math.min(1, g * 1.6)).lerp(TINT_RIPE, Math.max(0, g - 0.8) * 5);
            }
            m4.copy(f.matrices[ri * PLANTS + j]).scale(v3.set(scale, scale, scale));
            this.plants.push(m4, col.getHex());
          }
        });
      }
    }
    for (const f of this.fields) {
      this.vehicleMatrix(f.planter, GROUND);
      this.planters.push(m4);
      this.vehicleMatrix(f.harvester, GROUND);
      this.combines.push(m4);
      // Puffs of dust behind working machines.
      if (near && env.camDist < 220) {
        for (const v of [f.planter, f.harvester]) {
          if (v.mode === 'work' && Math.random() < env.dt * 8) {
            this.chart.point(v.x - v.dir * 3, v.z, 1.2, v3);
            env.fx.emit(v3, v3.clone().normalize().multiplyScalar(1.2), { color: 0xc9b79a, size0: 0.5, size1: 1.8, life: 1.6, alpha: 0.4, drag: 0.6 });
          }
        }
      }
    }
    this.plants.end();
    this.planters.end();
    this.combines.end();

    // Farmhands.
    const g: GrainPose = { pos: v3, forward: v3, up: v3, look: LOOKS.rice, armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, lean: 0, roll: 0 };
    const sample = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
    if (env.camDist < 360) {
      for (const h of this.hands) {
        h.s = (h.s + h.speed * env.dt) % h.path.length;
        h.path.at(h.s, sample);
        g.pos = sample.pos;
        g.forward = sample.tangent;
        g.up = sample.up;
        g.look = LOOKS[h.look];
        Object.assign(g, walkLimbs(env.elapsed * h.speed * 3.2 + h.phase, h.speed));
        pools.crowd.draw(g);
      }
    }
  }

  private vehicleMatrix(v: Vehicle, h: number): THREE.Matrix4 {
    return this.chart.matrix(v.x, v.z, h, v.yaw, m4);
  }

  get meshes(): THREE.Object3D[] {
    return [this.plants.mesh, this.planters.mesh, this.combines.mesh];
  }
}
