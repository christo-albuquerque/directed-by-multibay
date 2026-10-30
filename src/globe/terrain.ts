import * as THREE from 'three';
import { roadDistance } from '../world/roads';
import { R } from './surface';
import { ZONES, zoneChart, zoneWeight, type Zone } from './zones';

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise in 3D, roughly -1..1. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz);
  return (l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w)) * 2 - 1;
}

const BASE_A = new THREE.Color(0x8a4b3a);
const BASE_B = new THREE.Color(0x6e5a3c);
const COLORS: Record<string, THREE.Color> = {
  line: new THREE.Color(0x5d625f),
  city: new THREE.Color(0x33364a),
  port: new THREE.Color(0x6a6c70),
  farm: new THREE.Color(0x4f7f3c),
  mine: new THREE.Color(0x5a4636),
  power: new THREE.Color(0x58664a),
};
const ICE = new THREE.Color(0xdfe9f2);
const FOREST = new THREE.Color(0x3d6b35);
const MEADOW = new THREE.Color(0x6a8f45);
const ROCKY = new THREE.Color(0x7a6a58);
const WATER_COLOR = new THREE.Color(0x2f78c0);
const SNOW = new THREE.Color(0xf2f6fb);
const CRAG = new THREE.Color(0x8a8378);

const MINE_ZONE = ZONES.find((z) => z.kind === 'mine')!;

/** Depth of the open-pit mine at a direction (positive = deeper). */
export const PIT_RADIUS = 30;
export const PIT_DEPTH = 13;

export function pitDepth(dir: THREE.Vector3): number {
  const p = zoneChart(MINE_ZONE).toLocal(dir);
  return pitDepthAt(p.x, p.y);
}

/** Depth of the open-pit mine at chart (x, z) in the mine zone: a smooth bowl with a flat floor. */
export function pitDepthAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r >= PIT_RADIUS) return 0;
  const t = 1 - r / PIT_RADIUS;
  return PIT_DEPTH * Math.min(1, Math.pow(t * 1.35, 1.25));
}

/** Height offset below ground level R at a direction: rough low-poly relief, plus the mine pit. */
export function reliefAt(dir: THREE.Vector3): number {
  const n = noise3(dir.x * 7, dir.y * 7, dir.z * 7) * 0.5 + noise3(dir.x * 19, dir.y * 19, dir.z * 19) * 0.25 + 0.75;
  let h = -(n * 1.4) - pitDepth(dir);
  const mask = landMask(dir);
  if (mask > 0) {
    // Mountain ranges rise only well away from districts and roads; lakes fill flat basins in the same free land.
    const peak = THREE.MathUtils.smoothstep(noise3(dir.x * 2.3 + 11, dir.y * 2.3, dir.z * 2.3), 0.25, 0.7);
    h += peak * (0.75 + 0.25 * noise3(dir.x * 8.5, dir.y * 8.5, dir.z * 8.5)) * 15 * mask;
    const lake = THREE.MathUtils.smoothstep(noise3(dir.x * 2.9 + 40, dir.y * 2.9, dir.z * 2.9), 0.55, 0.75) * mask * (1 - peak);
    if (lake > 0.35) h = THREE.MathUtils.lerp(h, WATER_LEVEL, THREE.MathUtils.smoothstep(lake, 0.35, 0.6));
  }
  return h;
}

/** Height of lake water below ground level R. */
export const WATER_LEVEL = -2.8;

/** 0 next to a district or road, 1 well clear: mountains and lakes only appear where there is room. */
function landMask(dir: THREE.Vector3): number {
  let m = 1;
  for (const z of ZONES) m = Math.min(m, 1 - Math.min(1, zoneWeight(z, dir, 30)));
  if (m <= 0) return 0;
  return Math.min(m, THREE.MathUtils.smoothstep(roadDistance(dir), 12, 28));
}

/** Builds the planet surface: a low-poly sphere with biome colours and an excavated mine pit. */
export function buildTerrain(): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(R, 46);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  const colors = new Float32Array(n * 3);
  const dirs: THREE.Vector3[] = [];

  for (let i = 0; i < n; i++) {
    dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const h = reliefAt(dir);
    pos.setXYZ(i, dir.x * (R + h), dir.y * (R + h), dir.z * (R + h));
    dirs.push(dir.clone());
  }

  // One colour per face (flat shading): blend the biome colours at the face centre.
  const faceZones: Zone[] = ZONES;
  for (let f = 0; f < n; f += 3) {
    dir.copy(dirs[f]).add(dirs[f + 1]).add(dirs[f + 2]).normalize();
    const variation = noise3(dir.x * 23, dir.y * 23, dir.z * 23);
    // Biomes match the wilderness scatter: forest floor, meadow, rocky waste.
    const biome = noise3(dir.x * 3.1 + 5, dir.y * 3.1, dir.z * 3.1);
    color.copy(BASE_A).lerp(BASE_B, 0.5 + noise3(dir.x * 4, dir.y * 4, dir.z * 4) * 0.5);
    if (biome > 0.12) color.lerp(FOREST, 0.85);
    else if (biome > -0.25) color.lerp(MEADOW, 0.8);
    else color.lerp(ROCKY, 0.6);
    const hh = reliefAt(dir);
    if (hh < -2.4) color.copy(WATER_COLOR);
    else if (hh > 9) color.lerp(SNOW, 0.9);
    else if (hh > 3.5) color.lerp(CRAG, 0.8);
    for (const z of faceZones) {
      const w = zoneWeight(z, dir, 10);
      if (w > 0) color.lerp(COLORS[z.kind], Math.min(1, w * 0.9));
    }
    if (Math.abs(dir.y) > 0.93) color.lerp(ICE, Math.min(1, (Math.abs(dir.y) - 0.93) * 18));
    color.multiplyScalar(0.9 + variation * 0.1);
    for (let k = 0; k < 3; k++) colors.set([color.r, color.g, color.b], (f + k) * 3);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
