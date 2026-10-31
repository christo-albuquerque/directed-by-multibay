import * as THREE from 'three';
import { SurfacePath, type PathSample } from '../../globe/path';
import { Chart } from '../../globe/surface';
import type { Zone } from '../../globe/zones';
import { zoneChart } from '../../globe/zones';
import { Tv } from '../../scene/Tv';
import { sfx } from '../../ui/sfx';
import { FactoryState, type Product } from '../../sim/factory';
import { STAGES } from '../../sim/stages';
import { BeltSurface, beltSupports, ribbonMesh } from '../belts';
import { IDLE_LIMBS, LOOKS, walkLimbs, workLimbs, type GrainPose, type LookName, type WorkStyle } from '../crowd';
import { Folk, Net, type AgentSpec, type Poi, type Pt } from '../folk';
import { buildPlaza, cratePile } from './plaza';
import { TestLab, TEST_SECONDS, launcherPrefab } from './testlab';
import { forkliftBody, forkliftForks, funnel, tubeHatch } from './props';
import { hasCacheHit, matrixWidth } from '../../sim/runs';
import { M, Prefab, StaticBatch, glowMat, setGlow } from '../kit';
import { Dyn } from '../dyn';
import { surfaceMatrix } from '../pools';
import type { Env, Pools } from '../types';
import { APRON, BELT_HEIGHT, BELT_SPEED, ITEM_GAP, ITEM_LIFT, LANE_OFFSET, ROUTE, STATIONS, STATION_GAP } from './layout';
import * as P from './prefabs';

const PAD_TOP = 0.35;

type ItemKind = 'crate' | 'box' | 'tested';

interface BulkItem {
  s: number;
  kind: ItemKind;
  stage: number;
  state: 'move' | 'proc';
  t: number;
  /** Which test it gets in the testing grounds. */
  v?: number;
}

interface Station {
  index: number;
  fraction: number;
  /** Arc length of the station's centre on each lane. */
  sBulk: number;
  sExpress: number;
  rot: number;
  /** Chart position of the station's centre. */
  fx: number;
  fz: number;
  matrix: THREE.Matrix4;
  occupant: BulkItem | null;
  /** Seconds the station's last item has been inside; drives its machinery. */
  busy: number;
}

type ExpressMode = 'inside' | 'travel' | 'reject' | 'loaded';

interface Express {
  collected?: boolean;
  stamped?: boolean;
  /** Which test it gets in the testing grounds. */
  v?: number;
  product: Product;
  s: number;
  stage: number;
  mode: ExpressMode;
  /** Travel destination (arc length). */
  to: number;
  t: number;
  kind: ItemKind;
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

const tmpS: PathSample = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpP2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpM2 = new THREE.Matrix4();
/** Who pushes the trolley at each room. */
const PORTER_LOOK: LookName[] = ['rice', 'basmati', 'corn', 'wheat', 'rice'];

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
  /** Runs already handed to the port: their visual is gone, so it must not be re-created. */
  private dispatched = new Set<number>();
  /** The crowd that lives on this line: workers, haulers, repairers and everyone on a break. */
  folk!: Folk;
  private stamp!: Dyn;
  private lab!: TestLab;
  private testCounter = 0;
  private fx?: Env['fx'];
  private funnelPos = new THREE.Vector3();
  private lift?: { body: Dyn; forks: Dyn; crate: Dyn; t: number; bay: 0 | 1; running: boolean };
  private dockMatrix = new THREE.Matrix4();
  /** Which of the dock apron's two bays has a truck parked in it (set by the port). */
  readonly bays: [boolean, boolean] = [false, false];
  private zipped = new Set<number>();
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
  private flash = 0;
  /** World position of this line's rescue hut door, for crew to leave from. */
  private hutDoor = new THREE.Vector3();
  private crew: Crew[] = [];
  private tvs: Tv[] = [];
  /** Where the current incident is, for the shared red warning light (null when all is well). */
  incident: THREE.Vector3 | null = null;
  incidentStation = -1;

