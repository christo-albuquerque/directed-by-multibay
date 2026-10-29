import * as THREE from 'three';
import type { Chart } from '../../globe/surface';
import { M, Prefab, StaticBatch, bentSlab, glowMat } from '../kit';
import type { Poi } from '../folk';

const TOP = 0.35;

function stall(zone: string): Prefab {
  const p = new Prefab()
    .box(3.2, 1.0, 1.0, M(0x7a3b2a))
    .box(3.5, 0.1, 1.3, M(0xd9b27c), 0, 1.0, 0.05)
    .cyl(0.08, 0.08, 3.0, M(0x4b2e1f), -1.7, 0, -0.45, 6)
    .cyl(0.08, 0.08, 3.0, M(0x4b2e1f), 1.7, 0, -0.45, 6)
    // Striped awning: alternating red and cream slats.
    .cyl(0.34, 0.3, 0.4, M(0x2b2f3a), 0.8, 1.1, -0.05, 12)
    .cyl(0.24, 0.24, 0.22, M(0xf5f0e6), -0.8, 1.1, 0.1, 10)
    .cyl(0.24, 0.24, 0.22, M(0xf5f0e6), -0.8, 1.32, 0.1, 10)
    .box(2.2, 0.55, 0.1, glowMat(zone, 0xff4fa3, 0.3, 2.2), 0, 3.3, -0.4);
  for (let i = 0; i < 8; i++) p.box(0.45, 0.08, 1.7, M(i % 2 ? 0xf5f0e6 : 0xd6342a), -1.58 + i * 0.45, 3.0 + 0.0, 0.2, 0, 0.28);
  for (const x of [-1.2, -0.4, 0.4, 1.2]) p.sphere(0.16, glowMat(zone, 0xff3b3b, 0.3, 2.0), x, 2.6, 0.9, 1, 6);
  return p;
}

function cart(zone: string): Prefab {
  void zone;
  return new Prefab()
    .box(2.0, 0.8, 0.9, M(0x2f8f83), 0, 0.25, 0)
    .box(2.2, 0.08, 1.05, M(0xe8e2d4), 0, 1.05, 0)
    .cyl(0.26, 0.26, 0.1, M(0x1c1e24), -0.7, 0.02, 0.5, 10)
    .cyl(0.26, 0.26, 0.1, M(0x1c1e24), 0.7, 0.02, 0.5, 10)
    .cyl(0.05, 0.05, 2.4, M(0x9aa4b2), 0, 1.1, -0.3, 5)
    .cone(1.4, 0.6, M(0xf2b134), 0, 3.3, -0.3, 10)
    .cyl(0.2, 0.2, 0.45, M(0xb8bec9), 0.5, 1.13, 0, 8);
}

function table(): Prefab {
  const p = new Prefab().cyl(0.1, 0.1, 0.7, M(0x8a8f9a), 0, 0, 0, 6).cyl(0.7, 0.7, 0.07, M(0xe6d3a8), 0, 0.7, 0, 14);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    p.cyl(0.1, 0.1, 0.42, M(0x8a5a2b), Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05, 6).cyl(0.24, 0.24, 0.06, M(0xb9763a), Math.cos(a) * 1.05, 0.42, Math.sin(a) * 1.05, 10);
    p.cyl(0.19, 0.14, 0.11, M(0xf5f0e6), Math.cos(a) * 0.42, 0.77, Math.sin(a) * 0.42, 10).cyl(0.16, 0.16, 0.02, M(0xe9c46a), Math.cos(a) * 0.42, 0.88, Math.sin(a) * 0.42, 8);
  }
  return p;
}

function hammock(): Prefab {
  return new Prefab()
    .cyl(0.07, 0.09, 1.6, M(0x6b4a2b), -1.5, 0, 0, 6)
    .cyl(0.07, 0.09, 1.6, M(0x6b4a2b), 1.5, 0, 0, 6)
    .box(2.7, 0.06, 0.8, M(0x4aa3a0), 0, 0.72, 0)
    .box(0.5, 0.05, 0.7, M(0xf1e7d0), -0.95, 0.8, 0);
}

