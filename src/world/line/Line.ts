import * as THREE from 'three';
import { SurfacePath, type PathSample } from '../../globe/path';
import { Chart } from '../../globe/surface';
import type { Zone } from '../../globe/zones';
import { zoneChart } from '../../globe/zones';
import { testPose, HEAD_UP, IMPACT_PHASE, SHOT_PHASE } from '../../scene/choreography';
import { Tv } from '../../scene/Tv';
import { FactoryState, type Product } from '../../sim/factory';
import { STAGES } from '../../sim/stages';
import { BeltSurface, beltSupports, ribbonMesh } from '../belts';
import { IDLE_LIMBS, LOOKS, walkLimbs, workLimbs, type GrainPose, type LookName, type WorkStyle } from '../crowd';
import { M, Prefab, StaticBatch, glowMat, setGlow } from '../kit';
import { Dyn } from '../dyn';
import { surfaceMatrix } from '../pools';
import type { Env, Pools } from '../types';
import { BELT_HEIGHT, BELT_SPEED, ITEM_GAP, ITEM_LIFT, LANE_OFFSET, ROUTE, STATIONS } from './layout';
import * as P from './prefabs';

const PAD_TOP = 0.35;

type ItemKind = 'crate' | 'box' | 'tested';

interface BulkItem {
  s: number;
  kind: ItemKind;
  stage: number;
  state: 'move' | 'proc';
  t: number;
}

interface Station {
  index: number;
  fraction: number;
  /** Arc length of the station's centre on each lane. */
  sBulk: number;
  sExpress: number;
  rot: number;
  matrix: THREE.Matrix4;
  occupant: BulkItem | null;
  /** Seconds the station's last item has been inside; drives its machinery. */
  busy: number;
}

type ExpressMode = 'inside' | 'travel' | 'reject' | 'loaded';

interface Express {
  collected?: boolean;
  product: Product;
  s: number;
  stage: number;
  mode: ExpressMode;
  /** Travel destination (arc length). */
  to: number;
  t: number;
  kind: ItemKind;
}

interface Worker {
  pos: THREE.Vector3;
  fwd: THREE.Vector3;
  up: THREE.Vector3;
  look: LookName;
  style: WorkStyle;
  station: number;
  rank: number;
  phase: number;
}

/** Rescue crew member: waits at the hut, runs to a failing station, works there, then walks home. */
interface Crew {
  look: LookName;
  role: WorkStyle;
  home: THREE.Vector3;
  homeFwd: THREE.Vector3;
  up: THREE.Vector3;
  path: SurfacePath | null;
  s: number;
  mode: 'home' | 'out' | 'work' | 'back';
  speed: number;
  phase: number;
}

interface Walker {
  path: SurfacePath;
  s: number;
  speed: number;
  look: LookName;
  phase: number;
  dir: 1 | -1;
  carry: boolean;
}

const tmpS: PathSample = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpP = new THREE.Vector3();

const TINT = { crate: 0xffffff, box: 0xffffff, tested: 0xc8f5c8, failed: 0xff7a6e, cancelled: 0x9aa0a8 };
const DWELL = [2.4, 3.2, 4.2, 7.5, 3.2];
/** How far to the side of each station (local x; positive is the left of travel) the rescue crew stand. */
const CREW_X = [-6.6, -6.6, -6.6, -9, 6.6];

/**
 * One build line: a long winding belt with two lanes (bulk goods that never stop flowing, and an express lane
 * that carries the real GitHub runs), five stations along it, workers, and the machinery that animates as
 * items pass. Items only ever appear or vanish inside a housing.
 */
export class Line {
  readonly zone: Zone;
  readonly chart: Chart;
  readonly group = new THREE.Group();
  state = new FactoryState();
  repo: string | null = null;
  label = '';
  private route: SurfacePath;
  private bulk: SurfacePath;
  private express: SurfacePath;
  private belt = new BeltSurface();
  private stations: Station[] = [];
  private items: BulkItem[] = [];
  private ex = new Map<number, Express>();
  private workers: Worker[] = [];
  private walkers: Walker[] = [];
  private spawnTimer = 2;
  private pressHeads: Dyn[] = [];
  private craneHeads: Dyn[] = [];
  private cannons: Dyn[] = [];
  private ball: Dyn;
  private smokeAcc = 0;
  private sign: THREE.Mesh | null = null;
  private signCtx: CanvasRenderingContext2D | null = null;
  private signTex: THREE.CanvasTexture | null = null;
  private signText = '';
  private prevPhase = new Map<number, number>();
  private flash = 0;
  /** World position of this line's rescue hut door, for crew to leave from. */
  private hutDoor = new THREE.Vector3();
  private crew: Crew[] = [];
  private tvs: Tv[] = [];
  /** Where the current incident is, for the shared red warning light (null when all is well). */
  incident: THREE.Vector3 | null = null;