  constructor(zone: Zone, batch: StaticBatch) {
    this.zone = zone;
    // The world is big: wreckage stays long enough for the rescue crew to arrive and work.
    this.state.lingerSeconds = 16;
    this.chart = zoneChart(zone);
    this.route = SurfacePath.through(this.chart, ROUTE, BELT_HEIGHT, false, 0.9);
    this.bulk = this.route.offset(LANE_OFFSET);
    this.express = this.route.offset(-LANE_OFFSET);

    this.buildStations(batch);
    this.buildBelts(batch);
    this.buildDecor(batch);
    this.buildScreens();
    this.buildSign();
    this.ball = new Dyn(new Prefab().sphere(0.28, M(0x111318), 0, 0, 0), new THREE.Matrix4(), this.group);
    this.ball.mesh.visible = false;
    const stampPrefab = new Prefab().box(1.4, 0.35, 1.4, M(0xc0271d), 0, 0.6, 0).box(1.2, 0.1, 0.35, M(0xffffff), 0, 0.96, 0).cyl(0.12, 0.12, 0.7, M(0x3b2a1f), 0, 0.95, 0, 8).sphere(0.28, M(0x3b2a1f), 0, 1.7, 0, 1, 8);
    this.stamp = new Dyn(stampPrefab, new THREE.Matrix4(), this.group);
    this.stamp.mesh.visible = false;
    this.populate(batch);
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
      this.stations.push({ index: k, fraction, sBulk: fraction * this.bulk.length, sExpress: fraction * this.express.length, rot, fx: flat.x, fz: flat.y, matrix, occupant: null, busy: 0 });
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

    // The testing grounds' crew and their four tests, with a mini rocket launcher on each side.
    this.lab = new TestLab(test.matrix, this.group);
    for (const sx of [1, -1]) batch.place(launcherPrefab(), new THREE.Matrix4().multiplyMatrices(test.matrix, new THREE.Matrix4().makeTranslation(sx * 5.8, 0, -7.1)));
    // The overhead crane is retired: nobody touches the boxes with it any more, grains carry them.
    for (const c of this.craneHeads) c.mesh.visible = false;

    // Dock at the end of the belt.
    const endFlat = this.route.flatAt(this.route.length);
    const endTan = this.route.flatTangentAt(this.route.length - 1);
    batch.place(P.dock(zone), this.chart.matrix(endFlat.x, endFlat.y, PAD_TOP, Math.atan2(endTan.x, endTan.y)));

    // Scrap chutes on the express side of the two open stations, where rejected runs leave the line.
    const chute = new Prefab().box(2.4, 1.7, 2.8, M(0x23262d), 0, 0, 0).box(2.6, 0.3, 3, M(0x2f333d), 0, 1.7, 0).box(0.1, 1.2, 2, glowMat(zone, 0xff3b2f, 0.15, 2), 1.25, 0.2, 0);
    for (const k of [1, 3]) batch.place(chute, new THREE.Matrix4().multiplyMatrices(this.stations[k].matrix, new THREE.Matrix4().makeTranslation(-5.6, 0.0, 0)));
  }

  /** Belt pieces between the rooms: every belt ends at a room's door and restarts beyond its exit door. */
  private buildBelts(batch: StaticBatch): void {
    const lanes: [SurfacePath, number[]][] = [[this.bulk, this.stations.map((s) => s.sBulk)], [this.express, this.stations.map((s) => s.sExpress)]];
    for (const [lane, centres] of lanes) {
      let from = 0;
      centres.forEach((c, k) => {
        const inner = STATION_GAP[k].h + APRON;
        if (c - inner > from + 1) this.group.add(ribbonMesh(lane, 0.95, this.belt.mat, 0, from, c - inner));
        from = Math.max(from, c + inner);
      });
      this.group.add(ribbonMesh(lane, 0.95, this.belt.mat, 0, from, lane.length));
    }
    const gaps: [number, number][] = this.stations.map((s, k) => {
      const c = s.fraction * this.route.length;
      const inner = STATION_GAP[k].h + APRON;
      return [c - inner, c + inner];
    });
    beltSupports(batch, this.route, 4.2, LANE_OFFSET + 1.15, gaps);
  }

