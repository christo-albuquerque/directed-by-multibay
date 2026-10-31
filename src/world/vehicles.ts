import type { Material } from 'three';
import { M, Prefab, glowMat } from './kit';

const DARK = 0x23262d;

function wheel(p: Prefab, x: number, y: number, z: number, r: number, w = 0.5): void {
  p.cyl(r, r, w, M(0x1a1c22), x, y - r, z, 10);
  // Wheel discs lie along x: rotate by building a cylinder on its side with a box hub instead.
}

/** A small tractor with a seed drill behind it. Forward is +z. */
export function planter(): Prefab {
  const p = new Prefab();
  p.box(2.2, 1.2, 3, M(0x2f8f3c), 0, 0.7, 0.6).box(1.7, 1.3, 1.4, M(0xcfe8d0), 0, 1.9, 0.4).box(1.9, 0.12, 1.6, M(0x1f6a2c), 0, 3.15, 0.4);
  for (const x of [-1.25, 1.25]) {
    p.pipe(0.75, 0.55, M(0x1a1c22), x, 0.75, 1.5, 'x', 10).pipe(0.95, 0.55, M(0x1a1c22), x, 0.95, -0.8, 'x', 10);
  }
  // Seed drill: a wide bar with seed boxes and a row of little coulters.
  p.box(7.2, 0.35, 1.3, M(0x6b7280), 0, 0.9, -3.0).box(6.4, 0.9, 1.1, M(0xd9a441), 0, 1.25, -3.0);
  for (let i = -3; i <= 3; i++) p.box(0.12, 0.7, 0.12, M(DARK), i * 1.0, 0.2, -3.6);
  return p;
}

/** A combine harvester. Forward is +z. */
export function combine(): Prefab {
  const p = new Prefab();
  p.box(3.2, 2.0, 5.6, M(0xd9a441), 0, 1.1, -0.4).box(2.4, 1.7, 1.8, M(0xbfe3f2), 0, 3.1, 1.6).box(2.7, 0.14, 2.1, M(0x2b2f38), 0, 4.8, 1.6);
  p.box(2.2, 1.3, 2.4, M(0xb8862f), 0, 3.1, -2).pipe(0.4, 3.4, M(0x6b7280), 1.6, 4.1, -2.2, 'z', 8);
  for (const x of [-1.8, 1.8]) p.pipe(1.1, 0.7, M(0x1a1c22), x, 1.1, 1.4, 'x', 10).pipe(0.8, 0.6, M(0x1a1c22), x, 0.8, -2.3, 'x', 10);
  // Header: the wide reel that takes the crop in at the front.
  p.box(7.6, 0.7, 1.5, M(0xe3b94d), 0, 0.45, 3.4).box(7.6, 0.25, 1.1, M(0x2f8f3c), 0, 1.35, 3.6);
  for (let i = -3; i <= 3; i++) p.box(0.14, 0.9, 0.14, M(DARK), i * 1.1, 0.0, 4.2);
  return p;
}

/** A big mining dump truck. Forward is +z; the bed is empty (the load is a separate prop). */
export function dumpTruck(): Prefab {
  const p = new Prefab();
  p.box(4, 1.2, 9, M(0x3f4552), 0, 1.5, 0).box(3.2, 2.2, 2.4, M(0xf2a900), 0, 2.7, 3.4).box(2.6, 1.1, 0.1, M(0xbfe3f2), 0, 3.5, 4.65);
  p.box(4.4, 0.6, 5.6, M(0xe0e3e8), 0, 2.7, -1.2).box(0.4, 2.4, 5.6, M(0xe0e3e8), -2.1, 2.7, -1.2).box(0.4, 2.4, 5.6, M(0xe0e3e8), 2.1, 2.7, -1.2).box(4.4, 2.4, 0.4, M(0xe0e3e8), 0, 2.7, -4);
  for (const z of [3.2, -2.6]) for (const x of [-2.2, 2.2]) p.pipe(1.5, 1.0, M(0x1a1c22), x, 1.5, z, 'x', 10).pipe(0.7, 1.05, M(0x6b7280), x, 1.5, z, 'x', 8);
  p.box(0.5, 0.3, 0.2, glowMat('mine', 0xfff1b0, 0.5, 3), -1.1, 1.9, 4.7).box(0.5, 0.3, 0.2, glowMat('mine', 0xfff1b0, 0.5, 3), 1.1, 1.9, 4.7);
  return p;
}

/** A heap of ore that sits in a truck bed or a mine cart. Origin is its base. */
export function oreHeap(r = 1.6): Prefab {
  return new Prefab().sphere(r, M(0x7a7f8c), 0, r * 0.2, 0, 0.6, 7).sphere(r * 0.6, M(0xb28c4a), r * 0.3, r * 0.3, r * 0.2, 0.7, 6).sphere(r * 0.5, M(0x5d6370), -r * 0.4, r * 0.25, -r * 0.2, 0.7, 6);
}

