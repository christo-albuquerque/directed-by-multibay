import * as THREE from 'three';
import { SurfacePath, type PathSample } from '../globe/path';
import { Chart, R, lonLatDir } from '../globe/surface';
import { BeltSurface, ribbonMesh } from './belts';
import { M, Prefab, StaticBatch, bentSlab, glowMat } from './kit';
import type { Line } from './line/Line';
import { hood } from './line/prefabs';
import { surfaceMatrix } from './pools';
import type { Pools } from './types';

const sample: PathSample = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
const m4 = new THREE.Matrix4();

/** A long belt (usually raised on pillars) carrying crates from one hood to another, never stopping. */
export class Feeder {
  readonly mesh: THREE.Mesh;
  private belt = new BeltSurface();
  private items: number[] = [];
  private timer = Math.random() * 3;

  constructor(
    readonly path: SurfacePath,
    private tint: number,
    private interval: number,
    private speed = 4.2,
    batch?: StaticBatch,
    pillars = true,
  ) {
    this.mesh = ribbonMesh(path, 1.0, this.belt.mat);
    if (batch && pillars) this.addPillars(batch);
    // Start with the belt already busy.
    for (let s = 4; s < path.length - 4; s += 7 + Math.random() * 5) this.items.push(s);
  }

  private addPillars(batch: StaticBatch): void {
    const leg = new Map<number, Prefab>();
    for (let s = 6; s < this.path.length - 6; s += 9) {
      this.path.at(s, sample);
      const height = sample.pos.length() - R;
      if (height < 1.6) continue;
      const key = Math.round(height * 2);
      let p = leg.get(key);
      if (!p) {
        p = new Prefab().box(0.7, height - 0.1, 0.7, M(0x4a505c), 0, 0, 0).box(2.6, 0.3, 1.2, M(0x4a505c), 0, height - 0.4, 0);
        leg.set(key, p);
      }
      const ground = sample.pos.clone().setLength(R + 0.35);
      batch.place(p, surfaceMatrix(ground, sample.tangent, sample.up, new THREE.Matrix4()));
    }
  }

  update(dt: number, activity: number): void {
    this.belt.scroll(this.speed * dt);
    this.timer -= dt;
    const first = this.items[0];
    if (this.timer <= 0 && (first === undefined || first > 3.2)) {
      // Born inside the hood at the start of the belt.
      this.items.unshift(0);
      this.timer = this.interval * (1.5 - 0.7 * activity);
    }
    for (let i = 0; i < this.items.length; i++) this.items[i] += this.speed * dt;
    // Consumed inside the hood at the far end.
    while (this.items.length && this.items[this.items.length - 1] > this.path.length - 0.5) this.items.pop();
  }

  draw(pools: Pools, tint = this.tint): void {
    for (const s of this.items) {
      if (s < 1.4 || s > this.path.length - 1.4) continue;
      this.path.at(s, sample);
      surfaceMatrix(sample.pos.addScaledVector(sample.up, 0.9 + 0.4), sample.tangent, sample.up, m4);
      pools.crates.push(m4, tint);
    }
  }
}

/** A raised distribution hub: platform on pillars with a hood the trunk belt enters and the line belts leave. */
function hubPrefab(zone: string): Prefab {
  const p = new Prefab().box(22, 0.8, 22, M(0x5a606c), 0, 2.8, 0);
  for (const x of [-9, 9]) for (const z of [-9, 9]) p.box(1.6, 2.8, 1.6, M(0x434955), x, 0, z);
  p.add(hood(12, 10, 5.4, 0x7a8290), 0, 3.6, 0, 0);
  p.cyl(1.8, 1.8, 4, M(0xc9ccd2), -7, 3.6, 6, 12).cyl(1.8, 1.8, 4, M(0xc9ccd2), 7, 3.6, 6, 12);
  p.box(8, 0.5, 0.6, glowMat(zone, 0xffb02e, 0.3, 3), 0, 9.4, 6.2).box(6, 0.4, 0.4, glowMat(zone, 0x39ffe0, 0.3, 3), 0, 10.1, 6.2);
  return p;
}