  /**
   * Items cross a room on a trolley: a porter waits at the door, the crate hops on at the belt's end, they go in (hidden
   * if the room is hooded), and come out of the exit door where the crate is put back on the belt. Returns `'hide'`
   * when the item is inside a hooded room, or how far to lower the item onto the trolley deck.
   */
  private handoff(lane: 'bulk' | 'express', s: number, moving: boolean, pools: Pools, env: Env, look: LookName): number | 'hide' {
    const path = lane === 'bulk' ? this.bulk : this.express;
    for (let k = 0; k < this.stations.length; k++) {
      const st = this.stations[k];
      const c = lane === 'bulk' ? st.sBulk : st.sExpress;
      const { h, hood } = STATION_GAP[k];
      const inner = h + APRON;
      const d = s - c;
      if (d < -(inner + 3.2) || d > inner + APRON + 0.3) continue;
      if (d < -inner) {
        // The porter steps out of the door to meet the crate.
        if (moving) {
          const f = THREE.MathUtils.clamp((d + inner + 3.2) / 2.2, 0, 1);
          this.drawCarrier(path, THREE.MathUtils.lerp(c - h, c - inner + 0.7, f), 1, true, pools, env, look, true);
        }
        return 0;
      }
      if (d <= inner) {
        if (hood && Math.abs(d) < h) return 'hide';
        this.drawCarrier(path, s, 1, false, pools, env, look, moving);
        return 0.2;
      }
      // Past the exit door: the porter turns round and walks back in.
      if (moving) {
        const back = THREE.MathUtils.clamp((d - inner) / APRON, 0, 1);
        const at = c + inner - back * APRON;
        if (at > c + h + 0.05) this.drawCarrier(path, at - 1.05, -1, false, pools, env, look, true, true);
      }
      return 0;
    }
    return 0;
  }

  /** A trolley (and its porter, when `porter`) at distance s along a lane. `face` is the way the porter is walking. */
  private drawCarrier(path: SurfacePath, s: number, face: 1 | -1, waiting: boolean, pools: Pools, env: Env, look: LookName, porter: boolean, returning = false): void {
    path.at(Math.min(Math.max(s, 0), path.length), tmpS);
    const drop = BELT_HEIGHT - PAD_TOP;
    tmpV2.copy(tmpS.up);
    tmpP2.copy(tmpS.pos).addScaledVector(tmpV2, -drop);
    tmpV3.copy(tmpS.tangent).multiplyScalar(waiting || returning ? -face : face);
    surfaceMatrix(tmpP2, tmpV3, tmpV2, tmpM2);
    pools.trolleys.push(tmpM2);
    if (!porter) return;
    // The porter stands behind the trolley (or beyond it, when waiting for the crate).
    const behind = waiting || returning ? 1.1 : -1.1;
    const p = tmpP2.clone().addScaledVector(tmpS.tangent, behind);
    void face;
    const g: GrainPose = { pos: p, forward: tmpV3, up: tmpV2, look: LOOKS[look], armL: -1.2, armR: -1.2, legL: 0, legR: 0, bob: 0, lean: 0.1, roll: 0 };
    Object.assign(g, walkLimbs(env.elapsed * 9 + path.length, 2.2));
    g.armL = g.armR = -1.2;
    pools.crowd.draw(g);
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
    // Five screens on the side walls, facing into the room and clear of the belt's exit path.
    const st = this.stations[3];
    const spots: [number, number, number][] = [[-7.05, 3.0, -3.8], [-7.05, 3.0, 3.8], [7.05, 3.0, -3.8], [7.05, 3.0, 3.8], [7.05, 5.4, 0]];
    spots.forEach(([x, y, z], i) => {
      const tv = new Tv(i % 2 === 0 ? 'metrics' : 'lab', 3.2);
      tv.group.matrixAutoUpdate = false;
      // A screen faces +z by default: turn it to face the middle of the room.
      tv.group.matrix.multiplyMatrices(st.matrix, new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(x < 0 ? Math.PI / 2 : -Math.PI / 2)));
      this.group.add(tv.group);
      this.tvs.push(tv);
    });
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
    this.dispatched.clear();
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

