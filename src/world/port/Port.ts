import * as THREE from 'three';
import { SurfacePath } from '../../globe/path';
import { Chart, R, lonLatDir } from '../../globe/surface';
import { ZONES, zoneChart, type Zone } from '../../globe/zones';
import type { Product } from '../../sim/factory';
import { sfx } from '../../ui/sfx';
import { ribbonMesh } from '../belts';
import { registerCorridor } from '../corridors';
import { Dyn } from '../dyn';
import { M, Prefab, StaticBatch, bentDisc, glowMat, setGlow } from '../kit';
import type { Line } from '../line/Line';
import { lamp, tank } from '../line/prefabs';
import { InstancePool, LitPool, surfaceMatrix } from '../pools';
import type { Env, Pools } from '../types';
import { courierDrone, deliveryTruck, deliveryTruckLights } from '../vehicles';

const PAD_Y = 0.35;
/** Sideways distance of each of the two parking bays from the dock apron's centre line. */
const BAY_LAT = 3.5;
const ease = (t: number): number => t * t * (3 - 2 * t);
const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const sample = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };

interface PadDef {
  x: number;
  z: number;
  /** Line this pad serves for real releases, or -1 for a freight pad that launches ambient cargo. */
  line: number;
}

const PADS: PadDef[] = [
  { x: -16, z: 30, line: 0 },
  { x: 16, z: 30, line: 1 },
  { x: -16, z: 0, line: 2 },
  { x: 16, z: 0, line: 3 },
  { x: -16, z: -30, line: 4 },
  { x: 16, z: -30, line: 5 },
  { x: 0, z: 15, line: -1 },
  { x: 0, z: -15, line: -1 },
];

function rocketPrefab(): Prefab {
  const p = new Prefab().cyl(1.5, 1.7, 9, M(0xf1ede4), 0, 0, 0, 14).cyl(1.52, 1.52, 1.1, M(0xdc2626), 0, 5.2, 0, 14).cone(1.5, 3, M(0xdc2626), 0, 9, 0, 14);
  p.sphere(0.6, M(0x7dd3fc), 0, 7.2, 1.45, 1, 8).cyl(1.2, 1.6, 0.8, M(0x3a3f4a), 0, -0.4, 0, 12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    p.box(0.25, 2.8, 1.9, M(0xdc2626), Math.sin(a) * 1.75, 0.2, Math.cos(a) * 1.75, a);
  }
  return p;
}

type CraftKind = 'rocket' | 'drone';
type CraftState = 'docked' | 'countdown' | 'ascend' | 'away' | 'arrive' | 'hover' | 'landing';

interface Craft {
  kind: CraftKind;
  pad: number;
  state: CraftState;
  t: number;
  alt: number;
  away: number;
  /** Direction (unit, tangent to the surface) the craft drifts toward while climbing. */
  drift: THREE.Vector3;
  from: THREE.Vector3;
  seed: number;
}

interface Truck {
  line: number;
  state: 'wait' | 'drive' | 'unload' | 'return';
  s: number;
  t: number;
  load: number;
  carrying: Product | null;
  /** Where the truck was last drawn (for the follow camera). */
  pos: THREE.Vector3;
  slot: number;
}

/**
 * The rocket port: launch pads with gantries, a fleet of rockets and drones that leave the planet and come back
 * from deliveries, and trucks that shuttle boxes from every line's dock to its pad. A pad always has a craft on it
 * except for the few seconds while the next one descends from the sky.
 */
export class Port {
  readonly group = new THREE.Group();
  private zone: Zone;
  private chart: Chart;
  private rockets = new InstancePool(rocketPrefab(), 24, false);
  private drones = new InstancePool(courierDrone('port'), 24, false);
  private trucks = new LitPool(deliveryTruck(), deliveryTruckLights(), 16, false);
  private crafts: Craft[] = [];
  private fleet: Truck[] = [];
  private roads: SurfacePath[] = [];
  private padPos: THREE.Vector3[] = [];
  private padUp: THREE.Vector3[] = [];
  private dronePos: THREE.Vector3[] = [];
  private dishes: Dyn[] = [];
  private pending: { pad: number; kind: CraftKind }[] = [];
  private seen = new Set<number>();
  private freightTimer = [20, 55];
  private lines: Line[] = [];

