import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Chart, R } from '../globe/surface';

// --- materials ---------------------------------------------------------------

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export interface MatOpts {
  rough?: number;
  metal?: number;
  side?: THREE.Side;
}

/** Shared flat-shaded material. The same colour always returns the same object, which lets static meshes merge. */
export function M(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.rough ?? ''}|${o.metal ?? ''}|${o.side ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0.05, side: o.side ?? THREE.FrontSide });
    matCache.set(key, m);
  }
  return m;
}

// --- glowing (neon) materials, brightened per zone as night falls on it -----------

interface GlowEntry {
  mat: THREE.MeshStandardMaterial;
  day: number;
  night: number;
}
const glowGroups = new Map<string, GlowEntry[]>();
const glowCache = new Map<string, THREE.MeshStandardMaterial>();

/** Neon / lights: dim by day, bright at night. `group` is usually the zone id, so each place lights up with its own dusk. */
export function glowMat(group: string, color: number, day = 0.15, night = 2.2): THREE.MeshStandardMaterial {
  const key = `${group}|${color}|${day}|${night}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: day, flatShading: true, roughness: 0.5 });
    glowCache.set(key, m);
    let list = glowGroups.get(group);
    if (!list) glowGroups.set(group, (list = []));
    list.push({ mat: m, day, night });
  }
  return m;
}

/** Puts a hand-made material (e.g. a neon sign atlas) under the same dusk-driven glow control. */
export function registerGlow(group: string, mat: THREE.MeshStandardMaterial, day: number, night: number): void {
  let list = glowGroups.get(group);
  if (!list) glowGroups.set(group, (list = []));
  list.push({ mat, day, night });
}

/** 0 = full day, 1 = deep night for everything glowing in this group. */
export function setGlow(group: string, night: number): void {
  const list = glowGroups.get(group);
  if (!list) return;
  for (const e of list) e.mat.emissiveIntensity = e.day + (e.night - e.day) * night;
}

// --- primitives & prefabs --------------------------------------------------------

const geoCache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    const src = make();
    // Only position + normal survive, so every piece can merge with every other.
    const ni = src.index ? src.toNonIndexed() : src;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', ni.getAttribute('position'));
    out.setAttribute('normal', ni.getAttribute('normal'));
    g = out;
    geoCache.set(key, g);
  }
  return g;
}

const unitBox = (): THREE.BufferGeometry => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
const cylinder = (rt: number, rb: number, seg: number): THREE.BufferGeometry => cached(`cyl${rt}/${rb}/${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg));
const sphereG = (seg: number): THREE.BufferGeometry => cached(`sph${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.6))));
const coneG = (seg: number): THREE.BufferGeometry => cached(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg));

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  m: THREE.Matrix4;
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

function local(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
  return new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
}

/**
 * A building or machine authored in plain local units (+y up, +z toward the viewer). Positions are the centre
 * of the base for boxes/cylinders: `y` is the height of the bottom face.
 */
export class Prefab {
  readonly parts: Part[] = [];

  box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, ry = 0, rx = 0): this {
    this.parts.push({ geo: unitBox(), mat, m: local(x, y + h / 2, z, w, h, d, rx, ry, 0) });
    return this;
  }

  cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 12): this {
    this.parts.push({ geo: cylinder(rTop, rBottom, seg), mat, m: local(x, y + h / 2, z, 1, h, 1) });
    return this;
  }

  /** A cylinder lying along x (rotated about z) or z. */
  pipe(r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, axis: 'x' | 'z' = 'x', seg = 8): this {
    this.parts.push({ geo: cylinder(r, r, seg), mat, m: local(x, y, z, 1, len, 1, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0) });
    return this;
  }

  cone(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 10): this {
    this.parts.push({ geo: coneG(seg), mat, m: local(x, y + h / 2, z, r, h, r) });
    return this;
  }

  sphere(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, sy = 1, seg = 10): this {
    this.parts.push({ geo: sphereG(seg), mat, m: local(x, y, z, r, r * sy, r) });
    return this;
  }

  /** Adds another prefab's parts, moved to (x, y, z) and turned about y. */
  add(other: Prefab, x = 0, y = 0, z = 0, ry = 0): this {
    const m = local(x, y, z, 1, 1, 1, 0, ry, 0);
    for (const p of other.parts) this.parts.push({ geo: p.geo, mat: p.mat, m: new THREE.Matrix4().multiplyMatrices(m, p.m) });
    return this;
  }
}

/**
 * Collects static scenery and merges it into one mesh per material. Thousands of props become a few dozen
 * draw calls, which is what lets the planet be this big.
 */
export class StaticBatch {
  private byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  count = 0;

  private push(mat: THREE.Material, geo: THREE.BufferGeometry): void {
    let list = this.byMat.get(mat);
    if (!list) this.byMat.set(mat, (list = []));
    list.push(geo);
    this.count++;
  }

  /** Bakes a prefab at a world matrix (usually from `chart.matrix`). */
  place(p: Prefab, world: THREE.Matrix4): this {
    const m = new THREE.Matrix4();
    for (const part of p.parts) {
      m.multiplyMatrices(world, part.m);
      this.push(part.mat, part.geo.clone().applyMatrix4(m));
    }
    return this;
  }

  placeOn(p: Prefab, chart: Chart, x: number, z: number, h = 0, rot = 0): this {
    return this.place(p, chart.matrix(x, z, h, rot));
  }

  /** Adds ready-made world-space geometry (bent slabs, ribbons). Must have position + normal. */
  addGeometry(mat: THREE.Material, geo: THREE.BufferGeometry): this {
    const ni = geo.index ? geo.toNonIndexed() : geo;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', ni.getAttribute('position'));
    if (!ni.getAttribute('normal')) ni.computeVertexNormals();
    g.setAttribute('normal', ni.getAttribute('normal'));
    this.push(mat, g);
    return this;
  }

  build(castShadow = true): THREE.Group {
    const group = new THREE.Group();
    for (const [mat, list] of this.byMat) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      for (const g of list) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.byMat.clear();
    return group;
  }
}

// --- geometry that follows the planet's curve ---------------------------------------------

/**
 * A slab covering a chart rectangle, bent to the globe: a top surface at height `h` and a skirt dropping
 * `depth` below it, so the pad always meets the terrain whatever the relief underneath.
 */
export function bentSlab(chart: Chart, cx: number, cz: number, w: number, d: number, h: number, depth: number, cell = 5): THREE.BufferGeometry {
  const nx = Math.max(1, Math.ceil(w / cell));
  const nz = Math.max(1, Math.ceil(d / cell));
  const pos: number[] = [];
  const p = new THREE.Vector3();
  const grid = (i: number, j: number, hh: number): THREE.Vector3 => chart.point(cx - w / 2 + (w * i) / nx, cz - d / 2 + (d * j) / nz, hh, p).clone();
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, e: THREE.Vector3): void => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, e.x, e.y, e.z);
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) quad(grid(i, j, h), grid(i, j + 1, h), grid(i + 1, j + 1, h), grid(i + 1, j, h));
  }
  // Skirt on all four sides.
  for (let i = 0; i < nx; i++) {
    quad(grid(i, 0, h), grid(i + 1, 0, h), grid(i + 1, 0, h - depth), grid(i, 0, h - depth));
    quad(grid(i + 1, nz, h), grid(i, nz, h), grid(i, nz, h - depth), grid(i + 1, nz, h - depth));
  }
  for (let j = 0; j < nz; j++) {
    quad(grid(0, j + 1, h), grid(0, j, h), grid(0, j, h - depth), grid(0, j + 1, h - depth));
    quad(grid(nx, j, h), grid(nx, j + 1, h), grid(nx, j + 1, h - depth), grid(nx, j, h - depth));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Slab-like ring/disc on the globe: a bent disc of radius r. */
export function bentDisc(chart: Chart, cx: number, cz: number, radius: number, h: number, depth: number, seg = 28): THREE.BufferGeometry {
  const pos: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const top = chart.point(cx, cz, h);
  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * Math.PI * 2;
    const t1 = ((i + 1) / seg) * Math.PI * 2;
    chart.point(cx + Math.cos(t0) * radius, cz + Math.sin(t0) * radius, h, a);
    chart.point(cx + Math.cos(t1) * radius, cz + Math.sin(t1) * radius, h, b);
    pos.push(top.x, top.y, top.z, b.x, b.y, b.z, a.x, a.y, a.z);
    const a2 = chart.point(cx + Math.cos(t0) * radius, cz + Math.sin(t0) * radius, h - depth);
    const b2 = chart.point(cx + Math.cos(t1) * radius, cz + Math.sin(t1) * radius, h - depth);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z, a.x, a.y, a.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export { R };