  constructor(zone: Zone, batch: StaticBatch) {
    this.zone = zone;
    // The world is big: wreckage stays long enough for the rescue crew to arrive and work.
    this.state.lingerSeconds = 16;
    this.chart = zoneChart(zone);
    this.route = SurfacePath.through(this.chart, ROUTE, BELT_HEIGHT, false, 0.9);
    this.bulk = this.route.offset(LANE_OFFSET);
    this.express = this.route.offset(-LANE_OFFSET);

    this.group.add(ribbonMesh(this.bulk, 0.95, this.belt.mat), ribbonMesh(this.express, 0.95, this.belt.mat));
    beltSupports(batch, this.route, 4.2, LANE_OFFSET + 1.15);
    this.buildStations(batch);
    this.buildDecor(batch);
    this.buildScreens();
    this.buildSign();
    this.ball = new Dyn(new Prefab().sphere(0.28, M(0x111318), 0, 0, 0), new THREE.Matrix4(), this.group);
    this.ball.mesh.visible = false;
    this.populate();
    // Start with the belt already busy so the planet never looks switched on.
    this.seedItems();
  }

  // --- construction -------------------------------------------------------------

  private placeStation(k: number, batch: StaticBatch, prefab: Prefab): void {
    const st = this.stations[k];
    batch.place(prefab, st.matrix);
  }

  private buildStations(batch: StaticBatch): void {
    const zone = this.zone.id;
    const prefabs = [P.depot(zone), P.lint(zone), P.build(zone), P.arena(zone), P.dispatch(zone)];
    STATIONS.forEach((def, k) => {
      const s = k === 0 ? 0 : this.route.nearest(def.anchor[0], def.anchor[1]);
      const flat = this.route.flatAt(s);
      const tan = this.route.flatTangentAt(Math.min(s, this.route.length - 1));
      const rot = Math.atan2(tan.x, tan.y);
      const matrix = this.chart.matrix(flat.x, flat.y, PAD_TOP, rot);
      const fraction = s / this.route.length;
      this.stations.push({ index: k, fraction, sBulk: fraction * this.bulk.length, sExpress: fraction * this.express.length, rot, matrix, occupant: null, busy: 0 });
      this.placeStation(k, batch, prefabs[k]);
    });

    // Moving machinery: presses, crane heads, cannons, per lane.
    const build = this.stations[2];
    const test = this.stations[3];
    for (const lane of [LANE_OFFSET, -LANE_OFFSET]) {
      this.pressHeads.push(new Dyn(P.pistonHead(), new THREE.Matrix4().multiplyMatrices(build.matrix, new THREE.Matrix4().makeTranslation(lane * 0.4, 0, 0)), this.group));
      this.craneHeads.push(new Dyn(P.craneHead(), new THREE.Matrix4().multiplyMatrices(test.matrix, new THREE.Matrix4().makeTranslation(lane, 0, -2.4)), this.group));
      this.cannons.push(new Dyn(P.cannonBarrel(), new THREE.Matrix4().multiplyMatrices(test.matrix, new THREE.Matrix4().makeTranslation(Math.sign(lane) * 6, 1.4, 3)), this.group));
    }

    // Dock at the end of the belt.
    const endFlat = this.route.flatAt(this.route.length);
    const endTan = this.route.flatTangentAt(this.route.length - 1);
    batch.place(P.dock(zone), this.chart.matrix(endFlat.x, endFlat.y, PAD_TOP, Math.atan2(endTan.x, endTan.y)));

    // Scrap chutes on the express side of the two open stations, where rejected runs leave the line.
    const chute = new Prefab().box(2.4, 1.7, 2.8, M(0x23262d), 0, 0, 0).box(2.6, 0.3, 3, M(0x2f333d), 0, 1.7, 0).box(0.1, 1.2, 2, glowMat(zone, 0xff3b2f, 0.15, 2), 1.25, 0.2, 0);
    for (const k of [1, 3]) batch.place(chute, new THREE.Matrix4().multiplyMatrices(this.stations[k].matrix, new THREE.Matrix4().makeTranslation(-5.6, 0.0, 0)));
  }

