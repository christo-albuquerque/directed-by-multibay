import * as THREE from 'three';
import { R, lonLatDir } from '../globe/surface';

/** A long road through [lon, lat] points (degrees) and its width in world units. */
export interface RoadDef {
  pts: [number, number][];
  width: number;
}

/** The planet's roads outside the districts. The equatorial ring has 19 points (a closed loop). */
export const ROADS: RoadDef[] = [
  { pts: [[0, 51], [20, 52], [44, 50], [66, 46], [74, 40]], width: 3 },
  { pts: [[16, -8], [30, -12], [48, -14]], width: 3 },
  { pts: [[-16, -8], [-30, -8], [-50, -6]], width: 3 },
  { pts: [[0, -19], [0, -40], [0, -70], [0, -110]], width: 3 },
  { pts: [[-45, 28], [-60, 42], [-62, 56], [-30, 62], [-8, 60]], width: 2.6 },
  { pts: [[62, -30], [90, -22], [118, -8], [140, 12]], width: 2.6 },
  { pts: [[-60, -26], [-90, -22], [-120, -8], [-145, 14]], width: 2.6 },
  // An equatorial ring that carries villages all the way round the planet.
  { pts: Array.from({ length: 19 }, (_, i): [number, number] => [-180 + i * 20, -34]), width: 2.8 },
];

/** Roads drawn elsewhere (supply trunks, the port avenue and east road) that mountains must also stay away from. */
const KEEP_CLEAR: RoadDef[] = [
  { pts: [[-54, -11], [-47, -8], [-46, -2], [-46, 16], [-46, 31], [-46, 46]], width: 3 },
  { pts: [[56, -2], [47, 2], [46, 6], [46, 24], [46, 38], [46, 46]], width: 3 },
  { pts: [[0, 3], [0, 25], [0, 46]], width: 3 },
  { pts: [[0, 4], [14, 4], [30, 4], [46, 5], [58, 10], [66, 18], [70, 24]], width: 3 },
];

let samples: THREE.Vector3[] | null = null;

function roadSamples(): THREE.Vector3[] {
  if (samples) return samples;
  samples = [];
  for (const r of [...ROADS, ...KEEP_CLEAR]) {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = lonLatDir(r.pts[i][0], r.pts[i][1]);
      const b = lonLatDir(r.pts[i + 1][0], r.pts[i + 1][1]);
      const steps = Math.max(2, Math.ceil((a.angleTo(b) * R) / 6));
      for (let k = 0; k <= steps; k++) samples.push(a.clone().lerp(b, k / steps).normalize());
    }
  }
  return samples;
}

/** Distance (world units) from a surface direction to the nearest road. */
export function roadDistance(dir: THREE.Vector3): number {
  let best = -1;
  for (const s of roadSamples()) best = Math.max(best, s.dot(dir));
  return Math.acos(Math.min(1, best)) * R;
}