  private populate(batch: StaticBatch): void {
    const zone = this.zone.id;
    // Walkways: two long rows between the belts, linked at both ends, with a gate out to the break plaza.
    const net = new Net();
    const xs = [-30, -20, -10, 0, 10, 20, 32];
    const rowN = xs.map((x) => net.node(x, -6));
    const rowS = xs.map((x) => net.node(x, 6));
    for (let i = 1; i < xs.length; i++) {
      net.link(rowN[i - 1], rowN[i]);
      net.link(rowS[i - 1], rowS[i]);
    }
    net.link(rowN[0], rowS[0]);
    net.link(rowN[6], rowS[6]);
    const gate = net.node(46, 6);
    const yard = net.node(50, -3);
    net.link(rowS[6], gate);
    net.link(gate, yard);
    const folk = (this.folk = new Folk(this.chart, PAD_TOP, net, zone));
    for (const [z, x0, x1] of [[-11, -38, 35], [0, -37, 34], [11, -37, 36]] as const) folk.addBelt(x0, x1, z);

    // Break plaza on the avenue side of the pad, with its seats as errands.
    const PLAZA: Pt = { x: 53, z: -8.5 };
    const seats = buildPlaza(batch, this.chart, zone, PLAZA.x, PLAZA.z);
    net.link(yard, net.node(PLAZA.x, PLAZA.z + 1));

    // Where a worker stands: beside station k, `x` to its left and `z` along the belt (near side of the walkway).
    const st = (k: number, lx: number, lz: number): Pt => {
      const s = this.stations[k];
      const c = Math.cos(s.rot);
      const n = Math.sin(s.rot);
      return { x: s.fx + lx * c + lz * n, z: s.fz - lx * n + lz * c };
    };
    const faceBelt = (k: number, lx: number): number => {
      const s = this.stations[k];
      const dir = -Math.sign(lx);
      return Math.atan2(dir * Math.cos(s.rot), -dir * Math.sin(s.rot));
    };
    // Row 1 stations are worked from their near (right-hand) side, row 3 from the left.
    const side = (k: number, mag: number): number => (k <= 2 ? -mag : k === 4 ? mag : mag);

    // Chore spots: crate piles to shuttle between, machinery to fix, and floors to sweep.
    const piles: Poi[] = [];
    for (const [x, z] of [[-22, -3.4], [24, -3.4], [-24, 3.6], [26, 3.6]] as const) {
      piles.push({ x, z, face: 0, style: 'pack', dur: [0.5, 0.8], kind: 'haul', pile: true });
      batch.placeOn(cratePile(), this.chart, x + (z < 0 ? 0 : 0), z + (z < 0 ? -1.4 : 1.4), PAD_TOP, Math.PI * 0.2);
    }
    const fixes: Poi[] = [
      { x: -30, z: -2.8, face: Math.PI, style: 'repair', dur: [8, 16], kind: 'maint' },
      { x: 14, z: -2.8, face: Math.PI, style: 'repair', dur: [8, 16], kind: 'maint' },
      { x: -34, z: 3.2, face: 0, style: 'repair', dur: [8, 16], kind: 'maint' },
      { x: 14, z: 3.4, face: 0, style: 'repair', dur: [8, 16], kind: 'maint' },
      { x: 33, z: -2.6, face: Math.PI * 0.5, style: 'repair', dur: [6, 12], kind: 'maint' },
    ];
    const sweeps: Poi[] = [-24, -8, 8, 24].map((x, i) => ({ x, z: i % 2 ? 6 : -6, face: Math.PI * 0.5, style: 'sweep' as WorkStyle, dur: [8, 16] as [number, number], kind: 'maint' as const }));
    const inspects: Poi[] = [0, 1, 2, 3, 4].map((k) => {
      const p = st(k, side(k, 5.4), 0);
      return { x: p.x, z: p.z, face: faceBelt(k, side(k, 5.4)), style: 'inspect' as WorkStyle, dur: [6, 12] as [number, number], kind: 'maint' as const };
    });

    const post = (k: number, lx: number, lz: number, style: WorkStyle): Poi => {
      const lat = lx < 0 && k === 3 ? lx : side(k, Math.abs(lx));
      const p = st(k, lat, lz);
      return { x: p.x, z: p.z, face: faceBelt(k, lat), style, dur: [1, 1], kind: 'post' };
    };
    const add = (look: LookName, p: Poi, extra: Partial<AgentSpec> = {}): void => {
      // Station crews stay with their room while they work: they only leave for a break at the plaza.
      folk.add({ look, post: p, errands: seats, lazy: 0.35, ...extra });
    };
    // Crews beside each station, facing the belt.
    for (const [lz, look] of [[-3, 'rice'], [0, 'rice'], [3, 'corn']] as const) add(look, post(0, 5.6, lz, 'load'));
    add('rice', post(0, 5.6, -5, 'load'));
    for (const lz of [-2, 2]) add('rice', post(1, 5.9, lz, 'polish'));
    add('basmati', post(1, -5.9, 0, 'clipboard'));
    for (const lz of [-3, 0, 3]) add('corn', post(2, 5.8, lz, 'hammer'));
    for (const lz of [-3, 3]) add('corn', post(2, -5.8, lz, 'hammer'));
    // The supervisor stays inside the testing grounds (the other testers are the lab's own crew).
    folk.add({ look: 'basmati', post: post(3, 6.0, 6.8, 'clipboard'), errands: [], lazy: 0 });
    for (const lz of [-3, 0, 3]) add('rice', post(4, 5.8, lz, 'load'));
    add('rice', post(4, 5.8, 5, 'load'));
    // Couriers on scooters and millet runners shuttle crates between the piles all day.
    const couriers: LookName[] = ['quinoa', 'quinoa', 'millet', 'millet', 'quinoa'];
    couriers.forEach((look, i) => folk.add({ look, post: piles[i % piles.length], errands: piles, lazy: 0, courier: look === 'quinoa' }));
    // Maintenance crews and inspectors have their own beat.
    for (const [i, look] of (['corn', 'rice', 'basmati', 'basmati'] as LookName[]).entries()) {
      const home = i < 2 ? fixes[i] : inspects[i + 0];
      folk.add({ look, post: home, errands: i < 2 ? [...fixes, ...sweeps] : inspects, lazy: 0.2 });
    }
    // A few people are always on a break at the plaza, whatever the workload.
    for (let i = 0; i < 6; i++) {
      const seat = seats[(i * 3) % seats.length];
      seat.taken = true;
      const looks: LookName[] = ['rice', 'corn', 'millet', 'wheat', 'quinoa', 'rice'];
      folk.add({ look: looks[i], post: { ...seat, kind: 'post' }, errands: [...fixes, ...piles], lazy: 0.9 });
    }

    // Pneumatic cache tube at the depot: couriers zip out of it on a cache hit.
    folk.zipSpot = inspects[0];
    batch.placeOn(tubeHatch(zone), this.chart, inspects[0].x + 1.6, inspects[0].z, PAD_TOP, 0);
    // Hazmat funnel beside the rescue hut, where the crew dump swept-up debris.
    this.funnelPos = this.chart.point(-39.2, -3.6, PAD_TOP + 2.4);
    batch.placeOn(funnel(zone), this.chart, -39.2, -3.6, PAD_TOP, 0);
    // A forklift loads the trucks parked on the dock apron.
    this.buildForklift(batch);
  }

