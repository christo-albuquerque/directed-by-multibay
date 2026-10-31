import * as THREE from 'three';
import { SurfacePath } from '../globe/path';
import { R, lonLatDir } from '../globe/surface';
import { noise3, reliefAt } from '../globe/terrain';
import { ZONES, zoneWeight } from '../globe/zones';
import { M, Prefab, StaticBatch, glowMat } from './kit';
import { nearCorridor, registerCorridor } from './corridors';
import { Ambient } from './ambient';
import { SHOP_KINDS, shopPrefab } from './city/shops';
import type { LookName } from './crowd';
import { ROADS } from './roads';
import { colouredGeometry, surfaceMatrix } from './pools';

/** Deterministic random numbers: the planet is the same every visit. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20250611);
const between = (a: number, b: number): number => a + (b - a) * rand();

// --- prefabs ------------------------------------------------------------------------------

const TRUNK = M(0x6b4a2f);
function roundTree(leaf: number): Prefab {
  return new Prefab().cyl(0.22, 0.3, 1.8, TRUNK, 0, 0, 0, 5).sphere(1.5, M(leaf), 0, 2.6, 0, 0.9, 5).sphere(1.0, M(leaf + 0x101a08), 0.5, 3.5, 0.2, 0.9, 5);
}
function pine(leaf: number): Prefab {
  return new Prefab().cyl(0.2, 0.28, 1.2, TRUNK, 0, 0, 0, 5).cone(1.5, 2.2, M(leaf), 0, 1.0, 0, 5).cone(1.15, 2.0, M(leaf + 0x0a140a), 0, 2.5, 0, 5).cone(0.8, 1.7, M(leaf + 0x142010), 0, 3.8, 0, 5);
}
function neonTree(color: number): Prefab {
  return new Prefab().cyl(0.14, 0.2, 2.6, M(0x2a2236), 0, 0, 0, 5).sphere(1.3, glowMat('wild', color, 0.25, 1.6), 0, 3.0, 0, 0.8, 5);
}
const bush = (c: number): Prefab => new Prefab().sphere(0.9, M(c), 0, 0.4, 0, 0.6, 6).sphere(0.6, M(c + 0x0c1408), 0.7, 0.3, 0.3, 0.6, 5);
const rock = (c: number): Prefab => new Prefab().sphere(1.1, M(c), 0, 0.3, 0, 0.65, 5).sphere(0.7, M(c + 0x101010), 0.9, 0.1, 0.4, 0.6, 5);
const crystal = (c: number): Prefab =>
  new Prefab().cone(0.55, 3.2, glowMat('wild', c, 0.3, 1.8), 0, 0, 0, 5).cone(0.4, 2.2, glowMat('wild', c, 0.3, 1.8), 0.7, 0, 0.3, 5).cone(0.35, 1.7, glowMat('wild', c, 0.3, 1.8), -0.5, 0, -0.5, 5);
const container = (c: number): Prefab => new Prefab().box(3.4, 1.5, 1.4, M(c, { metal: 0.3 })).box(3.4, 0.12, 1.45, M(0x20242c), 0, 0.7, 0);

// Houses and blocks are baked into the static batch (they differ too much for instancing).
function house(w: number, h: number, wall: number, roof: number): Prefab {
  const win = glowMat('wild', 0xffd27a, 0.2, 1.7);
  return new Prefab()
    .box(w, h, w, M(wall))
    .cone(w * 0.78, 1.3, M(roof), 0, h, 0, 4)
    .box(0.9, 1.1, 0.12, win, w * 0.2, 0.7, w / 2 + 0.02)
    .box(0.9, 1.1, 0.12, win, -w * 0.25, 0.7, w / 2 + 0.02)
    .box(0.12, 1.1, 0.9, win, w / 2 + 0.02, 0.7, 0);
}
function block(w: number, h: number, wall: number, neon: number): Prefab {
  const p = new Prefab().box(w, h, w, M(wall)).box(w + 0.4, 0.4, w + 0.4, M(0x2a2e3a), 0, h, 0);
  const lit = glowMat('wild', neon, 0.3, 2.0);
  const warm = glowMat('wild', 0xffd27a, 0.2, 1.7);
  for (let y = 1.6; y < h - 0.6; y += 1.8) {
    p.box(w * 0.82, 0.55, 0.1, y % 3.6 < 1.8 ? warm : lit, 0, y, w / 2 + 0.03);
    p.box(w * 0.82, 0.55, 0.1, warm, 0, y, -w / 2 - 0.03);
    p.box(0.1, 0.55, w * 0.82, y % 3.6 < 1.8 ? lit : warm, w / 2 + 0.03, y, 0);
  }
  p.box(0.15, 1.6, 0.15, M(0x555b66), w * 0.3, h + 0.4, w * 0.2);
  return p;
}
/** An ice igloo with a low entrance tunnel and a warm window: the villages high in the mountains. */
function igloo(): Prefab {
  const ice = M(0xe6f1fb);
  return new Prefab()
    .sphere(2.4, ice, 0, 0, 0, 0.75, 9)
    .box(1.5, 1.3, 1.9, ice, 0, 0, 2.4)
    .box(0.95, 0.95, 0.08, M(0x1b2433), 0, 0, 3.36)
    .sphere(0.28, glowMat('wild', 0xffd27a, 0.3, 1.5), 1.4, 1.1, 1.6, 1, 6)
    .box(4.9, 0.05, 0.05, M(0xbcd3e6), 0, 0.7, 0)
    .box(4.1, 0.05, 0.05, M(0xbcd3e6), 0, 1.2, 0);
}

