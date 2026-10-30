import * as THREE from 'three';
import type { SurfacePath } from '../globe/path';
import { R } from '../globe/surface';

/**
 * Every belt, feeder and road registers the strip of ground it occupies here. Scenery placed later (trees, houses,
 * lamps, villages) keeps out of these strips, so nothing grows through a belt or sits on a road.
 */
interface Corridor {
  /** Packed unit directions of samples along the path. */
  dirs: Float32Array;
  /** Half width on the ground, in world units. */
  half: number;
}

const corridors: Corridor[] = [];
const s = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };

/** Records a path and the half-width of ground it covers. */
export function registerCorridor(path: SurfacePath, half: number, step = 2.5): void {
  const n = Math.max(2, Math.ceil(path.length / step));
  const dirs = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    path.at((i / n) * path.length, s);
    s.pos.normalize();
    dirs.set([s.pos.x, s.pos.y, s.pos.z], i * 3);
  }
  corridors.push({ dirs, half });
}

/** Whether a surface direction is within `margin` units of any registered belt, feeder or road. */
export function nearCorridor(dir: THREE.Vector3, margin: number): boolean {
  for (const c of corridors) {
    // Samples are `step` apart, so allow half a step of slack along the path.
    const cos = Math.cos((c.half + margin + 1.3) / R);
    const d = c.dirs;
    for (let i = 0; i < d.length; i += 3) if (d[i] * dir.x + d[i + 1] * dir.y + d[i + 2] * dir.z > cos) return true;
  }
  return false;
}

/** For audits: how many corridors are registered. */
export function corridorCount(): number {
  return corridors.length;
}

/**
 * Finds belts, feeders and roads whose ground footprints overlap (they would clip through each other). Returns one
 * entry per overlapping pair with where it happens, as longitude/latitude in degrees.
 */
export function auditCorridors(): { a: number; b: number; lon: number; lat: number; gap: number }[] {
  const out: { a: number; b: number; lon: number; lat: number; gap: number }[] = [];
  for (let a = 0; a < corridors.length; a++) {
    for (let b = a + 1; b < corridors.length; b++) {
      const A = corridors[a];
      const B = corridors[b];
      const need = (A.half + B.half) / R;
      let best = Infinity;
      let at = -1;
      for (let i = 0; i < A.dirs.length; i += 3) {
        for (let j = 0; j < B.dirs.length; j += 3) {
          const dot = A.dirs[i] * B.dirs[j] + A.dirs[i + 1] * B.dirs[j + 1] + A.dirs[i + 2] * B.dirs[j + 2];
          const ang = Math.acos(Math.min(1, dot));
          if (ang < best) {
            best = ang;
            at = i;
          }
        }
      }
      if (best < need) {
        const y = A.dirs[at + 1];
        out.push({ a, b, lon: Math.round((Math.atan2(A.dirs[at], A.dirs[at + 2]) * 180) / Math.PI), lat: Math.round((Math.asin(y) * 180) / Math.PI), gap: +(best * R - A.half - B.half).toFixed(1) });
      }
    }
  }
  return out;
}