  /**
   * The dock apron has two parking bays side by side. A forklift works the aisle between them: it picks a crate from the
   * pile by the hood door, drives down the aisle, turns to the truck parked in a bay and sets the crate in its bed.
   */
  private buildForklift(batch: StaticBatch): void {
    const endFlat = this.route.flatAt(this.route.length);
    const endTan = this.route.flatTangentAt(this.route.length - 1);
    this.dockMatrix = this.chart.matrix(endFlat.x, endFlat.y, PAD_TOP, Math.atan2(endTan.x, endTan.y));
    batch.place(cratePile(), new THREE.Matrix4().multiplyMatrices(this.dockMatrix, new THREE.Matrix4().makeTranslation(0, 0, 5.2)));
    this.lift = { body: new Dyn(forkliftBody(), new THREE.Matrix4(), this.group), forks: new Dyn(forkliftForks(), new THREE.Matrix4(), this.group), crate: new Dyn(new Prefab().box(0.8, 0.8, 0.8, M(0xb98a52), 0, 0, 0).box(0.84, 0.1, 0.84, M(0x8a6236), 0, 0.5, 0), new THREE.Matrix4(), this.group), t: 0, bay: 0, running: false };
  }

  /** One forklift cycle as keyframes in the apron's own frame (x across, z along): time, x, z, heading, fork height, crate on forks. */
  private static forkliftPlan(bay: 0 | 1): [number, number, number, number, number, boolean][] {
    const sg = bay === 0 ? -1 : 1;
    return [
      [0, 0, 7.6, Math.PI, 0.1, false],
      [1.0, 0, 7.6, Math.PI, 1.1, true],
      [1.8, 0, 7.6, 0, 1.1, true],
      [3.4, 0, 10.6, 0, 1.1, true],
      [4.2, 0, 10.6, sg * Math.PI / 2, 1.1, true],
      [4.9, sg * 0.9, 10.6, sg * Math.PI / 2, 1.1, true],
      [5.8, sg * 0.9, 10.6, sg * Math.PI / 2, 0.5, false],
      [6.5, 0, 10.6, sg * Math.PI / 2, 0.1, false],
      [7.3, 0, 10.6, Math.PI, 0.1, false],
      [9.0, 0, 7.6, Math.PI, 0.1, false],
    ];
  }

