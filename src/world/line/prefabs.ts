import { M, Prefab, glowMat } from '../kit';
import { STAGE_COLOR } from './layout';

const DARK = 0x2f333d;
const STEEL = 0x9aa4b2;

/** A tunnel-like housing the belt runs through. Items inside are hidden from view by its walls and roof. */
export function hood(len: number, width: number, height: number, color: number): Prefab {
  const wall = 0.75;
  const p = new Prefab();
  p.box(wall, height, len, M(color), width / 2 - wall / 2, 0, 0).box(wall, height, len, M(color), -(width / 2 - wall / 2), 0, 0);
  p.box(width, 0.8, len, M(color), 0, height - 0.8, 0);
  // Rubber flaps at each end: items slide under them as they enter and leave.
  for (const z of [-len / 2, len / 2]) p.box(width - 2 * wall, height - 0.8 - 2.0, 0.25, M(DARK), 0, 2.0, z);
  // Trim stripes along the roof's long edges.
  for (const x of [-width / 2 + 0.2, width / 2 - 0.2]) p.box(0.3, 0.12, len, M(0xe9e4d8), x, height, 0);
  return p;
}

export function lamp(zone: string): Prefab {
  return new Prefab().cyl(0.14, 0.18, 4.2, M(DARK), 0, 0, 0, 6).box(0.9, 0.18, 0.5, M(DARK), 0, 4.2, 0).box(0.7, 0.1, 0.3, glowMat(zone, 0xffd9a0, 0.2, 3), 0, 4.1, 0);
}

export function tank(color = 0x9aa4b2, r = 2.1, h = 5): Prefab {
  return new Prefab().cyl(r, r, h, M(color), 0, 0.3, 0, 12).cone(r, 1.2, M(color), 0, 0.3 + h, 0, 12).box(0.4, h, 0.2, M(DARK), r * 0.9, 0.3, 0).cyl(0.3, 0.3, 1.2, M(DARK), 0, 0.3 + h + 1.2, 0, 6);
}

export function solarPanel(zone: string): Prefab {
  return new Prefab().box(0.2, 1.1, 0.2, M(DARK), 0, 0, 0).box(4.2, 0.12, 2.6, M(0x1d3a7a, { metal: 0.6, rough: 0.3 }), 0, 1.1, 0, 0, -0.55).box(4.3, 0.08, 0.1, glowMat(zone, 0x6fb4ff, 0.05, 0.5), 0, 1.0, 1.1, 0, -0.55);
}

export function pipeRack(len: number, zone: string): Prefab {
  const p = new Prefab();
  for (let z = -len / 2; z <= len / 2; z += 6) p.box(0.4, 3.2, 0.4, M(DARK), -1.1, 0, z).box(0.4, 3.2, 0.4, M(DARK), 1.1, 0, z).box(3, 0.3, 0.4, M(DARK), 0, 3.1, z);
  p.pipe(0.28, len, M(0xd9824a), -0.6, 3.5, 0, 'z', 8).pipe(0.28, len, M(0x6fb4ff), 0.6, 3.5, 0, 'z', 8).pipe(0.2, len, M(0xe9e24a), 0, 3.95, 0, 'z', 8);
  p.box(0.4, 0.2, 0.4, glowMat(zone, 0xff8a3a, 0.1, 1.5), 0, 4.2, len / 2 - 1);
  return p;
}

export function generator(zone: string, color = 0x3d4a5c): Prefab {
  const p = new Prefab().box(7, 4.2, 5, M(color), 0, 0.3, 0).box(7.2, 0.4, 5.2, M(DARK), 0, 4.5, 0);
  p.cyl(0.7, 0.8, 5.5, M(0x5a606c), 2.4, 4.5, 1.4, 10).cyl(0.7, 0.8, 4.2, M(0x5a606c), -2.4, 4.5, 1.4, 10);
  for (let i = 0; i < 4; i++) p.box(0.9, 0.4, 0.1, glowMat(zone, 0xff6a2a, 0.1, 2), -2.4 + i * 1.6, 2.2, 2.55);
  return p;
}