/** A mine cart on rails. Forward is +z. */
export function mineCart(): Prefab {
  const p = new Prefab().box(2, 1.1, 2.7, M(0x5a4a3a), 0, 0.55, 0).box(2.2, 0.15, 2.9, M(0x2f2a24), 0, 1.6, 0);
  for (const z of [-0.9, 0.9]) for (const x of [-1.05, 1.05]) p.pipe(0.35, 0.2, M(0x1a1c22), x, 0.4, z, 'x', 8);
  return p;
}

/** A hover car for the market's sky lanes: sleek body, neon underglow. Forward is +z. */
export function hoverCar(zone: string, body: number, neon: number): Prefab {
  const p = new Prefab();
  p.box(1.8, 0.5, 4, M(body, { metal: 0.6, rough: 0.35 }), 0, 0.5, 0).box(1.4, 0.5, 1.8, M(0x1b2538, { metal: 0.8, rough: 0.2 }), 0, 0.95, -0.2);
  p.box(1.9, 0.1, 4.1, glowMat(zone, neon, 0.6, 3.2), 0, 0.25, 0).box(1.2, 0.12, 0.12, glowMat(zone, 0xffffff, 0.8, 3.5), 0, 0.7, 2.02);
  return p;
}

/** A courier drone carrying a crate. Forward is +z. */
export function courierDrone(zone: string): Prefab {
  const p = new Prefab().box(1.1, 0.4, 1.1, M(0x3a4458), 0, 0.2, 0).box(0.9, 0.9, 0.9, M(0xc89b5f), 0, -0.85, 0);
  for (const x of [-0.8, 0.8]) for (const z of [-0.8, 0.8]) p.box(0.1, 0.1, 0.1, M(0x1b2030), x, 0.4, z).box(1.0, 0.04, 0.2, glowMat(zone, 0x39ffe0, 0.6, 3), x, 0.55, z);
  return p;
}

/** A delivery truck for hauling finished boxes from a dock to the rocket port. Forward is +z. */
export function deliveryTruck(): Prefab {
  const p = new Prefab();
  p.box(2.8, 0.5, 7, M(0x2f3542), 0, 0.9, -0.4).box(2.8, 0.15, 4.4, M(0x4a5262), 0, 1.4, -1.6).box(0.15, 0.7, 4.4, M(0x4a5262), -1.4, 1.4, -1.6).box(0.15, 0.7, 4.4, M(0x4a5262), 1.4, 1.4, -1.6).box(2.8, 0.7, 0.15, M(0x4a5262), 0, 1.4, -3.7);
  p.box(2.8, 2.1, 2.2, M(0xd9552b), 0, 0.9, 2.4).box(2.5, 0.9, 0.1, M(0x9fd8ee), 0, 1.9, 3.52);
  for (const z of [2.4, -2.6]) for (const x of [-1.5, 1.5]) p.pipe(0.8, 0.5, M(0x1a1c22), x, 0.8, z, 'x', 10);
  p.box(0.4, 0.2, 0.15, glowMat('port', 0xfff1b0, 0.5, 3), -0.9, 1.1, 3.55).box(0.4, 0.2, 0.15, glowMat('port', 0xfff1b0, 0.5, 3), 0.9, 1.1, 3.55);
  return p;
}

export { wheel };

const HEAD = (): Material => M(0xfff1c0);
const TAIL = (): Material => M(0xff2a1a);

/** Head and tail lamps for the delivery truck, in the truck's own frame (forward is +z). */
export function deliveryTruckLights(): Prefab {
  const p = new Prefab();
  for (const x of [-0.9, 0.9]) p.box(0.45, 0.22, 0.1, HEAD(), x, 1.0, 3.56).box(0.4, 0.25, 0.1, TAIL(), x * 1.2, 1.0, -3.95);
  return p;
}

/** Head and tail lamps for the mine's dump truck. */
export function dumpTruckLights(): Prefab {
  const p = new Prefab();
  for (const x of [-1.1, 1.1]) p.box(0.5, 0.3, 0.12, HEAD(), x, 1.8, 4.72).box(0.5, 0.3, 0.12, TAIL(), x * 1.6, 1.7, -4.24);
  return p;
}

/** Head and tail lamps for a hover car. */
export function hoverCarLights(): Prefab {
  const p = new Prefab();
  for (const x of [-0.6, 0.6]) p.box(0.3, 0.16, 0.1, HEAD(), x, 0.62, 2.04).box(0.3, 0.14, 0.1, TAIL(), x, 0.6, -2.04);
  return p;
}