  /** Drives the forklift through its plan, bay by bay, for whichever bays have a truck parked in them. */
  private updateForklift(dt: number): void {
    const f = this.lift;
    if (!f) return;
    const dur = 9;
    if (!f.running) {
      const bay = this.bays[0] && (!this.bays[1] || f.bay === 1) ? 0 : this.bays[1] ? 1 : -1;
      if (bay >= 0) {
        f.bay = bay as 0 | 1;
        f.running = true;
        f.t = 0;
      }
    } else {
      f.t += dt;
      if (f.t >= dur) f.running = false;
    }
    const plan = Line.forkliftPlan(f.bay);
    const t = f.running ? f.t : 0;
    let i = 0;
    while (i < plan.length - 2 && t > plan[i + 1][0]) i++;
    const a = plan[i];
    const b = plan[Math.min(i + 1, plan.length - 1)];
    const k = f.running ? THREE.MathUtils.clamp((t - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1) : 0;
    const x = THREE.MathUtils.lerp(a[1], b[1], k);
    const z = THREE.MathUtils.lerp(a[2], b[2], k);
    const yaw = a[3] + Math.atan2(Math.sin(b[3] - a[3]), Math.cos(b[3] - a[3])) * k;
    const h = THREE.MathUtils.lerp(a[4], b[4], k);
    tmpM.copy(this.dockMatrix).multiply(new THREE.Matrix4().makeTranslation(x, 0, z)).multiply(new THREE.Matrix4().makeRotationY(yaw));
    f.body.mesh.matrix.copy(tmpM);
    f.body.mesh.matrixWorldNeedsUpdate = true;
    const fm = tmpM.clone().multiply(new THREE.Matrix4().makeTranslation(0, h, 0));
    f.forks.mesh.matrix.copy(fm);
    f.forks.mesh.matrixWorldNeedsUpdate = true;
    f.crate.mesh.visible = f.running && a[5] && b[5] ? true : f.running && a[5] && k < 0.5;
    f.crate.mesh.matrix.copy(fm).multiply(new THREE.Matrix4().makeTranslation(0, 0.6, 1.65));
    f.crate.mesh.matrixWorldNeedsUpdate = true;
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
    this.fx = env.fx;
    setGlow(this.zone.id, night);
    const act = this.repo ? Math.max(this.state.activity, 0.12) : 0.3;
    const speed = BELT_SPEED * (0.5 + 0.7 * act);
    this.belt.scroll(speed * env.dt);
    this.state.update(env.dt);
    this.updateBulk(env.dt, speed, act);
    this.updateExpress(env, speed * 1.5);
    this.updateCrew(env);
    this.updateForklift(env.dt);
    if (env.camDist < 320) this.folk.update(env, { activity: this.repo ? this.state.activity : 0.3, incident: this.incident, incidentStation: this.incidentStation });
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
        const service = it.stage === 3 ? TEST_SECONDS : DWELL[it.stage];
        if (it.t >= service) {
          it.state = 'move';
          it.t = 0;
          if (it.stage === 3) it.kind = 'tested';
          st.occupant = null;
          if (it.stage === 1) this.sparkle();
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
      if (!this.ex.has(p.id) && p.status === 'moving' && !this.dispatched.has(p.id)) {
        // A real run is born inside the depot housing, like everything else.
        this.ex.set(p.id, { product: p, s: this.stations[0].sExpress, stage: 0, mode: 'inside', to: 0, t: 0, kind: 'crate' });
        // A cache hit: a courier zips in from the pneumatic tube on a scooter.
        if (hasCacheHit(p.run?.jobs) && !this.zipped.has(p.id)) {
          this.zipped.add(p.id);
          this.folk.zip();
        }
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
            if (e.stage === 1) this.sparkle();
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
          if (e.collected || p.status === 'launching' || !alive) {
            this.dispatched.add(id);
            this.ex.delete(id);
          }
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
    this.incidentStation = failing ? stage : -1;
    // The crew sweep burnt debris from the broken station into the hazmat funnel.
    if (this.incident && env.camDist < 240 && Math.random() < env.dt * 9) {
      tmpV.copy(this.funnelPos).sub(this.incident);
      tmpV.multiplyScalar(0.22).addScaledVector(this.incident.clone().normalize(), 4.5);
      env.fx.emit(this.incident, tmpV, { color: 0x3a3a3a, size0: 0.35, size1: 0.2, life: 3, alpha: 0.9, drag: 0.15 });
    }
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
    // The testing grounds: crew, tests and effects run before the items are drawn, so they can move them.
    const occ = this.stations[3].occupant;
    const exTest = [...this.ex.values()].find((e) => e.stage === 3 && e.mode === 'inside');
    if (occ && occ.v === undefined) occ.v = this.testCounter++;
    if (exTest && exTest.v === undefined) exTest.v = this.testCounter++;
    this.lab.update(env, [{ t: occ ? occ.t : null, variant: occ?.v ?? 0, fail: false }, { t: exTest ? exTest.t : null, variant: exTest?.v ?? 0, fail: !!exTest && exTest.product.status === 'failed' }], pools);
    if (this.lab.flash > this.flash) this.flash = this.lab.flash;
    // Ambient items.
    for (const it of this.items) {
      if (it.state === 'proc' && STATIONS[it.stage]?.hidden) continue;
      const hiddenInside = it.state === 'proc' && STATIONS[it.stage]?.hidden;
      if (hiddenInside) continue;
      // Across a room's gap the crate rides a trolley (hidden inside hooded rooms).
      const ride = this.handoff('bulk', it.s, it.state === 'move', pools, env, PORTER_LOOK[Math.min(4, it.stage)]);
      if (ride === 'hide') continue;
      this.lanePos(this.bulk, it.s, tmpP, dir);
      this.path(this.bulk, it.s);
      if (ride) tmpP.addScaledVector(tmpS.up, -ride);
      let scaleY = 1;
      if (it.state === 'proc' && it.stage === 3) {
        // In the testing grounds the grains move the box: the lab says where it is.
        const mo = this.lab.motion[0];
        if (mo.at) tmpP.copy(mo.at);
        scaleY = mo.scaleY;
      }
      surfaceMatrix(tmpP, tmpS.tangent, tmpS.up, m);
      if (scaleY !== 1) m.scale(new THREE.Vector3(1, scaleY, 1));
      (it.kind === 'crate' ? pools.crates : pools.boxes).push(m, TINT[it.kind]);
    }
    // Real runs on the express lane.
    this.stamp.mesh.visible = false;
    for (const e of this.ex.values()) this.drawExpress(e, pools, env);
    this.poseMachinery(env);
    if (near) this.drawCrowd(env, pools);
  }

  private path(p: SurfacePath, s: number): void {
    p.at(Math.min(Math.max(s, 0), p.length), tmpS);
  }

  private expressInside(e: Express): boolean {
    return e.mode === 'inside' && !!STATIONS[e.stage]?.hidden && e.stage !== 1 && e.stage !== 3;
  }

  private drawExpress(e: Express, pools: Pools, env: Env): void {
    if (e.mode === 'loaded') return;
    if (this.expressInside(e)) return;
    const p = e.product;
    const ride = e.mode === 'reject' ? 0 : this.handoff('express', e.s, e.mode === 'travel', pools, env, PORTER_LOOK[Math.min(4, e.stage)]);
    if (ride === 'hide') return;
    this.lanePos(this.express, e.s, tmpP, tmpV);
    this.path(this.express, e.s);
    if (ride) tmpP.addScaledVector(tmpS.up, -ride);
    let scaleY = 1;
    if (e.mode === 'inside' && e.stage === 3) {
      // The real run is put through its paces by the testers, looping while the real tests run.
      const mo = this.lab.motion[1];
      if (mo.at) tmpP.copy(mo.at);
      scaleY = mo.scaleY;
    }
    if (e.mode === 'reject') {
      tmpV2.crossVectors(tmpS.up, tmpS.tangent).normalize();
      tmpP.addScaledVector(tmpV2, -Math.min(1, e.t / 1.1) * 4.4);
    }
    surfaceMatrix(tmpP, tmpS.tangent, tmpS.up, tmpM);
    if (scaleY !== 1) tmpM.scale(new THREE.Vector3(1, scaleY, 1));
    const tint = p.status === 'failed' ? TINT.failed : p.status === 'cancelled' ? TINT.cancelled : TINT[e.kind];
    (e.kind === 'crate' ? pools.crates : pools.boxes).push(tmpM, tint);
    // Matrix builds: sibling boxes travel in a convoy behind the real one, in sync with it.
    const width = matrixWidth(p.run?.jobs);
    for (let k = 1; k < width && e.mode !== 'reject'; k++) {
      this.lanePos(this.express, Math.max(0, e.s - k * 1.15), tmpP, tmpV);
      this.path(this.express, Math.max(0, e.s - k * 1.15));
      surfaceMatrix(tmpP, tmpS.tangent, tmpS.up, tmpM);
      (e.kind === 'crate' ? pools.crates : pools.boxes).push(tmpM, tint);
    }
    if (p.status === 'cancelled' && e.mode === 'inside') this.showStamp(e, tmpP, tmpS.tangent, tmpS.up);
  }

  /** A shower of sparkles over the lint station: the crate has been polished clean. */
  private sparkle(): void {
    if (!this.fx) return;
    const m = this.stations[1].matrix;
    for (let i = 0; i < 16; i++) {
      tmpP.set((Math.random() - 0.5) * 2.4, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 2.4).applyMatrix4(m);
      tmpV.copy(tmpP).normalize().multiplyScalar(1.4 + Math.random() * 1.6);
      this.fx.emit(tmpP, tmpV, { color: i % 3 === 0 ? 0xffffff : 0xffe27a, size0: 0.35, size1: 0.05, life: 0.9, alpha: 1, drag: 0.5 });
    }
  }

  /** A giant rubber stamp that slams down on a cancelled run, then lifts away. */
  private showStamp(e: Express, at: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3): void {
    const u = e.t;
    const down = u < 0.2 ? 0 : u < 0.55 ? (u - 0.2) / 0.35 : u < 1.0 ? 1 : Math.max(0, 1 - (u - 1.0) / 0.4);
    const h = 0.55 + (1 - down * down) * 2.6;
    if (!e.stamped && u >= 0.55) {
      e.stamped = true;
      sfx.stamp();
    }
    surfaceMatrix(tmpV2.copy(at).addScaledVector(up, h), forward, up, tmpM);
    this.stamp.mesh.matrix.copy(tmpM);
    this.stamp.mesh.matrixWorldNeedsUpdate = true;
    this.stamp.mesh.visible = true;
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

    // Arena cannons and the cannonball: the lab says when they fire.
    this.ball.mesh.visible = false;
    for (const lane of [0, 1]) {
      const c = this.lab.cannon[lane];
      if (c.ballAt) {
        this.ball.mesh.visible = true;
        this.ball.mesh.matrix.makeTranslation(c.ballAt.x, c.ballAt.y, c.ballAt.z);
      }
      const sgn = lane === 0 ? 1 : -1;
      this.cannons[lane].set(new THREE.Matrix4().makeTranslation(0, 0, -c.recoil * 0.4).multiply(new THREE.Matrix4().makeRotationZ(sgn * 1.3)).multiply(new THREE.Matrix4().makeRotationX(-0.3)));
    }    void t;
  }

  private drawCrowd(env: Env, pools: Pools): void {
    const act = this.repo ? this.state.activity : 0.3;
    const g: GrainPose = { pos: tmpP, forward: tmpV, up: tmpV2, look: LOOKS.rice, armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, lean: 0, roll: 0 };
    const t = env.elapsed;
    this.folk.draw(env, pools, { activity: act, incident: this.incident, incidentStation: this.incidentStation });
    const gp = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
    for (const c of this.crew) {
      g.look = LOOKS[c.look];
      g.propR = c.mode !== 'home' && c.role === 'spray' ? 'extinguisher' : c.mode === 'work' && c.role === 'sweep' ? 'broom' : undefined;
      g.propBody = c.mode !== 'home' && c.mode !== 'work' && c.look === 'medic' ? 'stretcher' : undefined;
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
  }

  /** Screen picking: every grain on this line. */
  grainPickables(): { id: number; pos: THREE.Vector3 }[] {
    return this.folk.pickables();
  }

  /** Direction of the break plaza's centre. */
  plazaDir(): THREE.Vector3 {
    return this.chart.dir(53, -8.5);
  }

  /** Cheering crowd after one of this line's rockets leaves. */
  celebrate(): void {
    this.folk.cheer(7);
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