/** A small mountain cottage: log walls, a steep snow-capped roof, a stone chimney and a lit window. */
function cabin(): Prefab {
  return new Prefab()
    .box(3.6, 2.2, 3.2, M(0x7a4f2b))
    .box(3.8, 0.12, 0.12, M(0x5a3a20), 0, 0.7, 1.64).box(3.8, 0.12, 0.12, M(0x5a3a20), 0, 1.4, 1.64)
    .cone(3.1, 2.0, M(0x4a3a2f), 0, 2.2, 0, 4)
    .cone(2.5, 0.85, M(0xf4f8fc), 0, 3.35, 0, 4)
    .box(0.6, 1.8, 0.6, M(0x8a8f99), 1.1, 2.2, -0.6)
    .box(0.9, 1.3, 0.1, M(0x2b1d12), -0.7, 0, 1.64)
    .box(0.9, 0.7, 0.1, glowMat('wild', 0xffd27a, 0.3, 1.6), 0.9, 0.9, 1.64);
}
const lamp = (): Prefab => new Prefab().cyl(0.07, 0.1, 3.4, M(0x3c4350)).box(0.9, 0.1, 0.1, M(0x3c4350), 0.4, 3.4, 0).sphere(0.28, glowMat('wild', 0xfff0c8, 0.5, 3.2), 0.85, 3.3, 0, 0.7, 6);
const stall = (c: number): Prefab =>
  new Prefab().box(2.2, 0.9, 1.4, M(0x4a3b2d)).box(2.5, 0.14, 1.7, M(c), 0, 2.0, 0).cyl(0.07, 0.07, 2.0, M(0x333333), -1.1, 0, 0.7, 5).cyl(0.07, 0.07, 2.0, M(0x333333), 1.1, 0, 0.7, 5).box(1.2, 0.35, 0.1, glowMat('wild', 0xff4fa3, 0.3, 2.0), 0, 2.3, 0.82);