function post(zone: string): Prefab {
  return new Prefab().cyl(0.06, 0.07, 3.4, M(0x4b2e1f), 0, 0, 0, 5).sphere(0.12, glowMat(zone, 0xffd166, 0.25, 2.4), 0, 3.45, 0, 1, 6).sphere(0.1, glowMat(zone, 0xff6b9d, 0.25, 2.4), 0.5, 3.2, 0.3, 1, 6).sphere(0.1, glowMat(zone, 0x6bd6ff, 0.25, 2.4), -0.5, 3.25, -0.3, 1, 6);
}

/** Ground slab plus a wooden crate pile. */
export function cratePile(): Prefab {
  const crate = M(0xb98a52);
  const band = M(0x8a6236);
  return new Prefab()
    .box(0.9, 0.9, 0.9, crate, -0.55, 0, 0).box(0.9, 0.9, 0.9, crate, 0.55, 0, 0.1).box(0.9, 0.9, 0.9, crate, 0, 0.9, 0.05, 0.3)
    .box(0.94, 0.1, 0.94, band, -0.55, 0.5, 0).box(0.94, 0.1, 0.94, band, 0.55, 0.5, 0.1).box(0.94, 0.1, 0.94, band, 0, 1.4, 0.05, 0.3);
}

/**
 * A break plaza beside a line: ramen stall, coffee cart, tables, hammocks and string lights on their own pad,
 * returned along with every seat grains can use.
 */
export function buildPlaza(batch: StaticBatch, chart: Chart, zone: string, cx: number, cz: number): Poi[] {
  batch.addGeometry(M(0x8a8478), bentSlab(chart, cx, cz, 10.4, 10.4, TOP, 3, 3));
  batch.addGeometry(M(0x9a9488), bentSlab(chart, cx, cz, 9.2, 9.2, TOP + 0.04, 3, 3));
  const at = (p: Prefab, x: number, z: number, rot = 0): void => void batch.placeOn(p, chart, cx + x, cz + z, TOP + 0.04, rot);
  const seats: Poi[] = [];
  const rest = (x: number, z: number, face: number, style: Poi['style'], lift = 0, dur: [number, number] = [14, 30]): void => {
    seats.push({ x: cx + x, z: cz + z, face, style, dur, lift, kind: 'rest' });
  };

  at(stall(zone), -0.2, -4.4, 0);
  at(cart(zone), 3.0, 3.8, Math.PI);
  at(table(), -2.2, -0.9);
  at(table(), 1.9, -0.3);
  at(hammock(), -2.3, 3.6, 0);
  at(hammock(), 1.2, 4.3, Math.PI);
  for (const [x, z] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]] as const) at(post(zone), x, z);

  // Seats: tables (ramen), hammocks (nap), counters (coffee, news), and a corner for chewing gum.
  for (const [tx, tz] of [[-2.2, -0.9], [1.9, -0.3]] as const) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      const sx = tx + Math.cos(a) * 1.05;
      const sz = tz + Math.sin(a) * 1.05;
      rest(sx, sz, Math.atan2(tx - sx, tz - sz), 'ramen', 0.48);
    }
  }
  rest(-2.3, 3.6, 0, 'nap', 0.6, [20, 40]);
  rest(1.2, 4.3, 0, 'nap', 0.6, [20, 40]);
  for (const x of [2.2, 3.4, 4.2]) rest(x, 2.6, Math.PI, 'coffee');
  for (const x of [-1.8, -0.6]) rest(x, -3.2, 0, 'news');
  for (const [x, z, f] of [[-4.0, 1.4, 0.6], [-3.4, 2.3, -0.5], [0, 2.2, 2.5]] as const) rest(x, z, f, 'gum');
  void THREE;
  return seats;
}
