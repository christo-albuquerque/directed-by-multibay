/** Where bays and break plazas go for a given number of repos. Pure, so it can be tested. */

export const BAY_SPACING = 15;
export const MAX_BAYS = 4;
export const PLAZA_R = 6.3;

/** Footprint of one bay's apron, relative to the bay's own z. */
export const BAY_X0 = -15;
export const BAY_X1 = 19;
export const BAY_Z0 = -7.5;
export const BAY_Z1 = 6.5;

export interface Spot {
  x: number;
  z: number;
}

export interface Layout {
  /** World z of each bay's belt line; bays stack away from the camera. */
  bayZ: number[];
  /** One break plaza per bay, in front of the first bay. */
  plazas: Spot[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  center: Spot;
  /** Radius of the planet slab needed to hold everything. */
  radius: number;
  /** Rough size of the scene, used to frame the camera. */
  fit: number;
}

const PLAZA_Z = 10.5;

export function planLayout(count: number): Layout {
  const n = Math.min(MAX_BAYS, Math.max(1, Math.floor(count)));
  const bayZ = Array.from({ length: n }, (_, i) => 0 - i * BAY_SPACING);
  const plazas: Spot[] =
    n === 1
      ? [{ x: 0, z: PLAZA_Z }]
      : n === 2
        ? [{ x: -7, z: PLAZA_Z }, { x: 7, z: PLAZA_Z }]
        : n === 3
          ? [{ x: -13, z: PLAZA_Z }, { x: 0, z: PLAZA_Z }, { x: 13, z: PLAZA_Z }]
          : [{ x: -7, z: PLAZA_Z }, { x: 7, z: PLAZA_Z }, { x: -7, z: PLAZA_Z + 13.5 }, { x: 7, z: PLAZA_Z + 13.5 }];

  const x0 = Math.min(BAY_X0, ...plazas.map((p) => p.x - PLAZA_R));
  const x1 = Math.max(BAY_X1, ...plazas.map((p) => p.x + PLAZA_R));
  const z0 = bayZ[n - 1] + BAY_Z0;
  const z1 = Math.max(BAY_Z1, ...plazas.map((p) => p.z + PLAZA_R));
  const center = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  const radius = Math.max(22, Math.hypot((x1 - x0) / 2, (z1 - z0) / 2) + 2);
  return { bayZ, plazas, bounds: { x0, x1, z0, z1 }, center, radius, fit: Math.max(z1 - z0, (x1 - x0) * 0.75) };
}
