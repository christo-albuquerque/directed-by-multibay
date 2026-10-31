import * as THREE from 'three';
import { SurfacePath } from '../../globe/path';
import { Chart } from '../../globe/surface';
import { ZONES, zoneChart, type Zone } from '../../globe/zones';
import { Ambient } from '../ambient';
import { LOOKS, workLimbs, type GrainPose, type LookName } from '../crowd';
import { M, Prefab, StaticBatch, glowMat, setGlow } from '../kit';
import { lamp } from '../line/prefabs';
import type { Env, Pools } from '../types';
import { SHOP_KINDS, shopPrefab } from './shops';
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
  { text: 'RAMEN HOUSE', color: NEON_CSS[0], sub: 'OPEN LATE' },
  { text: 'BARBER', color: NEON_CSS[1], sub: 'FADES & TRIMS' },
  { text: 'STEAK HOUSE', color: NEON_CSS[3] },
  { text: 'TAILOR', color: NEON_CSS[5], sub: 'FITTED FOR YOU' },
  { text: 'ARCADE', color: NEON_CSS[2], sub: '1UP' },
  { text: 'PHARMACY', color: NEON_CSS[4] },
  { text: 'BAKERY', color: NEON_CSS[3], sub: 'FRESH BUNS' },
  { text: 'TEA HOUSE', color: NEON_CSS[4] },
  { text: 'HAIR SALON', color: NEON_CSS[0] },
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

const v3 = new THREE.Vector3();

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

    // The market is open air: no wall of towers. Stalls stand in a loose, uneven ring round the plaza, each turned a
    // little differently (the way real stalls are put out), with shops of every kind around the edges.
    const stallColors = [0xd6342a, 0x2f8f83, 0x7a5aa8, 0xd99a2e, 0x2f6fb5, 0xb8433a];
    let sign = 0;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + (r() - 0.5) * 0.3;
      const rad = 0.8 + r() * 0.2;
      const x = Math.cos(a) * 34 * rad;
      const z = 4 + Math.sin(a) * 22 * rad;
      const rot = Math.atan2(-x, 4 - z) + (r() - 0.5) * 0.9;
      batch.placeOn(stall(id, stallColors[i % stallColors.length]), c, x, z, GROUND, rot);
      this.signs.add(c, sign++ % 18, x + Math.sin(rot) * 1.4, z + Math.cos(rot) * 1.4, GROUND + 4.9, 4.4, 2.2, rot);
    }
    // Shops: restaurants, a barber, a tailor, an arcade, a pharmacy and more, low and spread out.
    const shopSpots: [number, number][] = [[-37, -14], [-36, 10], [-30, 24], [-12, 26], [12, 26], [30, 24], [37, 10], [37, -14], [28, -24], [-26, -24], [0, -27]];
    shopSpots.forEach(([x, z], i) => {
      const spec = SHOP_KINDS[i % SHOP_KINDS.length];
      const rot = Math.atan2(-x, 4 - z) + (r() - 0.5) * 0.5;
      const h = 4 + r() * 1.6;
      batch.placeOn(shopPrefab(id, spec.kind, spec.wall, spec.neon, 7 + r() * 2, 5.5 + r(), h), c, x, z, GROUND, rot);
      const cell = SIGNS.findIndex((s) => s.text === spec.sign);
      if (cell >= 0) this.signs.add(c, cell, x + Math.sin(rot) * 3.4, z + Math.cos(rot) * 3.4, GROUND + h + 1.6, 4.6, 1.7, rot);
    });
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
    for (let i = 0; i < 14; i++) batch.placeOn(lamp(id), c, Math.cos((i / 14) * Math.PI * 2) * 25.5, 4 + Math.sin((i / 14) * Math.PI * 2) * 17.5, GROUND);
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
    const ring = (rx: number, rz: number, n = 20): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * rx, 4 + Math.sin((i / n) * Math.PI * 2) * rz] as [number, number]);
    const loops: [number, number][][] = [ring(24.5, 15.5), ring(24.5, 15.5).reverse(), [[-24, 5], [-6, 5], [-6, 9], [-24, 9], [-24, 5]], [[6, 5], [24, 5], [24, 9], [6, 9], [6, 5]], [[-12, -4], [12, -4], [12, 3], [-12, 3], [-12, -4]]];    const walkR = rand(31);
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
      const sipping = (Math.floor(d.phase) + Math.floor(t * 0.1)) % 3 === 0;
      g.propR = sipping ? undefined : 'chopsticks';
      g.propL = sipping ? 'cup' : undefined;
      Object.assign(g, workLimbs(sipping ? 'sip' : 'ramen', t, d.phase), { legL: -1.5, legR: -1.5, bob: -0.2 });
      pools.crowd.draw(g);
    }
    if (env.camDist > 360) return;
    if (!this.ambient) {
      this.ambient = new Ambient();
      this.strollers.forEach((s, i) => this.ambient!.add({ path: s.path, s: s.s, speed: s.speed, look: s.look, stops: s.stops, carry: i % 7 === 0, courier: s.look === 'quinoa', chores: ['coffee', 'news', 'gum', 'wave', 'sip', 'ramen'] }));
    }
    this.ambient.draw(env, pools);
  }

  ambient?: Ambient;
}