/** The DEPENDENCIES depot: orange hood with storage silos and an intake hopper. */
export function depot(zone: string): Prefab {
  const p = hood(10, 9.4, 4.8, STAGE_COLOR.depot);
  p.cyl(1.7, 1.7, 3.6, M(0xc9ccd2), -2.6, 4.8, -1.8, 12).cone(1.7, 1.3, M(0xc9ccd2), -2.6, 8.4, -1.8, 12);
  p.cyl(1.7, 1.7, 3.6, M(0xc9ccd2), 2.6, 4.8, -1.8, 12).cone(1.7, 1.3, M(0xc9ccd2), 2.6, 8.4, -1.8, 12);
  p.box(5.2, 0.5, 1.6, M(DARK), 0, 4.8, 3).box(5.6, 0.2, 0.4, glowMat(zone, STAGE_COLOR.depot, 0.2, 3), 0, 5.6, 3.8);
  p.pipe(0.35, 5.6, M(STEEL), 0, 9.4, -1.8, 'x', 8);
  return p;
}

/** LINT: an open scanner gantry; items stay visible while a beam sweeps over them. */
export function lint(zone: string): Prefab {
  const p = new Prefab();
  for (const x of [-4.6, 4.6]) p.box(1.1, 5, 1.1, M(STAGE_COLOR.lint), x, 0, 0).box(1.5, 0.5, 1.5, M(DARK), x, 0, 0);
  p.box(10.4, 0.9, 1.4, M(STAGE_COLOR.lint), 0, 4.6, 0);
  p.box(9, 0.14, 0.3, glowMat(zone, 0x39ffe0, 0.2, 3), 0, 4.4, 0);
  p.box(3, 2.4, 2.2, M(0x2b2f38), 6.4, 0, 2.4).box(2.4, 0.3, 1.6, glowMat(zone, 0x39ffe0, 0.2, 2.4), 6.4, 2.4, 2.4);
  return p;
}

/** BUILD: a hooded press with a frame for the piston, a smokestack and glowing vents. */
export function build(zone: string): Prefab {
  const p = hood(10, 9.4, 4.6, STAGE_COLOR.build);
  for (const x of [-3.6, 3.6]) for (const z of [-3.2, 3.2]) p.box(1, 3.6, 1, M(0x2b4f8c), x, 4.6, z);
  p.box(8.6, 1.2, 7.4, M(0x2b4f8c), 0, 8.2, 0);
  p.cyl(1, 1.1, 8, M(0x5a606c), 3.4, 4.6, -3.6, 10).cyl(1.25, 1.1, 0.6, M(DARK), 3.4, 12.6, -3.6, 10);
  for (let i = 0; i < 3; i++) p.box(1.4, 0.35, 0.12, glowMat(zone, 0xff7a2a, 0.15, 2.6), -3 + i * 3, 3.2, 4.7).box(1.4, 0.35, 0.12, glowMat(zone, 0xff7a2a, 0.15, 2.6), -3 + i * 3, 3.2, -4.7);
  p.pipe(0.3, 9, M(0xd9824a), 0, 3.6, 0, 'x', 8);
  return p;
}

/** The piston head that stamps down inside the build frame. Origin is the lowest point of its stroke. */
export function pistonHead(): Prefab {
  return new Prefab().box(6.6, 1.1, 5.6, M(0xcbd5e1), 0, 0, 0).box(1.4, 3.2, 1.4, M(0x64748b), 0, 1.1, 0).box(6.8, 0.25, 5.8, M(0xf59e0b), 0, -0.2, 0);
}

/** TESTING GROUNDS: a walled arena open to the sky with gates on the belt axis, gantry towers and cannon mounts. */
export function arena(zone: string): Prefab {
  const p = new Prefab();
  const W = 15;
  const L = 16;
  p.box(W, 0.03, L, M(0x8e8a84), 0, 0.005, 0);
  for (const x of [-W / 2, W / 2]) p.box(0.9, 3.6, L, M(0xc9c2b4), x, 0, 0);
  for (const z of [-L / 2, L / 2]) for (const sx of [-1, 1]) p.box(W / 2 - 3.4, 3.6, 0.9, M(0xc9c2b4), sx * (W / 4 + 1.7), 0, z);
  // Caution stripes along the wall tops.
  for (const x of [-W / 2, W / 2]) p.box(1.1, 0.25, L + 0.2, glowMat(zone, 0xffb02e, 0.12, 1.2), x, 3.95, 0);
  // Gantry across the arena: towers and a beam the crane heads hang from.
  for (const x of [-6.4, 6.4]) p.box(1, 8.6, 1, M(0x64748b), x, 0, -2.4);
  p.box(14, 0.9, 1.2, M(0x64748b), 0, 8.4, -2.4);
  // Cannon mounts on both walls and a red target ring wall.
  for (const sx of [-1, 1]) {
    p.box(2.2, 1.2, 2.2, M(0x3d4658), sx * 6, 0, 3).box(1.2, 0.2, 1.2, glowMat(zone, 0xff3b2f, 0.12, 2), sx * 6, 1.6, 3);
  }
  return p;
}