  private buildDecor(batch: StaticBatch): void {
    const zone = this.zone.id;
    const c = this.chart;
    // Lamp posts along both sides of the route.
    for (let s = 6; s < this.route.length; s += 15) {
      const f = this.route.flatAt(s);
      const t = this.route.flatTangentAt(s);
      for (const side of [1, -1]) batch.placeOn(P.lamp(zone), c, f.x - t.y * 3.9 * side, f.y + t.x * 3.9 * side, PAD_TOP);
    }
    // Pipe racks bridging the rows, tank farm, generators and solar fields on the pad's margins.
    for (const x of [-30, 14]) batch.placeOn(P.pipeRack(10, zone), c, x, -5.5, PAD_TOP, 0);
    for (const x of [-20, 28]) batch.placeOn(P.pipeRack(10, zone), c, x, 5.5, PAD_TOP, 0);
    for (let i = 0; i < 4; i++) batch.placeOn(P.tank(0xb7bec9), c, 34 + (i % 2) * 5.5, -4.8 + Math.floor(i / 2) * 5.2, PAD_TOP);
    batch.placeOn(P.generator(zone), c, -34, 5.2, PAD_TOP, Math.PI / 2);
    batch.placeOn(P.generator(zone, 0x4a3d5c), c, 14, 5.8, PAD_TOP, 0);
    for (let i = 0; i < 5; i++) batch.placeOn(P.solarPanel(zone), c, -42 + i * 5, -16, PAD_TOP, 0);
    for (let i = 0; i < 4; i++) batch.placeOn(P.solarPanel(zone), c, 18 + i * 5, 16, PAD_TOP, Math.PI);
    // Rescue hut at the west end.
    const hutPos = new THREE.Vector2(-44, -5.5);
    batch.placeOn(P.hut(zone), c, hutPos.x, hutPos.y, PAD_TOP, 0);
    this.hutDoor.copy(c.point(hutPos.x, hutPos.y + 3.6, PAD_TOP));
    // The four-strong crew waits in front of the hut door.
    const crewLooks: [LookName, WorkStyle][] = [['hazmat', 'spray'], ['medic', 'sweep'], ['medic', 'sweep'], ['hazmat', 'spray']];
    crewLooks.forEach(([look, role], i) => {
      const x = -46 + i * 1.5;
      const home = c.point(x, -1.6, PAD_TOP);
      const m = c.matrix(x, -1.6, PAD_TOP, 0);
      this.crew.push({ look, role, home, homeFwd: new THREE.Vector3().setFromMatrixColumn(m, 2).normalize(), up: new THREE.Vector3().setFromMatrixColumn(m, 1).normalize(), path: null, s: 0, mode: 'home', speed: 7.5, phase: i * 1.7 });
    });
  }

  /** Two wall screens in the arena: metrics normally, the end credits when a run breaks. */
  private buildScreens(): void {
    const st = this.stations[3];
    for (const x of [-3.6, 3.6]) {
      const tv = new Tv(x < 0 ? 'metrics' : 'lab', 3.4);
      tv.group.matrixAutoUpdate = false;
      tv.group.matrix.multiplyMatrices(st.matrix, new THREE.Matrix4().makeTranslation(x, 2.3, 6.3).multiply(new THREE.Matrix4().makeRotationY(Math.PI)));
      this.group.add(tv.group);
      this.tvs.push(tv);
    }
  }