/** A small raised outstation where a farm or mine puts crates on its trunk belt. */
export function makeOutpost(zone: string): Prefab {
  const p = new Prefab().box(12, 0.8, 12, M(0x5a606c), 0, 2.8, 0);
  for (const x of [-4.5, 4.5]) for (const z of [-4.5, 4.5]) p.box(1.3, 2.8, 1.3, M(0x434955), x, 0, z);
  p.add(hood(8, 8, 4.8, 0x7a8290), 0, 3.6, 0, 0);
  p.box(5, 0.4, 0.5, glowMat(zone, 0xffb02e, 0.3, 3), 0, 8.6, 4.2);
  return p;
}

export interface Hub {
  chart: Chart;
  /** Belt height inside the hub's hood. */
  center: THREE.Vector3;
}

export const HUB_HEIGHT = 4.9;

export function makeHub(batch: StaticBatch, lon: number, lat: number, id: string): Hub {
  const chart = new Chart(lonLatDir(lon, lat), 0);
  batch.addGeometry(M(0x6a6e75, { side: THREE.DoubleSide }), bentSlab(chart, 0, 0, 26, 26, 0.35, 4, 6));
  batch.placeOn(hubPrefab(id), chart, 0, 0, 0.35, 0);
  return { chart, center: chart.point(0, 0, HUB_HEIGHT) };
}

/**
 * Builds a feeder from a start point to an end point, arcing over the ground at belt height `h`, optionally dropping
 * to a final approach (for entering a line's depot).
 */
export function arcBetween(from: THREE.Vector3, to: THREE.Vector3, h: number, segments = 6): THREE.Vector3[] {
  const a = from.clone().normalize();
  const b = to.clone().normalize();
  const pts: THREE.Vector3[] = [];
  const omega = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Spherical interpolation keeps the belt following the planet.
    const k0 = Math.sin((1 - t) * omega) / Math.sin(omega || 1);
    const k1 = Math.sin(t * omega) / Math.sin(omega || 1);
    const d = a.clone().multiplyScalar(k0).addScaledVector(b, k1).normalize();
    pts.push(d.multiplyScalar(R + h));
  }
  return pts;
}

/** Wires the supply chain: farm and mine trunks into two hubs, and a raised belt from a hub to every line's depot. */
export function buildFeeders(batch: StaticBatch, lines: Line[], farmOut: THREE.Vector3, mineOut: THREE.Vector3): Feeder[] {
  const hubW = makeHub(batch, -47, 27, 'hubW');
  const hubE = makeHub(batch, 50, 27, 'hubE');
  const feeders: Feeder[] = [];
  const crop = 0xe6c64a;
  const ore = 0x8a929e;

  const addTrunk = (from: THREE.Vector3, hub: Hub, tint: number, viaLat?: number): void => {
    const a = from.clone().setLength(R + HUB_HEIGHT);
    const mid = viaLat !== undefined ? lonLatDir(viaLat, 66).multiplyScalar(R + HUB_HEIGHT) : null;
    const pts = mid ? [...arcBetween(a, mid, HUB_HEIGHT, 5), ...arcBetween(mid, hub.center, HUB_HEIGHT, 5).slice(1)] : arcBetween(a, hub.center, HUB_HEIGHT, 6);
    feeders.push(new Feeder(SurfacePath.through3D(pts, 1.1), tint, 2.6, 4.6, batch));
  };
  addTrunk(farmOut, hubW, crop);
  // Ore travels the long way round the north of the planet, over the power fields.
  addTrunk(mineOut, hubE, ore);

  lines.forEach((line, i) => {
    const hub = i % 2 === 0 ? hubW : hubE;
    const sup = line.supply();
    const out = sup.outside(HUB_HEIGHT);
    const pts = [...arcBetween(hub.center, out, HUB_HEIGHT, 4), sup.ramp(-52, 3.6), sup.ramp(-45, 2.0), sup.entry];
    feeders.push(new Feeder(SurfacePath.through3D(pts, 0.9), i % 2 === 0 ? crop : ore, 5.5, 4, batch));
  });
  return feeders;
}
