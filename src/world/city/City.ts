import * as THREE from 'three';
import { SurfacePath, type PathSample } from '../../globe/path';
import { Chart } from '../../globe/surface';
import { ZONES, zoneChart, type Zone } from '../../globe/zones';
import { ribbonMesh } from '../belts';
import { LOOKS, walkLimbs, workLimbs, type GrainPose, type LookName } from '../crowd';
import { M, Prefab, StaticBatch, glowMat, setGlow } from '../kit';
import { lamp } from '../line/prefabs';
import type { Env, Pools } from '../types';
import { SignAtlas, type SignSpec } from './signs';

const GROUND = 0.35;
const NEON = [0xff2d95, 0x39ffe0, 0xa56bff, 0xffb02e, 0x6bff95, 0x6fb4ff];
const NEON_CSS = ['#ff2d95', '#39ffe0', '#c9a0ff', '#ffb02e', '#6bff95', '#6fb4ff'];

const SIGNS: SignSpec[] = [
  { text: 'NIGHT RAMEN', color: NEON_CSS[0], sub: '24 / 7 NOODLES' },
  { text: 'KEPLER COFFEE', color: NEON_CSS[3], sub: 'GRIND · BREW · SHIP' },
  { text: 'PIPELINE GADGETS', color: NEON_CSS[1], sub: 'CI/CD PARTS' },
  { text: 'GLOBAL GADGETS', color: NEON_CSS[5], sub: 'NOW SHIPPING' },
  { text: 'MILLET MART', color: NEON_CSS[4] },
  { text: 'QUINOA QUICKIE', color: NEON_CSS[2] },
  { text: 'GRAIN GRILL', color: NEON_CSS[3], sub: 'FLAME-TOASTED' },
  { text: 'SYNTH SUSHI', color: NEON_CSS[0] },
  { text: 'BOBA BAY', color: NEON_CSS[1] },
  { text: 'RICE & SHINE', color: NEON_CSS[4] },
  { text: 'DEPLOY DONUTS', color: NEON_CSS[3], sub: 'GLAZED ON MAIN' },
  { text: 'MERGE BAR', color: NEON_CSS[2], sub: 'NO CONFLICTS' },
  { text: 'HOTFIX HOTPOT', color: NEON_CSS[0] },
  { text: 'CACHE CAFE', color: NEON_CSS[5], sub: 'HIT ONLY' },
  { text: 'BUILD BURGERS', color: NEON_CSS[3] },
  { text: 'STAGING SPA', color: NEON_CSS[4] },
  { text: 'LINT ROLLS', color: NEON_CSS[1] },
  { text: 'PIXEL PUB', color: NEON_CSS[2] },
  { text: 'KEPLER-22b', color: NEON_CSS[5], sub: 'WELCOME HOME' },
  { text: 'DIRECTED BY', color: NEON_CSS[0], sub: 'MULTIBAY' },
  { text: 'OPEN', color: NEON_CSS[4] },
  { text: '24H', color: NEON_CSS[3] },
  { text: 'TACO TRUCK', color: NEON_CSS[1] },
  { text: 'DATA DUMPLINGS', color: NEON_CSS[0] },
];

function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Diner {
  pos: THREE.Vector3;
  fwd: THREE.Vector3;
  up: THREE.Vector3;
  look: LookName;
  phase: number;
}

interface Stroller {
  path: SurfacePath;
  s: number;
  speed: number;
  look: LookName;
  phase: number;
  /** Distances along the path where this grain stops to browse. */
  stops: number[];
  pause: number;
  next: number;
}

const sample: PathSample = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
const v3 = new THREE.Vector3();

function tower(w: number, d: number, h: number, color: number, zone: string, r: () => number): Prefab {
  const p = new Prefab().box(w, h, d, M(color), 0, 0, 0);
  // Setbacks and a crown.
  p.box(w * 0.75, h * 0.18, d * 0.75, M(color), 0, h, 0).box(w * 0.4, h * 0.14, d * 0.4, M(0x2c3040), 0, h * 1.18, 0);
  p.box(0.3, 5, 0.3, M(0x9aa4b2), 0, h * 1.32, 0).box(0.5, 0.5, 0.5, glowMat(zone, 0xff3b3b, 0.5, 3.5), 0, h * 1.32 + 5, 0);
  // Windows: bands of light on the front and sides.
  const rows = Math.floor(h / 3.2);
  for (let i = 1; i < rows; i++) {
    if (r() < 0.25) continue;
    const c = NEON[Math.floor(r() * NEON.length)];
    const wm = glowMat(zone, c, 0.1, 1.7);
    const off = r() * 2 - 1;
    p.box(w * 0.7, 0.6, 0.12, wm, off, i * 3.2, d / 2 + 0.04).box(0.12, 0.6, d * 0.7, wm, w / 2 + 0.04, i * 3.2, -off);
  }
  // Vertical neon trim on a corner.
  p.box(0.3, h * 0.8, 0.3, glowMat(zone, NEON[Math.floor(r() * NEON.length)], 0.15, 2.6), w / 2, h * 0.1, d / 2);
  return p;
}