/** A crane head that lifts and squashes the box. Origin is the bottom of the head. */
export function craneHead(): Prefab {
  return new Prefab().box(1.5, 0.45, 1.5, M(0x94a3b8), 0, 0, 0).box(0.6, 0.25, 0.6, M(0xf59e0b), 0, 0.45, 0);
}

export function cannonBarrel(): Prefab {
  return new Prefab().cyl(0.3, 0.42, 1.7, M(0x334155), 0, 0, 0, 10);
}

/** DISPATCH: a purple packing hood; boxes are sealed and labelled inside. */
export function dispatch(zone: string): Prefab {
  const p = hood(10, 9.4, 4.2, STAGE_COLOR.dispatch);
  p.box(5.4, 0.5, 1.4, M(DARK), 0, 4.2, 3.2).box(5.8, 0.2, 0.4, glowMat(zone, STAGE_COLOR.dispatch, 0.2, 3), 0, 4.9, 3.9);
  p.box(1.4, 3.4, 1.4, M(0x4a3a78), -3.6, 4.2, -3.4).box(1.4, 3.4, 1.4, M(0x4a3a78), 3.6, 4.2, -3.4).box(8.6, 0.8, 1.6, M(0x4a3a78), 0, 7.6, -3.4);
  p.box(0.5, 0.5, 0.5, glowMat(zone, 0x39ff8a, 0.3, 3), 0, 8.4, -3.4);
  return p;
}

/** The loading bay at the end of the belt: a small hood and an apron where trucks wait to collect boxes. */
export function dock(zone: string): Prefab {
  const p = hood(7, 9.4, 3.8, 0x4a3a78);
  p.box(14, 2.4, 16, M(0x4c505a), 0, -2.39, 11).box(14.2, 0.2, 0.4, glowMat(zone, 0xffd24a, 0.15, 2), 0, 0.06, 3);
  p.box(0.6, 1.4, 0.6, M(0xf5c542), -6.4, 0, 18).box(0.6, 1.4, 0.6, M(0xf5c542), 6.4, 0, 18);
  return p;
}

/** A packaging machine straddling a side belt loop. */
export function packer(zone: string, color = 0x6a5acd): Prefab {
  const p = hood(5, 4.6, 3.2, color);
  p.box(3.2, 0.3, 0.4, glowMat(zone, 0xff2d95, 0.2, 2.6), 0, 3.3, 2.7);
  return p;
}

export function walkwayPost(zone: string): Prefab {
  return new Prefab().cyl(0.08, 0.1, 1.3, M(DARK), 0, 0, 0, 5).box(0.35, 0.08, 0.2, glowMat(zone, 0x39ffe0, 0.2, 2), 0, 1.3, 0);
}

export function hut(zone: string): Prefab {
  const p = new Prefab().box(4.4, 3.4, 3.6, M(0xf1f1f1), 0, 0, 0).box(4.9, 0.4, 4.1, M(0xdc2626), 0, 3.4, 0);
  p.box(1.4, 2.2, 0.15, M(0x3d4658), 0, 0, 1.85).box(1.8, 0.35, 0.1, glowMat(zone, 0xff3b3b, 0.2, 2.4), 0, 3.2, 1.86);
  p.box(0.9, 0.3, 0.12, M(0xdc2626), -1.5, 2.2, 1.85).box(0.3, 0.9, 0.12, M(0xdc2626), -1.5, 1.9, 1.85);
  return p;
}