const waterTower = (): Prefab => new Prefab().cyl(0.12, 0.12, 5, M(0x4b5160), -0.8, 0, -0.8, 5).cyl(0.12, 0.12, 5, M(0x4b5160), 0.8, 0, -0.8, 5).cyl(0.12, 0.12, 5, M(0x4b5160), -0.8, 0, 0.8, 5).cyl(0.12, 0.12, 5, M(0x4b5160), 0.8, 0, 0.8, 5).cyl(1.4, 1.4, 1.8, M(0x8c97a6), 0, 5, 0, 10).cone(1.5, 0.9, M(0x5b6575), 0, 6.8, 0, 10);
const silo = (): Prefab => new Prefab().cyl(1.2, 1.2, 4.2, M(0xc5ccd6, { metal: 0.3 }), 0, 0, 0, 10).cone(1.3, 0.9, M(0x8793a6), 0, 4.2, 0, 10);
const solar = (): Prefab => new Prefab().box(3, 0.1, 1.8, M(0x1d3a7a, { metal: 0.5 }), 0, 1.1, 0, 0, -0.5).cyl(0.07, 0.07, 1.1, M(0x666c78), 0, 0, 0, 5);
const mast = (): Prefab => new Prefab().cyl(0.1, 0.22, 7, M(0xb5bac3), 0, 0, 0, 5).box(1.6, 0.1, 0.1, M(0xb5bac3), 0, 5.2, 0).sphere(0.2, glowMat('wild', 0xff3b3b, 0.6, 3), 0, 7.1, 0, 1, 5);

// --- instanced scatter ---------------------------------------------------------------------

interface Kind {
  prefab: Prefab;
  /** Scale range. */
  scale: [number, number];
  items: THREE.Matrix4[];
  tint: boolean;
}

const m4 = new THREE.Matrix4();
const fwd = new THREE.Vector3();
const north = new THREE.Vector3(0, 1, 0);