function stall(zone: string, color: number): Prefab {
  const p = new Prefab().box(5, 1.2, 1.8, M(0x3a3f4c), 0, 0, 0).box(5.2, 0.15, 2, M(0xd9c8a0), 0, 1.2, 0);
  p.box(5.4, 0.2, 2.8, M(color), 0, 3.0, 0.5, 0, -0.2);
  for (let i = 0; i < 6; i++) p.box(0.85, 0.12, 2.8, M(i % 2 ? 0xf5f0e6 : color), -2.2 + i * 0.88, 3.1, 0.5, 0, -0.2);
  p.box(0.15, 3, 0.15, M(0x2f333d), -2.6, 0, -0.8).box(0.15, 3, 0.15, M(0x2f333d), 2.6, 0, -0.8).box(5, 2.6, 0.2, M(0x2c3040), 0, 0.4, -0.9);
  for (const x of [-1.8, 0, 1.8]) p.sphere(0.22, glowMat(zone, NEON[Math.floor(Math.abs(x) * 2) % NEON.length], 0.25, 2.8), x, 2.6, 1.4, 1, 6);
  return p;
}

function table(zone: string): Prefab {
  const p = new Prefab().cyl(0.15, 0.15, 0.85, M(0x8a8f9a), 0, 0, 0, 8).cyl(0.95, 0.95, 0.1, M(0xe6d3a8), 0, 0.85, 0, 14);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    p.cyl(0.14, 0.14, 0.5, M(0x6b4a2b), Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35, 8).cyl(0.34, 0.34, 0.08, M(0xb9763a), Math.cos(a) * 1.35, 0.5, Math.sin(a) * 1.35, 10);
  }
  p.box(0.2, 0.06, 0.2, glowMat(zone, 0xffd166, 0.2, 2.4), 0, 0.96, 0);
  return p;
}

/**
 * The Night Market: a cyberpunk bazaar with neon-lit towers, rows of stalls, a plaza full of diners and a constant
 * stream of shoppers. Everybody is always there: crowds walk endless loops and pause at stalls, nobody spawns.
 */
export class City {
  readonly group = new THREE.Group();
  private zone: Zone;
  private chart: Chart;
  private signs: SignAtlas;
  private diners: Diner[] = [];
  private strollers: Stroller[] = [];
  private holo: THREE.Mesh;
  private holoBase: THREE.Matrix4 = new THREE.Matrix4();
  private steam = 0;
  private ventPos: THREE.Vector3[] = [];

