import * as THREE from 'three';

/** World X of each stage, then the launchpad. Index = path position `u`. */
export const PATH_X = [-10, -6, -2, 2, 6, 12];
export const BELT_Y = 0.55;
/** Where the truck waits to be loaded, and where it parks beside the launchpad. */
export const TRUCK_DOCK_X = 8.3;
export const TRUCK_PAD_X = 9.6;

/** Position of a product at path value u: belt, then onto the truck, then to the pad. */
export function pathPosition(u: number, out = new THREE.Vector3()): THREE.Vector3 {
  if (u <= 4) {
    const c = Math.max(u, 0);
    const i = Math.min(Math.floor(c), 3);
    const f = c - i;
    return out.set(PATH_X[i] + (PATH_X[i + 1] - PATH_X[i]) * f, BELT_Y, 0);
  }
  if (u <= 4.5) return out.set(PATH_X[4] + ((u - 4) / 0.5) * (TRUCK_DOCK_X - PATH_X[4]), BELT_Y, 0);
  return out.set(TRUCK_DOCK_X + (Math.min(u, 5) - 4.5) / 0.5 * (TRUCK_PAD_X - TRUCK_DOCK_X), BELT_Y, 0);
}