  constructor(batch: StaticBatch, lines: Line[]) {
    this.lines = lines;
    this.zone = ZONES.find((z) => z.kind === 'port')!;
    this.chart = zoneChart(this.zone);
    const c = this.chart;
    const id = this.zone.id;
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x3b3f48, roughness: 0.95, side: THREE.DoubleSide, flatShading: true });

    // Pads: a bent concrete disc, a glowing ring, a gantry tower and fuel tanks.
    PADS.forEach((pd, i) => {
      batch.addGeometry(M(0x505560, { side: THREE.DoubleSide }), bentDisc(c, pd.x, pd.z, 10, 0.5, 3, 32));
      batch.addGeometry(glowMat(id, 0xffd24a, 0.15, 2.4), bentDisc(c, pd.x, pd.z, 9.4, 0.54, 0.1, 32));
      batch.addGeometry(M(0x3c4049, { side: THREE.DoubleSide }), bentDisc(c, pd.x, pd.z, 8.4, 0.58, 0.1, 32));
      this.padPos.push(c.point(pd.x, pd.z, 0.58));
      this.padUp.push(c.dir(pd.x, pd.z));
      const tower = new Prefab();
      tower.box(1.3, 20, 1.3, M(0xdc5a2b), 0, 0, 0).box(1.3, 20, 1.3, M(0xdc5a2b), 2.4, 0, 0).box(3.7, 0.4, 0.4, M(0xdc5a2b), 1.2, 6, 0).box(3.7, 0.4, 0.4, M(0xdc5a2b), 1.2, 12, 0).box(3.7, 0.4, 0.4, M(0xdc5a2b), 1.2, 18, 0);
      tower.box(2.6, 0.5, 2, glowMat(id, 0xff3b2f, 0.2, 3), 1.2, 20, 0);
      batch.placeOn(tower, c, pd.x - 7.5, pd.z - 2, 0.5, 0);
      batch.placeOn(tank(0xd9dce2, 1.6, 4), c, pd.x + 9.5, pd.z - 6, 0.35);
      batch.placeOn(tank(0xd9dce2, 1.6, 4), c, pd.x + 9.5, pd.z + 4, 0.35);
      // Drone helipad beside each repo pad.
      if (pd.line >= 0) {
        const hx = pd.x + (pd.x < 0 ? -13 : 13);
        batch.addGeometry(M(0x505560, { side: THREE.DoubleSide }), bentDisc(c, hx, pd.z - 8, 3.6, 0.5, 2, 18));
        batch.addGeometry(glowMat(id, 0x39ffe0, 0.15, 2.4), bentDisc(c, hx, pd.z - 8, 3.2, 0.54, 0.1, 18));
        this.dronePos.push(c.point(hx, pd.z - 8, 0.6));
      } else {
        this.dronePos.push(c.point(pd.x, pd.z, 0.6));
      }
      // Two craft per pad: one docked, one on a delivery run.
      for (const k of [0, 1]) {
        this.crafts.push({ kind: 'rocket', pad: i, state: k === 0 ? 'docked' : 'away', t: 0, alt: 0, away: 10 + Math.random() * 30, drift: new THREE.Vector3(), from: new THREE.Vector3(), seed: Math.random() * 6 });
        if (pd.line >= 0) this.crafts.push({ kind: 'drone', pad: i, state: k === 0 ? 'docked' : 'away', t: 0, alt: 0, away: 6 + Math.random() * 20, drift: new THREE.Vector3(), from: new THREE.Vector3(), seed: Math.random() * 6 });
      }
    });

    // Control tower with a neon sign, radar dishes, lamp posts and the port roads.
    const control = new Prefab().box(16, 7, 10, M(0x6b7280), 0, 0, 0).box(17, 0.8, 11, M(0x2f333d), 0, 7, 0).box(10, 3, 6, M(0x1d2b45), 0, 7.8, 0).box(12, 0.6, 7, M(0x39ffe0), 0, 10.8, 0);
    control.box(14, 1.4, 0.3, glowMat(id, 0xff2d95, 0.3, 3), 0, 4.2, 5.2).box(0.8, 8, 0.8, M(0x9aa4b2), 5, 11.4, 0);
    batch.placeOn(control, c, 0, 36, PAD_Y, 0);
    batch.placeOn(control, c, 0, -36, PAD_Y, Math.PI);
    for (const z of [36, -36]) {
      const dish = new Prefab().cyl(2.2, 0.3, 0.8, M(0xe8ecf2), 0, 0, 0, 14).box(0.2, 1.6, 0.2, M(0x6b7280), 0, 0.6, 0);
      this.dishes.push(new Dyn(dish, c.matrix(5, z, 12.2 + PAD_Y, 0), this.group));
    }
    for (let z = -40; z <= 40; z += 10) for (const x of [-30, -8, 8, 30]) batch.placeOn(lamp(id), c, x, z, PAD_Y);

    // Roads: the dispatch avenue between the two columns of lines, the east road, and the port loop.
    const lat = (la: number, lo: number, h = 0.37): THREE.Vector3 => lonLatDir(lo, la).multiplyScalar(R + h);
    const avenue = SurfacePath.through3D([lat(46, 0), lat(38, 0), lat(30, 0), lat(22, 0), lat(14, 0), lat(8, 0), lat(3.8, 0)], 1);
    const east = SurfacePath.through3D([lat(3.8, 0), lat(3.8, 14), lat(3.8, 30), lat(5, 46), lat(10, 58), lat(18, 66), lat(22, 69)], 1);
    this.group.add(ribbonMesh(avenue, 2.8, asphalt), ribbonMesh(east, 2.8, asphalt));
    const loop = SurfacePath.through(c, [[-34, 20], [0, 22], [34, 20], [34, 10], [0, 8], [-34, 10], [-34, -8], [0, -8], [34, -8], [34, -22], [0, -22], [-34, -22]], 0.37, false, 1.5);
    this.group.add(ribbonMesh(loop, 2.8, asphalt));

    // One road per line from its dock to its pad, and two trucks to run it.
    lines.forEach((line, i) => {
      const dock = line.dockPose();
      const zoneLat = line.zone.lat;
      const pad = PADS[i];
      const gate = c.point(-36, pad.z + (i % 2 === 0 ? 12 : 12), 0.37);
      const lane = c.point(pad.x, pad.z + 14, 0.37);
      const apron = c.point(pad.x + (pad.x < 0 ? -2 : 2), pad.z + 9, 0.37);
      const pts = [dock.pos.clone().setLength(R + 0.37), dock.pos.clone().addScaledVector(dock.forward, 14).setLength(R + 0.37), lat(zoneLat, 0), lat(14 + (zoneLat > 20 ? 0 : 0), 0), lat(3.8, 2), lat(4.2, 30), lat(8, 52), gate, lane, apron];
      // Drop duplicate/near points that would kink the curve.
      const clean = pts.filter((p, k) => k === 0 || p.distanceTo(pts[k - 1]) > 4);
      const road = SurfacePath.through3D(clean, 1.2);
      registerCorridor(road, 2.4);
      this.roads.push(road);
      for (const slot of [0, 1]) this.fleet.push({ line: i, state: slot === 0 ? 'wait' : 'return', s: slot === 0 ? 0 : road.length * (0.3 + Math.random() * 0.5), t: Math.random() * 3, load: slot === 0 ? 0.4 : 0, carrying: null, slot, pos: new THREE.Vector3() });
    });
  }

  // --- launches ------------------------------------------------------------------

  private occupant(pad: number, kind: CraftKind): Craft | undefined {
    return this.crafts.find((c) => c.pad === pad && c.kind === kind && (c.state === 'docked' || c.state === 'countdown' || c.state === 'landing'));
  }

  private launch(pad: number, kind: CraftKind): boolean {
    const c = this.occupant(pad, kind);
    if (!c || c.state !== 'docked') return false;
    c.state = 'countdown';
    c.t = 0;
    return true;
  }

  private padPoint(pad: number, kind: CraftKind): THREE.Vector3 {
    return kind === 'drone' ? this.dronePos[pad] : this.padPos[pad];
  }

  // --- simulation ------------------------------------------------------------------

  update(env: Env, night: number): void {
    this.trucks.setNight(night);
    setGlow(this.zone.id, night);
    this.dishes.forEach((d, i) => d.set(m4.makeRotationY(env.elapsed * (0.5 + i * 0.2))));

    // Real releases: a run whose sim status turns "launching" sends the craft off the pad.
    this.lines.forEach((line, i) => {
      for (const p of line.state.products) {
        if (p.status === 'launching' && !this.seen.has(p.id * 100 + i)) {
          this.seen.add(p.id * 100 + i);
          this.pending.push({ pad: i, kind: 'rocket' });
        }
      }
    });
    // Ambient freight launches keep rockets coming and going all day.
    for (let k = 0; k < 2; k++) {
      this.freightTimer[k] -= env.dt;
      if (this.freightTimer[k] <= 0) {
        this.freightTimer[k] = 70 + Math.random() * 50;
        this.pending.push({ pad: 6 + k, kind: 'rocket' });
      }
    }
    this.pending = this.pending.filter((p) => !this.launch(p.pad, p.kind));

    for (const c of this.crafts) this.updateCraft(c, env);
    this.updateTrucks(env);
  }

  private updateCraft(c: Craft, env: Env): void {
    const dt = env.dt;
    const rocket = c.kind === 'rocket';
    c.t += dt;
    switch (c.state) {
      case 'countdown':
        if (c.t >= (rocket ? 3.6 : 2.2)) {
          c.state = 'ascend';
          c.t = 0;
          c.alt = 0;
          // Drift toward a random compass bearing along the surface, so launches fan out over the horizon.
          const up = this.padUp[c.pad];
          const a = Math.random() * Math.PI * 2;
          c.drift.set(Math.cos(a), 0, Math.sin(a));
          c.drift.addScaledVector(up, -c.drift.dot(up)).normalize();
          if (rocket && env.camDist < 600) sfx.rumble(5);
        }
        if (rocket && c.t > 1.4 && Math.random() < env.dt * 30) this.steamPuff(c, env);
        break;
      case 'ascend': {
        const accel = rocket ? 16 : 7;
        c.alt = 0.5 * accel * c.t * c.t * (rocket ? 1 : 1.4);
        if (c.alt > (rocket ? 1500 : 800)) {
          c.state = 'away';
          c.t = 0;
          c.away = rocket ? 28 + Math.random() * 35 : 14 + Math.random() * 20;
        }
        this.exhaust(c, env);
        break;
      }
      case 'away':
        // Out of sight on a delivery run.
        if (c.t >= c.away) {
          c.state = 'arrive';
          c.t = 0;
          // Come back in from a different bearing, high above the horizon.
          const up = this.padUp[c.pad];
          const a = Math.random() * Math.PI * 2;
          c.from.set(Math.cos(a), 0, Math.sin(a));
          c.from.addScaledVector(up, -c.from.dot(up)).normalize();
        }
        break;
      case 'arrive': {
        const dur = rocket ? 15 : 9;
        const k = Math.min(1, c.t / dur);
        c.alt = THREE.MathUtils.lerp(rocket ? 600 : 360, rocket ? 90 : 26, ease(k));
        c.drift.copy(c.from);
        if (k >= 1) {
          c.state = 'hover';
          c.t = 0;
        }
        this.exhaust(c, env, 0.5);
        break;
      }
      case 'hover': {
        c.alt = (rocket ? 90 : 26) + Math.sin(c.t * 2 + c.seed) * 1.2;
        // Wait for the pad to be clear (the previous craft has climbed well away).
        const busy = this.crafts.some((o) => o !== c && o.pad === c.pad && o.kind === c.kind && (o.state === 'docked' || o.state === 'countdown' || o.state === 'landing' || (o.state === 'ascend' && o.alt < 40)));
        if (!busy) {
          c.state = 'landing';
          c.t = 0;
        }
        this.exhaust(c, env, 0.4);
        break;
      }
      case 'landing': {
        const dur = rocket ? 10 : 5;
        const k = Math.min(1, c.t / dur);
        c.alt = (rocket ? 90 : 26) * (1 - ease(k)) ** 1.2;
        c.drift.multiplyScalar(1 - k);
        if (k >= 1) {
          c.state = 'docked';
          c.t = 0;
          c.alt = 0;
        }
        this.exhaust(c, env, 0.7);
        break;
      }
      default:
        break;
    }
  }

  private steamPuff(c: Craft, env: Env): void {
    if (env.camDist > 400) return;
    v3.copy(this.padPoint(c.pad, c.kind));
    v4.copy(this.padUp[c.pad]).multiplyScalar(0.3);
    env.fx.emit(v3, v3.clone().normalize().multiplyScalar(1).add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(5)), { color: 0xeef2f7, size0: 1, size1: 5, life: 1.8, alpha: 0.5, drag: 1 });
  }

  private craftPos(c: Craft, out: THREE.Vector3): THREE.Vector3 {
    const base = this.padPoint(c.pad, c.kind);
    const up = this.padUp[c.pad];
    out.copy(base).addScaledVector(up, c.alt);
    // Climbing craft curve away along their bearing; arriving ones swing in from theirs.
    const bend = c.state === 'ascend' ? c.alt * c.alt * 0.00022 * (c.kind === 'rocket' ? 1 : 2) : c.state === 'arrive' ? (c.alt - 80) * 0.45 : c.state === 'landing' ? c.alt * 0.1 : 0;
    out.addScaledVector(c.drift, bend);
    return out;
  }

  private exhaust(c: Craft, env: Env, strength = 1): void {
    if (env.camDist > 700) return;
    this.craftPos(c, v3);
    const up = this.padUp[c.pad];
    v3.addScaledVector(up, -0.5);
    const n = c.kind === 'rocket' ? 5 : 1;
    for (let i = 0; i < n * strength + Math.random(); i++) {
      v4.copy(up).multiplyScalar(-(c.kind === 'rocket' ? 14 : 5)).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3));
      env.fx.emit(v3, v4, { color: Math.random() < 0.5 ? 0xffb02e : 0xff6a1a, size0: c.kind === 'rocket' ? 2.6 : 0.5, size1: 0.4, life: 0.4, alpha: 0.95, drag: 0.4 });
      if (c.kind === 'rocket' && Math.random() < 0.5) env.fx.emit(v3, v4.clone().multiplyScalar(0.25), { color: 0xcfd3da, size0: 2.4, size1: 10, life: 2.6, alpha: 0.5, drag: 0.7 });
    }
  }

  // --- trucks ------------------------------------------------------------------

  private updateTrucks(env: Env): void {
    const dt = env.dt;
    for (const t of this.fleet) {
      const line = this.lines[t.line];
      const road = this.roads[t.line];
      line.bays[t.slot as 0 | 1] = t.state === 'wait';
      const firstWaiting = this.fleet.find((o) => o.line === t.line && o.state === 'wait');
      switch (t.state) {
        case 'wait': {
          t.t += dt;
          t.load = Math.min(1, t.load + dt / 6);
          const real = line.waitingAtDock();
          // Truck 0 is the express truck: it waits for a real run. Truck 1 shuttles ordinary cargo all day.
          if (t === firstWaiting && ((real && t.load > 0.45) || (t.slot === 1 && t.load >= 1))) {
            if (real) {
              t.carrying = real;
              line.collectFromDock();
            }
            t.state = 'drive';
            t.t = 0;
          }
          break;
        }
        case 'drive':
          t.s += 14 * dt;
          if (t.s >= road.length) {
            t.s = road.length;
            t.state = 'unload';
            t.t = 0;
          }
          break;
        case 'unload': {
          // Waits for a craft to be docked on its pad before unloading.
          const kind: CraftKind = 'rocket';
          const dock = this.crafts.some((c) => c.pad === t.line && c.kind === 'rocket' && c.state === 'docked');
          if (!dock && !t.carrying) break;
          t.t += dt;
          t.load = Math.max(0, 1 - t.t / 6);
          if (t.t >= 6) {
            if (t.carrying) {
              // The box is aboard the craft: let the run take off.
              t.carrying.cap = undefined;
              void kind;
              t.carrying = null;
            }
            t.state = 'return';
          }
          break;
        }
        case 'return':
          t.s -= 14 * dt;
          if (t.s <= 0) {
            t.s = 0;
            t.state = 'wait';
            t.t = 0;
            t.load = 0;
          }
          break;
      }
    }
  }

  // --- drawing -------------------------------------------------------------------

  draw(env: Env, pools: Pools): void {
    this.rockets.begin();
    this.drones.begin();
    this.trucks.begin();
    const up = new THREE.Vector3();
    for (const c of this.crafts) {
      if (c.state === 'away') continue;
      // High in the sky a craft shrinks out of sight: rockets leave the planet unseen and come back down from above.
      const unseen = THREE.MathUtils.smoothstep(c.alt, 180, 260);
      if (unseen >= 1) continue;
      this.craftPos(c, v3);
      up.copy(this.padUp[c.pad]);
      // Tilt toward the direction of travel as it climbs or arrives.
      const tilt = c.state === 'ascend' ? Math.min(0.9, c.alt * 0.0011) : c.state === 'arrive' ? Math.min(0.5, (c.alt - 80) * 0.0008) : 0;
      const dir = up.clone().addScaledVector(c.drift, tilt * (c.state === 'arrive' ? -1 : 1)).normalize();
      if (c.state === 'countdown') dir.addScaledVector(c.drift, Math.sin(env.elapsed * 55) * 0.004).normalize();
      // Upright basis whose y axis is `dir`.
      // A docked craft has no drift and points straight up: pick any sideways axis that is truly perpendicular to its
      // heading (the old fallback was not, which sheared docked rockets into flat slabs).
      const x = new THREE.Vector3().crossVectors(dir, c.drift.lengthSq() ? c.drift : up).normalize();
      if (x.lengthSq() < 1e-6) {
        x.crossVectors(dir, Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      }
      const z = new THREE.Vector3().crossVectors(x, dir).normalize();
      m4.makeBasis(x, dir, z).scale(new THREE.Vector3().setScalar(1 - unseen)).setPosition(v3);
      (c.kind === 'rocket' ? this.rockets : this.drones).push(m4);
    }
    // Trucks and their loads.
    for (const t of this.fleet) {
      const road = this.roads[t.line];
      const s = Math.min(road.length, Math.max(0, t.s));
      road.at(s, sample);
      const outbound = t.state === 'drive' || t.state === 'unload';
      v4.crossVectors(sample.up, sample.tangent).normalize();
      // Two parking bays side by side on the apron (one per truck), rear to the dock hood. Leaving or arriving, a truck
      // slides from its bay into the road's lane over the first few units.
      const bayLat = t.slot === 0 ? -BAY_LAT : BAY_LAT;
      const laneLat = outbound ? -1.6 : 1.6;
      const lat = t.state === 'wait' ? bayLat : THREE.MathUtils.lerp(bayLat, laneLat, THREE.MathUtils.smoothstep(s, 0, 9));
      sample.pos.addScaledVector(v4, lat);
      const fwd = v3.copy(sample.tangent);
      if (t.state === 'return') {
        // Arrives facing the dock, then swings round to park nose out.
        fwd.negate();
        if (s < 10) fwd.applyAxisAngle(sample.up, Math.PI * (1 - s / 10) * (t.slot === 0 ? 1 : -1));
      } else if (!outbound && t.state !== 'wait') {
        fwd.negate();
      }
      surfaceMatrix(sample.pos, fwd, sample.up, m4);
      t.pos.copy(sample.pos);
      this.trucks.push(m4);
      if (t.load > 0.03) {
        for (let k = 0; k < 3; k++) {
          v3.copy(sample.pos).addScaledVector(sample.up, 1.9 + (k === 2 ? 0.8 : 0)).addScaledVector(fwd, -1.0 - (k % 2) * 1.5);
          surfaceMatrix(v3, fwd, sample.up, m4, 0.9 * Math.min(1, t.load * (1 + k * 0.4)));
          pools.crates.push(m4, 0xffffff);
        }
      }
      // The real run's own box sits on the bed (green-sealed) all the way to the pad.
      if (t.carrying && t.state !== 'unload') {
        v3.copy(sample.pos).addScaledVector(sample.up, 2.0).addScaledVector(fwd, -1.7);
        surfaceMatrix(v3, fwd, sample.up, m4, 1.15);
        pools.crates.push(m4, 0xc8f5c8);
      }
      // While unloading, boxes ride up to the rocket's cargo hatch and vanish inside it.
      if (t.state === 'unload' && t.carrying) {
        const phase = (t.t / 6) % 1;
        this.padPoint(t.line, 'rocket');
        v3.copy(sample.pos).addScaledVector(sample.up, 2);
        const hatch = this.padPos[t.line].clone().addScaledVector(this.padUp[t.line], 6.5);
        v3.lerp(hatch, ease(phase)).addScaledVector(sample.up, Math.sin(phase * Math.PI) * 3);
        surfaceMatrix(v3, fwd, sample.up, m4, 0.9 * (1 - ease(Math.max(0, phase - 0.85) / 0.15)));
        pools.crates.push(m4, 0xc8f5c8);
      }
    }
    this.rockets.end();
    this.drones.end();
    this.trucks.end();
  }

  /**
   * Where a product is once it has left its line: on the truck that carries it, waiting at the pad, or on the rocket
   * as it climbs. Returns null when the rocket has reached the stratosphere (following ends there).
   */
  followRun(line: number, product: Product | null): THREE.Vector3 | null {
    const out = new THREE.Vector3();
    const rocket = (): THREE.Vector3 | null => {
      const c = this.crafts.find((o) => o.pad === line && (o.state === 'countdown' || o.state === 'ascend' || o.state === 'docked'));
      return c && c.alt < 240 ? this.craftPos(c, out) : null;
    };
    if (!product) {
      const c = this.crafts.find((o) => o.pad === line && o.state === 'ascend');
      return c && c.alt < 240 ? this.craftPos(c, out) : null;
    }
    const truck = this.fleet.find((o) => o.line === line && o.carrying === product);
    if (truck) return truck.pos.clone();
    if (product.status === 'failed' || product.status === 'cancelled') return null;
    if (product.status === 'launching') return rocket() ?? this.padPos[line].clone();
    return this.padPos[line].clone();
  }

  /** Things on the ground and in the air that can be clicked to follow (trucks, rockets, drones). */
  followables(): { pos: THREE.Vector3; follow: () => THREE.Vector3 | null }[] {
    const list: { pos: THREE.Vector3; follow: () => THREE.Vector3 | null }[] = [];
    for (const t of this.fleet) list.push({ pos: t.pos, follow: () => t.pos.clone() });
    for (const c of this.crafts) {
      if (c.state === 'away' || c.alt > 240) continue;
      const pos = this.craftPos(c, new THREE.Vector3());
      list.push({ pos, follow: () => (c.state === 'away' || c.alt > 240 ? null : this.craftPos(c, new THREE.Vector3())) });
    }
    return list;
  }

  get meshes(): THREE.Object3D[] {
    return [this.rockets.mesh, this.drones.mesh, ...this.trucks.meshes];
  }
}