  constructor(batch: StaticBatch) {
    this.zone = ZONES.find((z) => z.kind === 'city')!;
    this.chart = zoneChart(this.zone);
    const c = this.chart;
    const id = this.zone.id;
    const r = rand(77);
    this.signs = new SignAtlas(SIGNS, id);

    // Towers around the edges, taller toward the back.
    const colors = [0x2d3248, 0x3a2f4d, 0x24384a, 0x41334a, 0x2b3d3f];
    for (let i = 0; i < 9; i++) {
      const h = 18 + r() * 18;
      batch.placeOn(tower(8 + r() * 3, 8 + r() * 3, h, colors[i % colors.length], id, r), c, -37 + i * 9.2, -25, GROUND, 0);
    }
    for (let i = 0; i < 5; i++) {
      batch.placeOn(tower(8, 9, 12 + r() * 12, colors[(i + 1) % colors.length], id, r), c, -39, -15 + i * 9.5, GROUND, 0);
      batch.placeOn(tower(8, 9, 12 + r() * 12, colors[(i + 2) % colors.length], id, r), c, 39, -15 + i * 9.5, GROUND, 0);
    }
    // Low shopfronts along the south edge.
    for (let i = 0; i < 9; i++) batch.placeOn(new Prefab().box(8, 5 + r() * 2, 5, M(colors[i % colors.length]), 0, 0, 0).box(8.2, 0.4, 5.2, glowMat(id, NEON[i % NEON.length], 0.2, 2.2), 0, 5, 0), c, -35 + i * 8.8, 26.5, GROUND, Math.PI);

    // Streets with neon centre lines.
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide, flatShading: true });
    const lineMat = glowMat(id, 0x39ffe0, 0.12, 1.8);
    lineMat.side = THREE.DoubleSide;
    const streets: [number, number][][] = [
      [[-40, -15], [0, -15], [40, -15]],
      [[-40, 17], [0, 17], [40, 17]],
      [[-30, -24], [-30, 0], [-30, 24]],
      [[30, -24], [30, 0], [30, 24]],
      [[0, -24], [0, 0], [0, 24]],
    ];
    for (const pts of streets) {
      const p = SurfacePath.through(c, pts, GROUND + 0.03, false, 2);
      this.group.add(ribbonMesh(p, 3.2, asphalt), ribbonMesh(p, 0.12, lineMat, 0.03));
    }

    // Two rows of stalls facing the plaza, then the plaza itself with tables and diners.
    const stallColors = [0xd6342a, 0x2f8f83, 0x7a5aa8, 0xd99a2e, 0x2f6fb5, 0xb8433a];
    let sign = 0;
    for (let i = 0; i < 7; i++) {
      const x = -21 + i * 7;
      batch.placeOn(stall(id, stallColors[i % stallColors.length]), c, x, -9, GROUND, 0);
      this.signs.add(c, sign++ % 18, x, -7.6, GROUND + 4.9, 4.4, 2.2, 0);
      batch.placeOn(stall(id, stallColors[(i + 2) % stallColors.length]), c, x, 12, GROUND, Math.PI);
      this.signs.add(c, sign++ % 18, x, 10.6, GROUND + 4.9, 4.4, 2.2, Math.PI);
    }
    // Big vertical signs on the towers.
    for (let i = 0; i < 9; i += 2) this.signs.add(c, 18 + (i % 2), -37 + i * 9.2, -20.6, GROUND + 14, 7, 3.6, 0);
    this.signs.add(c, 22, -33, 22.5, GROUND + 5.5, 4, 2, 0);
    this.signs.add(c, 23, 33, 22.5, GROUND + 5.5, 4, 2, 0);
    this.signs.add(c, 20, 33, -4, GROUND + 4.2, 2.6, 1.3, 0);
    this.signs.add(c, 21, -33, -4, GROUND + 4.2, 2.6, 1.3, 0);

    const seatR = rand(5);
    const looks: LookName[] = ['rice', 'corn', 'wheat', 'quinoa', 'millet', 'basmati', 'punk', 'neon'];
    const tablePos: [number, number][] = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) tablePos.push([-17 + col * 7 + (row % 2) * 3, -1.5 + row * 4.8]);
    for (const [x, z] of tablePos) {
      batch.placeOn(table(id), c, x, z, GROUND, 0);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        const sx = x + Math.cos(a) * 1.35;
        const sz = z + Math.sin(a) * 1.35;
        const m = c.matrix(sx, sz, GROUND + 0.5 - 0.22, Math.atan2(-Math.cos(a), -Math.sin(a)));
        this.diners.push({
          pos: new THREE.Vector3().setFromMatrixPosition(m),
          fwd: new THREE.Vector3().setFromMatrixColumn(m, 2).normalize(),
          up: new THREE.Vector3().setFromMatrixColumn(m, 1).normalize(),
          look: looks[Math.floor(seatR() * looks.length)],
          phase: seatR() * 8,
        });
      }
    }

    // Lamp posts, steam vents and the spinning logo over the plaza.
    for (let x = -36; x <= 36; x += 12) for (const z of [-15, 17]) batch.placeOn(lamp(id), c, x, z, GROUND);
    for (const [x, z] of [[-24, 4], [24, 4], [0, -12], [0, 15]] as const) this.ventPos.push(c.point(x, z, GROUND + 0.2));
    batch.placeOn(new Prefab().cyl(0.5, 0.8, 18, M(0x3a3f4c), 0, 0, 0, 8).box(5, 0.5, 5, glowMat(id, 0xff2d95, 0.3, 3), 0, 18, 0), c, 0, 4, GROUND);
    const logo = document.createElement('canvas');
    logo.width = 1024;
    logo.height = 256;
    const g = logo.getContext('2d')!;
    g.fillStyle = '#0a0612';
    g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = '#ff2d95';
    g.lineWidth = 10;
    g.strokeRect(10, 10, 1004, 236);
    g.fillStyle = '#ff9ad0';
    g.font = '900 120px system-ui, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff2d95';
    g.shadowBlur = 24;
    g.fillText('DIRECTED BY', 512, 88);
    g.fillStyle = '#9ff3ff';
    g.shadowColor = '#39ffe0';
    g.font = '900 140px system-ui, "Segoe UI", sans-serif';
    g.fillText('MULTIBAY', 512, 186);
    const lt = new THREE.CanvasTexture(logo);
    lt.colorSpace = THREE.SRGBColorSpace;
    const lm = new THREE.MeshStandardMaterial({ map: lt, emissiveMap: lt, emissive: 0xffffff, emissiveIntensity: 0.8, side: THREE.DoubleSide, roughness: 0.5 });
    this.holo = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), lm);
    this.holo.matrixAutoUpdate = false;
    this.holo.frustumCulled = false;
    this.holoBase = c.matrix(0, 4, GROUND + 22, 0);
    this.group.add(this.holo, this.signs.build());

    // Shoppers: endless loops along the sidewalks, stopping at stalls.
    const loops: [number, number][][] = [
      [[-27, -12], [27, -12], [27, 14], [-27, 14], [-27, -12]],
      [[-33, -20], [-33, 22], [-27, 22], [-27, -20], [-33, -20]],
      [[27, -20], [27, 22], [33, 22], [33, -20], [27, -20]],
      [[-24, 5], [-6, 5], [-6, 9], [-24, 9], [-24, 5]],
      [[6, 5], [24, 5], [24, 9], [6, 9], [6, 5]],
      [[-34, 20], [34, 20], [34, 24], [-34, 24], [-34, 20]],
      [[-8, -20], [8, -20], [8, 22], [-8, 22], [-8, -20]],
      [[-12, -4], [12, -4], [12, 3], [-12, 3], [-12, -4]],
    ];
    const walkR = rand(31);
    loops.forEach((pts, li) => {
      const path = SurfacePath.through(c, pts, GROUND + 0.05, false, 0.9);
      const n = 22 + li * 2;
      for (let i = 0; i < n; i++) {
        const stops: number[] = [];
        for (let k = 0; k < 3; k++) stops.push(walkR() * path.length);
        stops.sort((a, b) => a - b);
        const look = looks[Math.floor(walkR() * looks.length)];
        this.strollers.push({ path, s: (i / n) * path.length + walkR() * 2, speed: 0.9 + walkR() * 1.2, look, phase: walkR() * 8, stops, pause: 0, next: 0 });
      }
    });
  }

  update(env: Env, night: number): void {
    setGlow(this.zone.id, night);
    this.signs.flicker(env.elapsed);
    // The hologram turns slowly; steam drifts from street vents.
    const rot = new THREE.Matrix4().makeRotationY(env.elapsed * 0.45);
    this.holo.matrix.multiplyMatrices(this.holoBase, rot);
    this.holo.matrixWorldNeedsUpdate = true;
    if (env.camDist < 280) {
      this.steam += env.dt * 6;
      while (this.steam >= 1) {
        this.steam -= 1;
        for (const p of this.ventPos) {
          v3.copy(p).normalize();
          env.fx.emit(p, v3.clone().multiplyScalar(2.4).add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)), { color: 0xcfd6e6, size0: 0.6, size1: 2.4, life: 2.2, alpha: 0.3, drag: 0.5 });
        }
      }
    }
  }

  draw(env: Env, pools: Pools): void {
    if (env.camDist > 520) return;
    const g: GrainPose = { pos: v3, forward: v3, up: v3, look: LOOKS.rice, armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, lean: 0, roll: 0 };
    const t = env.elapsed;
    for (const d of this.diners) {
      g.pos = d.pos;
      g.forward = d.fwd;
      g.up = d.up;
      g.look = LOOKS[d.look];
      Object.assign(g, workLimbs((Math.floor(d.phase) + Math.floor(t * 0.1)) % 3 === 0 ? 'sip' : 'sit', t, d.phase), { legL: -1.5, legR: -1.5 });
      pools.crowd.draw(g);
    }
    if (env.camDist > 360) return;
    for (const s of this.strollers) {
      if (s.pause > 0) {
        s.pause -= env.dt;
      } else {
        s.s = (s.s + s.speed * env.dt) % s.path.length;
        // Stop to browse at the next stall on the list.
        if (Math.abs(s.s - s.stops[s.next]) < 0.4) {
          s.pause = 2 + (s.phase % 3);
          s.next = (s.next + 1) % s.stops.length;
        }
      }
      s.path.at(s.s, sample);
      g.pos = sample.pos;
      g.forward = sample.tangent;
      g.up = sample.up;
      g.look = LOOKS[s.look];
      Object.assign(g, s.pause > 0 ? workLimbs(Math.floor(s.phase) % 2 ? 'sip' : 'wave', t, s.phase) : walkLimbs(t * s.speed * 3.2 + s.phase, s.speed));
      pools.crowd.draw(g);
    }
  }
}
