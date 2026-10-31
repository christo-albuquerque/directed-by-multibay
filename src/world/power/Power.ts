import * as THREE from 'three';
import { ZONES, zoneChart } from '../../globe/zones';
import { Dyn } from '../dyn';
import { M, Prefab, StaticBatch, glowMat, setGlow } from '../kit';
import { lamp, solarPanel } from '../line/prefabs';
import type { Env } from '../types';

const TOP = 0.35;

function battery(zone: string, color: number): Prefab {
  const p = new Prefab().box(6, 2.6, 2.4, M(color, { metal: 0.3 }), 0, 0, 0).box(6.2, 0.2, 2.6, M(0x23262d), 0, 2.6, 0);
  for (let i = 0; i < 5; i++) p.box(0.8, 0.3, 0.08, glowMat(zone, 0x6bff95, 0.2, 1.4), -2.4 + i * 1.2, 1.9, 1.24);
  p.box(0.5, 1.6, 0.08, M(0x15171c), 2.4, 0.3, 1.24);
  return p;
}

function turbineTower(): Prefab {
  return new Prefab().cyl(0.45, 0.85, 20, M(0xeef1f5), 0, 0, 0, 10).sphere(1.1, M(0xcfd3da), 0, 20, 0, 1, 8).box(1.2, 1.2, 2.4, M(0xdadfe6), 0, 19.5, -0.6);
}

function blades(): Prefab {
  const b = M(0xf8fafc);
  const p = new Prefab();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    p.box(0.5, 9.5, 0.18, b, Math.sin(a) * 0, 0, 0, 0).parts[p.parts.length - 1].m.premultiply(new THREE.Matrix4().makeRotationZ(a));
  }
  return p;
}

function pylon(zone: string): Prefab {
  const steel = M(0x7a808c);
  const p = new Prefab().box(0.5, 14, 0.5, steel, -1.1, 0, 0).box(0.5, 14, 0.5, steel, 1.1, 0, 0);
  for (const y of [4, 9]) p.box(2.8, 0.25, 0.25, steel, 0, y, 0);
  p.box(7, 0.3, 0.3, steel, 0, 13, 0);
  for (const x of [-3.2, 0, 3.2]) p.cyl(0.18, 0.18, 0.7, M(0xd8dde6), x, 12.2, 0, 6);
  p.box(0.3, 0.3, 0.3, glowMat(zone, 0xff3b3b, 0.5, 1.6), 0, 14.1, 0);
  return p;
}

function substation(zone: string): Prefab {
  const p = new Prefab().box(10, 0.3, 8, M(0x6b7280), 0, 0, 0);
  for (const x of [-3, 0, 3]) p.box(1.8, 3, 1.8, M(0x7a808c), x, 0.3, 0).cyl(0.2, 0.2, 1.4, M(0xd8dde6), x - 0.4, 3.3, 0, 6).cyl(0.2, 0.2, 1.4, M(0xd8dde6), x + 0.4, 3.3, 0, 6);
  p.box(4, 2.6, 2.4, M(0x4a505c), 0, 0.3, -3).box(1.2, 0.3, 0.1, glowMat(zone, 0xffb02e, 0.2, 1.4), 0, 2.2, -1.78);
  return p;
}

/**
 * The Power Fields: rows of solar panels, wind turbines with turning blades, battery containers and a substation with
 * pylons, all lit softly at night. It fills the district so no pad stands empty.
 */
export class Power {
  readonly group = new THREE.Group();
  private zoneId: string;
  private rotors: Dyn[] = [];

  constructor(batch: StaticBatch) {
    const zone = ZONES.find((z) => z.kind === 'power')!;
    const c = zoneChart(zone);
    this.zoneId = zone.id;
    const id = zone.id;
    // Solar arrays: three long rows of tilted panels facing the sun.
    for (const z of [-4, 4.5, 13]) {
      for (let i = 0; i < 17; i++) {
        if (Math.abs(-52 + i * 6.5) < 9) continue;
        batch.placeOn(solarPanel(id), c, -52 + i * 6.5, z, TOP, Math.PI);
      }
    }
    // Wind turbines along the north edge.
    for (let i = 0; i < 7; i++) {
      const x = -48 + i * 16;
      const z = -13;
      batch.placeOn(turbineTower(), c, x, z, TOP);
      this.rotors.push(new Dyn(blades(), c.matrix(x, z + 1.4, TOP + 20, 0), this.group));
    }
    // Batteries on the south edge, a substation at the centre with a line of pylons either side.
    for (let i = 0; i < 8; i++) batch.placeOn(battery(id, [0xc9ccd2, 0xb8c4d4][i % 2]), c, -38 + i * 10.5, 21 - 7.2, TOP, 0);
    batch.placeOn(substation(id), c, 0, 4.5, TOP, 0);
    for (const x of [-30, -18, 18, 30]) batch.placeOn(pylon(id), c, x, 0, TOP, 0);
    for (let x = -56; x <= 56; x += 14) for (const z of [-8.5, 17]) batch.placeOn(lamp(id), c, x, z, TOP);
  }

  update(env: Env, night: number): void {
    setGlow(this.zoneId, night * 0.7);
    this.rotors.forEach((r, i) => r.set(new THREE.Matrix4().makeRotationZ(env.elapsed * (0.8 + (i % 3) * 0.15))));
  }
}