function placeAt(dir: THREE.Vector3, scale: number, lift = 0, out = new THREE.Matrix4()): THREE.Matrix4 {
  const up = dir.clone();
  const pos = dir.clone().multiplyScalar(R + reliefAt(dir) + lift);
  fwd.crossVectors(up, Math.abs(up.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : north).normalize();
  const a = rand() * Math.PI * 2;
  fwd.applyAxisAngle(up, a);
  return surfaceMatrix(pos, fwd, up, out, scale);
}

/** True when the direction is on or just beside a district's pad (leave room for the district itself). */
function inDistrict(dir: THREE.Vector3, margin: number): boolean {
  for (const z of ZONES) if (zoneWeight(z, dir, margin) > 0) return true;
  for (const a of avoid) if (a.dir.angleTo(dir) * R < a.r + margin) return true;
  // Lakes stay clear of trees, houses and lamps.
  if (reliefAt(dir) < -2.4) return true;
  return nearCorridor(dir, margin);
}

/** Small built-up spots outside the districts (break plazas) that the wilderness must keep clear. */
let avoid: { dir: THREE.Vector3; r: number }[] = [];

export function roadGeometry(path: SurfacePath, half: number): THREE.BufferGeometry {
  const n = Math.ceil(path.length / 1.2);
  const pos: number[] = [];
  const idx: number[] = [];
  const s = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
  const side = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    path.at((i / n) * path.length, s);
    side.crossVectors(s.up, s.tangent).normalize();
    for (const [o, dy] of [[-half - 1.2, -2.6], [-half, 0], [half, 0], [half + 1.2, -2.6]] as const) pos.push(...s.pos.clone().addScaledVector(side, o).addScaledVector(s.up, dy).toArray());
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    const a = i * 4 + k;
    const b = a + 4;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Scatter {
  readonly group = new THREE.Group();
  /** Villagers: stroll loops round each village plaza. */
  readonly ambient = new Ambient();
  private kinds: Kind[] = [];

  constructor(batch: StaticBatch, keepClear: { dir: THREE.Vector3; r: number }[] = []) {
    avoid = keepClear;
    const kinds = this.kinds;
    const kind = (prefab: Prefab, lo: number, hi: number, tint = true): Kind => {
      const k: Kind = { prefab, scale: [lo, hi], items: [], tint };
      kinds.push(k);
      return k;
    };
    const trees = [kind(roundTree(0x3f8f4a), 0.8, 1.3), kind(roundTree(0x5aa14a), 0.8, 1.2), kind(pine(0x2f7a55), 0.8, 1.4), kind(pine(0x3a8a5c), 0.7, 1.2)];
    const neon = [kind(neonTree(0xff4fa3), 0.8, 1.2, false), kind(neonTree(0x39ffe0), 0.8, 1.2, false)];
    const bushes = [kind(bush(0x4f9a4a), 0.8, 1.4), kind(bush(0x7aa84a), 0.8, 1.3)];
    const rocks = [kind(rock(0x7a7e86), 0.8, 2.2), kind(rock(0x6a5f58), 0.8, 2)];
    const crystals = [kind(crystal(0x39ffe0), 0.7, 1.6, false), kind(crystal(0xff4fa3), 0.7, 1.4, false)];
    const containers = [kind(container(0xc04a3a), 1, 1), kind(container(0x3a6fc0), 1, 1), kind(container(0xd0a23a), 1, 1)];
    const solars = kind(solar(), 1, 1.4);
    const masts = kind(mast(), 0.9, 1.4);
    const lamps = kind(lamp(), 1, 1);

    buildRoads();

    // Wilderness: every direction on a golden spiral, kept if it is clear of districts and not too close to a road.
    const N = 22000;
    const dir = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const y = 1 - ((i + 0.5) / N) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963 + rand() * 0.5;
      dir.set(Math.cos(th) * r, y, Math.sin(th) * r).normalize();
      if (inDistrict(dir, 3.5)) continue;
      const n = noise3(dir.x * 3.1 + 5, dir.y * 3.1, dir.z * 3.1);
      const m = noise3(dir.x * 7.7, dir.y * 7.7 + 9, dir.z * 7.7);
      const pick = rand();
      const polar = Math.abs(dir.y) > 0.9;
      if (polar) {
        if (pick < 0.16) rocks[i % 2].items.push(placeAt(dir, between(0.8, 1.8)));
        else if (pick < 0.2) crystals[i % 2].items.push(placeAt(dir, between(0.8, 1.6)));
        continue;
      }
      if (n > 0.12) {
        // Forest
        if (pick < 0.75) trees[(Math.floor(m * 40) + i) & 3].items.push(placeAt(dir, between(0.8, 1.35)));
        else if (pick < 0.88) bushes[i % 2].items.push(placeAt(dir, between(0.8, 1.4)));
        else if (pick < 0.92) neon[i % 2].items.push(placeAt(dir, between(0.9, 1.3)));
      } else if (n > -0.25) {
        // Meadow
        if (pick < 0.28) bushes[i % 2].items.push(placeAt(dir, between(0.7, 1.3)));
        else if (pick < 0.4) trees[i & 3].items.push(placeAt(dir, between(0.7, 1.1)));
        else if (pick < 0.46) rocks[i % 2].items.push(placeAt(dir, between(0.6, 1.2)));
        else if (pick < 0.5) neon[i % 2].items.push(placeAt(dir, between(0.8, 1.1)));
      } else {
        // Rocky wastes with glowing crystals
        if (pick < 0.4) rocks[i % 2].items.push(placeAt(dir, between(0.8, 2.4)));
        else if (pick < 0.47) crystals[i % 2].items.push(placeAt(dir, between(0.8, 1.7)));
        else if (pick < 0.55) bushes[i % 2].items.push(placeAt(dir, between(0.6, 1)));
      }
    }

    // A ring of trees, rocks and kit hugging each district's edge so districts feel joined to the land.
    for (const z of ZONES) {
      const c = new THREE.Vector3();
      for (let k = 0; k < 220; k++) {
        const a = rand() * Math.PI * 2;
        const hw = z.w / 2 + between(2, 7);
        const hd = z.d / 2 + between(2, 7);
        // Points around the rectangle perimeter in the zone's local frame.
        const edge = rand() * 4;
        const t = rand() * 2 - 1;
        const x = edge < 1 ? -hw : edge < 2 ? hw : t * hw;
        const zz = edge < 2 ? t * hd : edge < 3 ? -hd : hd;
        void a;
        c.copy(zoneDir(z, x, zz));
        const p = rand();
        if (inDistrict(c, 1.5)) continue;
        if (p < 0.4) trees[k & 3].items.push(placeAt(c, between(0.8, 1.2)));
        else if (p < 0.65) bushes[k % 2].items.push(placeAt(c, between(0.8, 1.2)));
        else if (p < 0.8) containers[k % 3].items.push(placeAt(c, 1));
        else if (p < 0.88) solars.items.push(placeAt(c, 1));
        else if (p < 0.93) masts.items.push(placeAt(c, 1));
        else lamps.items.push(placeAt(c, 1));
      }
    }

    // Roads with lamp posts. Built before any scenery so everything else can keep clear of them.
    function buildRoads(): void {
    const asphalt = M(0x24262d, { rough: 0.9 });
    const verge = M(0x4a4338);
    for (const def of ROADS) {
      if (def.pts.length < 2) continue;
      const pts = def.pts.map(([lo, la]) => lonLatDir(lo, la).multiplyScalar(R + 0.35));
      const closed = def.pts.length === 19;
      const path = SurfacePath.through3D(closed ? [...pts, pts[1]] : [pts[0], ...pts, pts[pts.length - 1]], 1.5);
      batch.addGeometry(asphalt, roadGeometry(path, def.width / 2));
      void verge;
      const s = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
      const side = new THREE.Vector3();
      for (let d = 6, k = 0; d < path.length - 4; d += 14, k++) {
        path.at(d, s);
        side.crossVectors(s.up, s.tangent).normalize();
        const off = (def.width / 2 + 1.1) * (k % 2 ? 1 : -1);
        const p = s.pos.clone().addScaledVector(side, off).addScaledVector(s.up, -0.3);
        if (!inDistrict(p.clone().normalize(), 0)) lamps.items.push(surfaceMatrix(p, s.tangent, s.up, new THREE.Matrix4()));
      }
      registerCorridor(path, def.width / 2 + 1.2);
    }
    }

    // Villages and low-rise districts: scattered over the whole planet, thicker toward the equatorial ring.
    const houses = [house(3.2, 2.4, 0xe8d8bd, 0xb5453a), house(3.6, 2.8, 0xcfd8e8, 0x445a8a), house(3, 2.2, 0xe7c9a0, 0x6a8a4a), house(3.4, 2.6, 0xd9c0d8, 0x7a3b6a)];
    const blocks = [block(4.5, 9, 0x4a5066, 0xff4fa3), block(5, 12, 0x3f4a64, 0x39ffe0), block(4, 7, 0x5a4a66, 0xffb02e), block(5.5, 14, 0x353d56, 0x7aa8ff)];
    const stalls = [stall(0xff4fa3), stall(0x39ffe0), stall(0xffb02e)];
    const tower = waterTower();
    const grain = silo();
    const folk: LookName[] = ['rice', 'corn', 'millet', 'quinoa', 'wheat', 'basmati'];
    const iglooPrefab = igloo();
    const cabinPrefab = cabin();
    const upAt = new THREE.Vector3();
    /** A matrix for something at direction d turned to face `towards`, with a little random turn. */
    const facing = (d: THREE.Vector3, towards: THREE.Vector3, lift: number, jitter: number, out = new THREE.Matrix4()): THREE.Matrix4 => {
      upAt.copy(d);
      const pos = d.clone().multiplyScalar(R + reliefAt(d) + lift);
      const f = towards.clone().sub(d);
      f.addScaledVector(upAt, -f.dot(upAt)).normalize().applyAxisAngle(upAt, (rand() - 0.5) * 2 * jitter);
      return surfaceMatrix(pos, f, upAt, out, 1);
    };
    const around = (centre: THREE.Vector3, east: THREE.Vector3, south: THREE.Vector3, ang: number, rad: number): THREE.Vector3 =>
      centre.clone().addScaledVector(east, (Math.cos(ang) * rad) / R).addScaledVector(south, (Math.sin(ang) * rad) / R).normalize();
    const heightAround = (centre: THREE.Vector3, east: THREE.Vector3, south: THREE.Vector3, rad: number): number => {
      let top = reliefAt(centre);
      for (let k = 0; k < 8; k++) top = Math.max(top, reliefAt(around(centre, east, south, (k / 8) * Math.PI * 2, rad)));
      return top;
    };
    const frameOf = (centre: THREE.Vector3): { east: THREE.Vector3; south: THREE.Vector3 } => {
      const east = new THREE.Vector3().crossVectors(centre, north).normalize();
      if (east.lengthSq() < 0.1) east.set(1, 0, 0);
      return { east, south: new THREE.Vector3().crossVectors(centre, east).normalize() };
    };
    const villagers = (centre: THREE.Vector3, east: THREE.Vector3, south: THREE.Vector3, radius: number, count: number, seed: number): void => {
      const ring: THREE.Vector3[] = [];
      for (let k = 0; k < 12; k++) {
        const d = around(centre, east, south, (k / 12) * Math.PI * 2, radius);
        ring.push(d.multiplyScalar(R + reliefAt(d) + 0.3));
      }
      const loop = SurfacePath.through3D([...ring, ring[0], ring[1]], 0.8);
      for (let k = 0; k < count; k++) {
        this.ambient.add({ path: loop, s: (k / count) * loop.length, speed: 0.9 + rand() * 0.8, look: folk[(seed + k) % folk.length], carry: k === 1 && rand() < 0.5, chores: ['coffee', 'news', 'gum', 'wave', 'inspect', 'sip'], dir: k % 3 === 2 ? -1 : 1 });
      }
    };

    // Cities: a handful of real towns spread well apart across the planet, each with a market square of stalls set out at
    // natural angles, shops of every kind (restaurants, a barber, a tailor ...) and low and mid-rise blocks round about.
    const citySites: THREE.Vector3[] = [];
    for (let tries = 0; tries < 2500 && citySites.length < 7; tries++) {
      dir.set(rand() * 2 - 1, rand() * 1.8 - 0.9, rand() * 2 - 1).normalize();
      if (citySites.some((s) => s.angleTo(dir) * R < 90)) continue;
      if (inDistrict(dir, 34)) continue;
      const g0 = reliefAt(dir);
      const { east, south } = frameOf(dir);
      if (g0 < -1.9 || heightAround(dir, east, south, 32) > 2.5) continue;
      const centre = dir.clone();
      citySites.push(centre);
      avoid.push({ dir: centre, r: 36 });
      const frame = new THREE.Matrix4();
      for (let k = 0; k < 28; k++) {
        const d = around(centre, east, south, rand() * Math.PI * 2, 13 + rand() * 20);
        if (inDistrict(d, 2) || reliefAt(d) < -1.9) continue;
        if (rand() < 0.22) {
          const spec = SHOP_KINDS[k % SHOP_KINDS.length];
          batch.place(shopPrefab('wild', spec.kind, spec.wall, spec.neon, 7 + rand() * 2, 5.5 + rand(), 4 + rand() * 1.6), facing(d, centre, 0.2, 0.5, frame));
        } else {
          batch.place(blocks[k & 3], facing(d, centre, 0.2, 0.6, frame));
        }
      }
      // The market square: stalls in loose arcs, none turned quite the same.
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + rand() * 0.4;
        batch.place(stalls[k % 3], facing(around(centre, east, south, a, 6 + rand() * 4), centre, 0.2, 0.7, frame));
      }
      for (let k = 0; k < 4; k++) lamps.items.push(placeAt(around(centre, east, south, (k / 4) * Math.PI * 2 + 0.4, 3), 1, 0.2));
      villagers(centre, east, south, 7.5, 5, citySites.length);
    }

    let villages = 0;
    for (let tries = 0; tries < 900 && villages < 72; tries++) {
      dir.set(rand() * 2 - 1, rand() * 1.6 - 0.8, rand() * 2 - 1).normalize();
      if (inDistrict(dir, 12)) continue;
      const centre = dir.clone();
      const ground = reliefAt(centre);
      if (ground < -1.9) continue;
      villages++;
      const vf = frameOf(centre);
      // High in the mountains the houses are igloos and log cottages.
      const alpine = heightAround(centre, vf.east, vf.south, 22) > 3.2;
      const urban = !alpine && rand() < 0.3;
      const count = urban ? 8 + Math.floor(rand() * 6) : 7 + Math.floor(rand() * 7);
      const frame = new THREE.Matrix4();
      const east = new THREE.Vector3().crossVectors(centre, north).normalize();
      if (east.lengthSq() < 0.1) east.set(1, 0, 0);
      const south = new THREE.Vector3().crossVectors(centre, east).normalize();
      for (let k = 0; k < count; k++) {
        const ang = rand() * Math.PI * 2;
        const rad = 6 + rand() * 16;
        const d = centre.clone().addScaledVector(east, (Math.cos(ang) * rad) / R).addScaledVector(south, (Math.sin(ang) * rad) / R).normalize();
        if (inDistrict(d, 2)) continue;
        frame.copy(placeAt(d, 1, 0.2));
        const p = rand();
        const prefab = alpine ? (p < 0.5 ? iglooPrefab : cabinPrefab) : urban && p < 0.55 ? blocks[k & 3] : p < 0.9 ? houses[k & 3] : p < 0.95 ? tower : grain;
        batch.place(prefab, frame);
      }
      // A little plaza with stalls and lamps.
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2 + rand();
        const d = centre.clone().addScaledVector(east, (Math.cos(ang) * 3.6) / R).addScaledVector(south, (Math.sin(ang) * 3.6) / R).normalize();
        batch.place(stalls[k % 3], placeAt(d, 1, 0.2));
        lamps.items.push(placeAt(centre.clone().addScaledVector(east, (Math.cos(ang + 1) * 5.4) / R).normalize(), 1, 0.2));
      }
      // Villagers stroll a loop round the plaza, stopping at the stalls.
      const ring: THREE.Vector3[] = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const d = centre.clone().addScaledVector(east, (Math.cos(a) * 6.2) / R).addScaledVector(south, (Math.sin(a) * 6.2) / R).normalize();
        ring.push(d.multiplyScalar(R + reliefAt(d) + 0.3));
      }
      const loop = SurfacePath.through3D([...ring, ring[0], ring[1]], 0.8);
      const folk: LookName[] = ['rice', 'corn', 'millet', 'quinoa', 'wheat', 'basmati'];
      for (let k = 0; k < 3; k++) {
        this.ambient.add({ path: loop, s: (k / 3) * loop.length, speed: 0.9 + rand() * 0.8, look: folk[(villages + k) % folk.length], carry: k === 1 && rand() < 0.5, chores: ['coffee', 'news', 'gum', 'wave', 'inspect', 'sip'], dir: k === 2 ? -1 : 1 });
      }
      // Clear the ground around the plaza (no trees through the market).
    }
    this.kinds = kinds;
    this.build();
    void m4;
    void colouredGeometry;
    batch.count += 0;
  }

  private build(): void {
    for (const k of this.kinds) {
      if (!k.items.length) continue;
      const geo = colouredGeometry(k.prefab);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
      const c = new THREE.Color();
      const p = new THREE.Vector3();
      // Split every kind into a few chunks by direction, so the GPU skips the far side of the planet.
      const chunks = new Map<number, THREE.Matrix4[]>();
      for (const m of k.items) {
        p.setFromMatrixPosition(m);
        const cell = (p.x > 0 ? 1 : 0) + (p.y > 0 ? 2 : 0) + (p.z > 0 ? 4 : 0) + (Math.abs(p.y) > R * 0.55 ? 8 : 0);
        let list = chunks.get(cell);
        if (!list) chunks.set(cell, (list = []));
        list.push(m);
      }
      for (const list of chunks.values()) {
        const mesh = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((m, i) => {
          mesh.setMatrixAt(i, m);
          if (k.tint) mesh.setColorAt(i, c.setHSL(0, 0, 0.82 + ((i * 37) % 19) / 80));
        });
        mesh.computeBoundingSphere();
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    }
  }
}

/** Direction of chart point (x, z) of a zone. */
function zoneDir(z: (typeof ZONES)[number], x: number, zz: number): THREE.Vector3 {
  return zoneChartCache(z).dir(x, zz);
}
import { zoneChart as zoneChartCache } from '../globe/zones';