  private buildSign(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    this.signCtx = canvas.getContext('2d')!;
    this.signTex = new THREE.CanvasTexture(canvas);
    this.signTex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: this.signTex, emissiveMap: this.signTex, emissive: 0xffffff, emissiveIntensity: 0.5, side: THREE.DoubleSide });
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), mat);
    this.sign.matrixAutoUpdate = false;
    // Turned lines face the other way, so their sign is flipped back to face the viewer.
    const m = this.chart.matrix(-36, -17, PAD_TOP + 8, this.zone.yaw !== 0 ? Math.PI : 0);
    this.sign.matrix.copy(m);
    this.group.add(this.sign);
    // Two posts holding the sign up.
    this.setLabel(this.zone.label, null);
  }

  /** Forgets every real run (the line was reassigned to another repo). The belt itself keeps flowing. */
  resetRuns(): void {
    this.state = new FactoryState();
    this.state.lingerSeconds = 16;
    for (const e of this.ex.values()) e.mode = 'reject';
  }

  /** Changes the neon sign (and the line's name) without rebuilding anything. */
  setLabel(label: string, repo: string | null): void {
    this.label = label;
    this.repo = repo;
    const text = `${this.zone.index !== undefined ? this.zone.index + 1 : ''} · ${label}`.toUpperCase();
    if (!this.signCtx || !this.signTex || text === this.signText) return;
    this.signText = text;
    const c = this.signCtx;
    c.fillStyle = '#0a0612';
    c.fillRect(0, 0, 512, 128);
    c.strokeStyle = repo ? '#35e0ff' : '#ff4fa3';
    c.lineWidth = 6;
    c.strokeRect(6, 6, 500, 116);
    c.fillStyle = repo ? '#9ff3ff' : '#ff9ad0';
    c.font = '800 44px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const fit = text.length > 20 ? 34 : 44;
    c.font = `800 ${fit}px system-ui, sans-serif`;
    c.fillText(text, 256, 64);
    this.signTex.needsUpdate = true;
  }

  private populate(): void {
    const c = this.chart;
    const here = (k: number, x: number, z: number, faceX: number, look: LookName, style: WorkStyle): void => {
      const st = this.stations[k];
      const p = new THREE.Vector3(x, 0.55 - 0.55, z).applyMatrix4(st.matrix);
      const up = tmpV2.setFromMatrixColumn(st.matrix, 1).clone().normalize();
      const right = new THREE.Vector3().setFromMatrixColumn(st.matrix, 0).normalize();
      const fwd = new THREE.Vector3().setFromMatrixColumn(st.matrix, 2).normalize();
      // Face across the belt (toward x = 0) unless told otherwise.
      const dir = right.clone().multiplyScalar(faceX).normalize();
      this.workers.push({ pos: p, fwd: dir.lengthSq() ? dir : fwd, up, look, style, station: k, rank: Math.random(), phase: Math.random() * 6 });
    };
    // Crews beside each station, facing the belt.
    for (const [z, look] of [[-3, 'rice'], [0, 'rice'], [3, 'corn']] as const) here(0, 5.6, z, -1, look as LookName, 'load');
    here(0, -5.6, -2, 1, 'rice', 'load');
    for (const z of [-2, 2]) here(1, 5.9, z, -1, 'rice', 'polish');
    here(1, -5.9, 0, 1, 'basmati', 'clipboard');
    for (const z of [-3, 0, 3]) here(2, 5.8, z, -1, 'corn', 'hammer');
    for (const z of [-3, 3]) here(2, -5.8, z, 1, 'corn', 'hammer');
    for (const z of [-4, 0]) here(3, 8.8, z, -1, 'wheat', 'throw');
    for (const z of [-4, 0]) here(3, -8.8, z, 1, 'wheat', 'throw');
    here(3, 8.8, 5, -1, 'basmati', 'clipboard');
    for (const z of [-3, 0, 3]) here(4, 5.8, z, -1, 'rice', 'load');
    here(4, -5.8, 1, 1, 'rice', 'load');

    // Walkers on a rectangular walkway round the middle of the line, plus supervisors on a longer loop.
    const loop = SurfacePath.through(c, [[-30, -6], [10, -6], [32, -6], [32, 6], [10, 6], [-30, 6], [-30, -6]], PAD_TOP, false, 0.9);
    const looks: LookName[] = ['rice', 'corn', 'wheat', 'quinoa', 'millet', 'rice', 'quinoa', 'millet'];
    looks.forEach((look, i) => this.walkers.push({ path: loop, s: (i / looks.length) * loop.length, speed: look === 'quinoa' || look === 'millet' ? 2.6 : 1.5, look, phase: i * 1.3, dir: 1, carry: i % 3 === 0 }));
    this.walkers.push({ path: loop, s: 20, speed: 1.2, look: 'basmati', phase: 0, dir: -1, carry: false }, { path: loop, s: 120, speed: 1.2, look: 'basmati', phase: 2, dir: -1, carry: false });
  }

  /** Fills the belt with a plausible mid-shift spread so the line never starts empty. */
  private seedItems(): void {
    for (let s = 14; s < this.bulk.length - 4; s += 11 + Math.random() * 5) {
      const frac = s / this.bulk.length;
      let stage = 0;
      while (stage < STATIONS.length && frac > this.stations[stage].fraction + 0.01) stage++;
      const kind: ItemKind = stage <= 2 ? 'crate' : stage <= 3 ? 'box' : 'tested';
      this.items.push({ s, kind, stage, state: 'move', t: 0 });
    }
    this.items.sort((a, b) => b.s - a.s);
  }

  // --- simulation ---------------------------------------------------------------

  /** World position (on the belt) of the item at distance s on a lane. */
  private lanePos(path: SurfacePath, s: number, out: THREE.Vector3, tangent?: THREE.Vector3): THREE.Vector3 {
    path.at(Math.min(Math.max(s, 0), path.length), tmpS);
    out.copy(tmpS.pos).addScaledVector(tmpS.up, ITEM_LIFT);
    tangent?.copy(tmpS.tangent);
    return out;
  }

  update(env: Env, night: number): void {
    setGlow(this.zone.id, night);
    const act = this.repo ? Math.max(this.state.activity, 0.12) : 0.3;
    const speed = BELT_SPEED * (0.5 + 0.7 * act);
    this.belt.scroll(speed * env.dt);
    this.state.update(env.dt);
    this.updateBulk(env.dt, speed, act);
    this.updateExpress(env, speed * 1.5);
    this.updateCrew(env);
    this.smoke(env);
    if (env.camDist < 260) for (const tv of this.tvs) tv.update(this.state.mode, this.state.stats, env.elapsed);
    if (this.flash > 0) this.flash -= env.dt;
  }

  private updateBulk(dt: number, speed: number, act: number): void {
    const len = this.bulk.length;
    this.spawnTimer -= dt;
    const front = this.items[this.items.length - 1];
    const inDepot = this.stations[0].occupant;
    if (this.spawnTimer <= 0 && this.items.length < 22 && !inDepot && (!front || front.s > ITEM_GAP * 1.4)) {
      // Born inside the depot housing, where nothing can see it.
      const it: BulkItem = { s: 0, kind: 'crate', stage: 0, state: 'proc', t: 0 };
      this.items.push(it);
      this.stations[0].occupant = it;
      this.spawnTimer = THREE.MathUtils.lerp(9, 3.2, act);
    }
    // Front of the line first, so followers can see how far they may go.
    this.items.sort((a, b) => b.s - a.s);
    let ahead: BulkItem | null = null;
    for (const it of this.items) {
      const limit = ahead ? ahead.s - ITEM_GAP : Infinity;
      const st = it.stage < this.stations.length ? this.stations[it.stage] : null;
      if (it.state === 'proc' && st) {
        it.t += dt;
        st.busy = it.t;
        // Crates become boxes halfway through the press.
        if (it.stage === 2 && it.t > DWELL[2] * 0.5) it.kind = 'box';
        const service = it.stage === 3 ? 5 : DWELL[it.stage];
        if (it.t >= service) {
          it.state = 'move';
          it.t = 0;
          if (it.stage === 3) it.kind = 'tested';
          st.occupant = null;
          it.stage++;
        }
      } else {
        let ns = it.s + speed * dt;
        if (st) {
          const center = st.sBulk;
          if (it.s < center && ns >= center - 3.2) {
            // Approaching a station: wait at its entry if somebody is still inside.
            if (st.occupant && st.occupant !== it) ns = Math.min(ns, center - 3.2);
            else if (ns >= center) {
              ns = center;
              it.state = 'proc';
              it.t = 0;
              st.occupant = it;
            }
          }
        }
        it.s = Math.min(ns, limit, len);
      }
      ahead = it;
    }
    // Consumed inside the dock housing at the end of the line.
    this.items = this.items.filter((it) => it.s < len - 1.5 || it.state === 'proc');
  }

  private updateExpress(env: Env, speed: number): void {
    const len = this.express.length;
    for (const p of this.state.products) {
      if (!this.ex.has(p.id) && p.status === 'moving') {
        // A real run is born inside the depot housing, like everything else.
        this.ex.set(p.id, { product: p, s: this.stations[0].sExpress, stage: 0, mode: 'inside', to: 0, t: 0, kind: 'crate' });
      }
    }
    for (const [id, e] of this.ex) {
      const p = e.product;
      const alive = this.state.products.includes(p);
      e.t += env.dt;
      const st = this.stations[Math.min(e.stage, 4)];
      if (!alive && e.mode !== 'reject' && e.mode !== 'loaded') {
        e.mode = 'reject';
        e.t = 0;
      }
      switch (e.mode) {
        case 'inside': {
          p.cap = e.stage + 0.99;
          st.busy = e.t;
          if (e.stage === 2 && e.t > DWELL[2] * 0.5) e.kind = 'box';
          if (p.status === 'failed' && e.t > 3.5 + p.age * 0) {
            if (p.age > 4) {
              e.mode = 'reject';
              e.t = 0;
            }
          } else if (p.status === 'cancelled') {
            if (e.t > 1.4) {
              e.mode = 'reject';
              e.t = 0;
            }
          } else if (p.status === 'moving' && e.t >= DWELL[e.stage] && p.u >= e.stage + 0.95) {
            if (e.stage === 3) e.kind = 'tested';
            e.mode = 'travel';
            e.to = e.stage < 4 ? this.stations[e.stage + 1].sExpress : len - 0.5;
            e.t = 0;
          }
          break;
        }
        case 'travel': {
          e.s = Math.min(e.to, e.s + speed * env.dt);
          p.cap = e.stage + 0.99;
          if (p.status === 'cancelled' || p.status === 'failed') {
            // Stopped mid-belt: carry on to the next station before dealing with it.
          }
          if (e.s >= e.to) {
            if (e.stage < 4) {
              e.stage++;
              e.mode = 'inside';
              e.t = 0;
              if (p.status === 'cancelled') e.mode = 'inside';
            } else {
              // Waits inside the dock hood for a truck; the port releases it to the rocket.
              e.mode = 'loaded';
              e.t = 0;
              p.cap = 4.99;
            }
          }
          break;
        }
        case 'reject':
          // Slides into the scrap chute at the station (hidden by its cover), then is gone.
          if (e.t > 1.8) this.ex.delete(id);
          break;
        case 'loaded':
          // Hidden in the dock hood until the port's truck collects it.
          p.cap = 4.99;
          if (e.collected || p.status === 'launching' || !alive) this.ex.delete(id);
          break;
      }
    }
  }

  private smoke(env: Env): void {
    if (env.camDist > 260) return;
    const build = this.stations[2];
    const busy = this.state.activity > 0.05 || this.ex.size > 0;
    this.smokeAcc += env.dt * (busy ? 5 : 1.5);
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      tmpP.set(3.4, 12.8, -3.6).applyMatrix4(build.matrix);
      tmpV.copy(tmpP).normalize();
      env.fx.emit(tmpP, tmpV2.copy(tmpV).multiplyScalar(2.2).add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)), { color: 0x9aa1ab, size0: 1.0, size1: 4.5, life: 3.4, alpha: 0.42, drag: 0.3 });
    }
    // Failure: black smoke at the station where the real run broke.
    for (const p of this.state.products) {
      if (p.status !== 'failed') continue;
      const st = this.stations[Math.min(p.failAt ?? 0, 4)];
      for (let i = 0; i < 2; i++) {
        tmpP.set((Math.random() - 0.5) * 3, 4.5, (Math.random() - 0.5) * 3).applyMatrix4(st.matrix);
        tmpV.copy(tmpP).normalize();
        env.fx.emit(tmpP, tmpV2.copy(tmpV).multiplyScalar(3).add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)), { color: 0x24252a, size0: 1.2, size1: 5.5, life: 3, alpha: 0.7, drag: 0.4 });
      }
    }
  }

  // --- rescue crew -------------------------------------------------------------

  /** Walking route from the hut to a spot beside station k. */
  private crewPath(k: number, slot: number): SurfacePath {
    const st = this.stations[k];
    const s = st.fraction * this.route.length;
    const f = this.route.flatAt(s);
    const t = this.route.flatTangentAt(Math.min(s, this.route.length - 1));
    const x = CREW_X[k];
    const spot = new THREE.Vector2(f.x + t.y * x + t.x * (slot - 1.5) * 1.5, f.y - t.x * x + t.y * (slot - 1.5) * 1.5);
    const walkZ = spot.y < 0 ? -5.4 : 5.4;
    return SurfacePath.through(this.chart, [[-44.5, -1.6], [-40, walkZ], [spot.x, walkZ], [spot.x, spot.y]], PAD_TOP, false, 0.7);
  }

  private updateCrew(env: Env): void {
    // The incident lasts as long as the broken run does, even after its box has been cleared away.
    const failing = this.state.products.find((p) => p.status === 'failed');
    const stage = failing ? Math.min(failing.failAt ?? 0, 4) : 0;
    this.incident = failing ? tmpP.set(0, 1.4, 0).applyMatrix4(this.stations[stage].matrix).clone() : null;
    this.crew.forEach((c, i) => {
      if (failing && c.mode === 'home' && failing.age > 0.8 + i * 0.5) {
        c.path = this.crewPath(stage, i);
        c.s = 0;
        c.mode = 'out';
      } else if (!failing && (c.mode === 'work' || c.mode === 'out')) {
        c.mode = 'back';
      }
      if (c.mode === 'out' && c.path) {
        c.s += c.speed * env.dt;
        if (c.s >= c.path.length) {
          c.s = c.path.length;
          c.mode = 'work';
        }
      } else if (c.mode === 'back' && c.path) {
        c.s -= c.speed * env.dt;
        if (c.s <= 0) {
          c.s = 0;
          c.mode = 'home';
          c.path = null;
        }
      }
      if (c.mode === 'work' && c.role === 'spray' && this.incident && env.camDist < 220 && Math.random() < env.dt * 50) {
        c.path?.at(c.s, tmpS);
        tmpP.copy(tmpS.pos).addScaledVector(tmpS.up, 1.1);
        tmpV.copy(this.incident).sub(tmpP).normalize().multiplyScalar(5.5);
        tmpV.x += (Math.random() - 0.5) * 1.2;
        tmpV.y += (Math.random() - 0.3) * 1.2;
        tmpV.z += (Math.random() - 0.5) * 1.2;
        env.fx.emit(tmpP, tmpV, { color: 0xffffff, size0: 0.25, size1: 0.9, life: 0.7, alpha: 0.85, drag: 0.3 });
      }
    });
  }

  // --- drawing -----------------------------------------------------------------

  /** Pushes this line's items and workers into the shared instanced renderers, and poses its machinery. */
  draw(env: Env, pools: Pools): void {
    const near = env.camDist < 320;
    const m = tmpM;
    const dir = tmpV;
    // Ambient items.
    for (const it of this.items) {
      if (it.state === 'proc' && STATIONS[it.stage]?.hidden) continue;
      const hiddenInside = it.state === 'proc' && STATIONS[it.stage]?.hidden;
      if (hiddenInside) continue;
      this.lanePos(this.bulk, it.s, tmpP, dir);
      this.path(this.bulk, it.s);
      const st = it.state === 'proc' && it.stage === 3 ? this.stations[3] : null;
      let scaleY = 1;
      if (st) {
        const pose = testPose(Math.min(1, it.t / 5));
        this.applyPose(tmpP, tmpS, pose.dy, pose.dz, 1);
        scaleY = pose.scaleY;
      }
      surfaceMatrix(tmpP, tmpS.tangent, tmpS.up, m);
      if (scaleY !== 1) m.scale(new THREE.Vector3(1, scaleY, 1));
      (it.kind === 'crate' ? pools.crates : pools.boxes).push(m, TINT[it.kind]);
    }
    // Real runs on the express lane.
    for (const e of this.ex.values()) this.drawExpress(e, pools);
    this.poseMachinery(env);
    if (near) this.drawCrowd(env, pools);
  }

  private path(p: SurfacePath, s: number): void {
    p.at(Math.min(Math.max(s, 0), p.length), tmpS);
  }

  /** Lifts and nudges an item for the test choreography, in the lane's own frame. */
  private applyPose(pos: THREE.Vector3, sample: PathSample, dy: number, dz: number, side: number): void {
    pos.addScaledVector(sample.up, dy);
    tmpV2.crossVectors(sample.up, sample.tangent).normalize();
    pos.addScaledVector(tmpV2, dz * side);
  }

  private expressInside(e: Express): boolean {
    return e.mode === 'inside' && !!STATIONS[e.stage]?.hidden && e.stage !== 1 && e.stage !== 3;
  }

  private drawExpress(e: Express, pools: Pools): void {
    if (e.mode === 'loaded') return;
    if (this.expressInside(e)) return;
    const p = e.product;
    this.lanePos(this.express, e.s, tmpP, tmpV);
    this.path(this.express, e.s);
    let scaleY = 1;
    if (e.mode === 'inside' && e.stage === 3) {
      // The real run is put through its paces in the arena, looping while the real tests run.
      const phase = (e.t % 9) / 9;
      const pose = testPose(phase);
      this.applyPose(tmpP, tmpS, pose.dy, pose.dz, -1);
      scaleY = pose.scaleY;
    }
    if (e.mode === 'reject') {
      tmpV2.crossVectors(tmpS.up, tmpS.tangent).normalize();
      tmpP.addScaledVector(tmpV2, -Math.min(1, e.t / 1.1) * 4.4);
    }
    surfaceMatrix(tmpP, tmpS.tangent, tmpS.up, tmpM);
    if (scaleY !== 1) tmpM.scale(new THREE.Vector3(1, scaleY, 1));
    const tint = p.status === 'failed' ? TINT.failed : p.status === 'cancelled' ? TINT.cancelled : TINT[e.kind];
    (e.kind === 'crate' ? pools.crates : pools.boxes).push(tmpM, tint);
  }

  private poseMachinery(env: Env): void {
    const t = env.elapsed;
    // Presses: one per lane, stamping whenever an item is inside the build housing.
    const build = this.stations[2];
    const bulkIn = build.occupant;
    const exIn = [...this.ex.values()].find((e) => e.stage === 2 && e.mode === 'inside');
    const pressCycle = (inside: boolean, tin: number): number => (inside ? Math.max(0, Math.sin(tin * 4.2)) : 0);
    this.pressHeads[0].set(new THREE.Matrix4().makeTranslation(0, 8.3 - 5.6 * pressCycle(!!bulkIn, bulkIn?.t ?? 0), 0));
    this.pressHeads[1].set(new THREE.Matrix4().makeTranslation(0, 8.3 - 5.6 * pressCycle(!!exIn, exIn?.t ?? 0), 0));

    // Arena crane heads, cannons and the cannon ball.
    const test = this.stations[3];
    const bulkTest = test.occupant;
    const exTest = [...this.ex.values()].find((e) => e.stage === 3 && e.mode === 'inside');
    const lanes: { phase: number | null; id: number }[] = [
      { phase: bulkTest ? Math.min(1, bulkTest.t / 5) : null, id: 0 },
      { phase: exTest ? (exTest.t % 9) / 9 : null, id: 1 },
    ];
    this.ball.mesh.visible = false;
    for (const lane of lanes) {
      const pose = lane.phase === null ? null : testPose(lane.phase);
      const headY = (pose ? pose.headY : HEAD_UP) + 0.5;
      this.craneHeads[lane.id].set(new THREE.Matrix4().makeTranslation(0, headY - 0.35, 0));
      const prev = this.prevPhase.get(lane.id) ?? -1;
      let recoil = 0;
      if (pose && lane.phase !== null) {
        if (prev < SHOT_PHASE && lane.phase >= SHOT_PHASE) this.flash = 0.25;
        if (lane.phase >= SHOT_PHASE && lane.phase < SHOT_PHASE + 0.08) recoil = 1 - (lane.phase - SHOT_PHASE) / 0.08;
        if (pose.ballT !== null && lane.id === 1) {
          // Visible cannonball flight for the real run's cell.
          const from = tmpP.set(6 * -1, 1.4 + 1.2, 3).applyMatrix4(test.matrix).clone();
          const to = tmpV.set(-LANE_OFFSET, 1.3, 0).applyMatrix4(test.matrix).clone();
          const b = from.lerp(to, pose.ballT);
          b.addScaledVector(b.clone().normalize(), Math.sin(pose.ballT * Math.PI) * 0.8);
          this.ball.mesh.visible = true;
          this.ball.mesh.matrix.makeTranslation(b.x, b.y, b.z);
        }
        if (prev < IMPACT_PHASE && lane.phase >= IMPACT_PHASE && env.camDist < 200) {
          const at = tmpP.set(lane.id === 0 ? LANE_OFFSET : -LANE_OFFSET, 1.4, 0).applyMatrix4(test.matrix);
          const up = tmpV.copy(at).normalize();
          env.fx.burst(at.clone(), 10, 3, 2, up, { color: 0xe8dcc0, size0: 0.3, size1: 0.9, life: 0.7, alpha: 0.9, gravity: -3 });
        }
        this.prevPhase.set(lane.id, lane.phase);
      } else {
        this.prevPhase.set(lane.id, -1);
      }
      const sgn = lane.id === 0 ? 1 : -1;
      this.cannons[lane.id].set(new THREE.Matrix4().makeTranslation(0, 0, -recoil * 0.4).multiply(new THREE.Matrix4().makeRotationZ(sgn * 1.3)).multiply(new THREE.Matrix4().makeRotationX(-0.3)));
    }
    void t;
  }

  private drawCrowd(env: Env, pools: Pools): void {
    const act = this.repo ? this.state.activity : 0.3;
    const g: GrainPose = { pos: tmpP, forward: tmpV, up: tmpV2, look: LOOKS.rice, armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, lean: 0, roll: 0 };
    const t = env.elapsed;
    for (const w of this.workers) {
      const engaged = w.rank < 0.35 + 0.65 * act;
      const limbs = engaged ? workLimbs(w.style, t, w.phase) : IDLE_LIMBS(t, w.phase);
      g.pos = w.pos;
      g.forward = w.fwd;
      g.up = w.up;
      g.look = LOOKS[w.look];
      Object.assign(g, limbs);
      pools.crowd.draw(g);
    }
    const gp = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
    for (const c of this.crew) {
      g.look = LOOKS[c.look];
      if (c.mode === 'home') {
        g.pos = c.home;
        g.forward = c.homeFwd;
        g.up = c.up;
        Object.assign(g, IDLE_LIMBS(t, c.phase));
      } else if (c.path) {
        c.path.at(c.s, gp);
        g.pos = gp.pos;
        g.up = gp.up;
        const away = c.mode === 'back';
        g.forward = away ? tmpV2.copy(gp.tangent).negate().clone() : gp.tangent;
        if (c.mode === 'work' && this.incident) g.forward = tmpV2.copy(this.incident).sub(gp.pos).normalize().clone();
        Object.assign(g, c.mode === 'work' ? workLimbs(c.role, t, c.phase) : walkLimbs(t * 14 + c.phase, 7));
      }
      pools.crowd.draw(g);
    }
    for (const w of this.walkers) {
      w.s = (w.s + w.speed * env.dt * w.dir + w.path.length) % w.path.length;
      w.path.at(w.s, gp);
      const limbs = walkLimbs(t * w.speed * 3.2 + w.phase, w.speed, w.carry);
      g.pos = gp.pos;
      g.forward = w.dir === 1 ? gp.tangent : tmpV2.copy(gp.tangent).negate().clone();
      g.up = gp.up;
      g.look = LOOKS[w.look];
      Object.assign(g, limbs);
      pools.crowd.draw(g);
    }
  }

  /** Screen picking: world position of each real run's item. */
  pickables(): { key: string; pos: THREE.Vector3 }[] {
    const out: { key: string; pos: THREE.Vector3 }[] = [];
    for (const e of this.ex.values()) {
      if (e.mode === 'loaded') continue;
      this.lanePos(this.express, e.s, tmpP);
      out.push({ key: e.product.key, pos: tmpP.clone() });
    }
    return out;
  }

  /** A real run waiting inside the dock hood for a truck, if any. */
  waitingAtDock(): Product | null {
    for (const e of this.ex.values()) if (e.mode === 'loaded' && !e.collected && e.product.status === 'moving') return e.product;
    return null;
  }

  /** A truck has taken the waiting run; the line forgets its box. */
  collectFromDock(): void {
    for (const e of this.ex.values()) if (e.mode === 'loaded') e.collected = true;
  }

  /** Where the dock apron is (the truck waiting spot) and which way the belt points there. */
  dockPose(): { pos: THREE.Vector3; forward: THREE.Vector3; up: THREE.Vector3; chartX: number; chartZ: number } {
    const endFlat = this.route.flatAt(this.route.length);
    const tan = this.route.flatTangentAt(this.route.length - 1);
    const x = endFlat.x + tan.x * 11;
    const z = endFlat.y + tan.y * 11;
    const m = this.chart.matrix(x, z, PAD_TOP, Math.atan2(tan.x, tan.y));
    return {
      pos: new THREE.Vector3().setFromMatrixPosition(m),
      forward: new THREE.Vector3().setFromMatrixColumn(m, 2).normalize(),
      up: new THREE.Vector3().setFromMatrixColumn(m, 1).normalize(),
      chartX: x,
      chartZ: z,
    };
  }

  /** Where this line's supply belt arrives: the depot's belt position, plus a spot outside the pad to come from. */
  supply(): { entry: THREE.Vector3; outside: (h: number) => THREE.Vector3; ramp: (x: number, h: number) => THREE.Vector3 } {
    return {
      entry: this.chart.point(-38, -11, BELT_HEIGHT),
      outside: (h: number) => this.chart.point(-60, -11, h),
      ramp: (x: number, h: number) => this.chart.point(x, -11, h),
    };
  }

  get stationCount(): number {
    return STAGES.length;
  }
}
