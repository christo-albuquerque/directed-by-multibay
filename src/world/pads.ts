import * as THREE from 'three';
import { bentSlab, M, StaticBatch } from './kit';
import { ZONES, zoneChart, type ZoneKind } from '../globe/zones';

const PAD_COLOR: Record<ZoneKind, number> = {
  line: 0x9ca19c,
  city: 0x4b4e66,
  port: 0xa3a5aa,
  farm: 0x5c7d40,
  mine: 0x6b5a48,
  power: 0x5d6b4c,
};

/** Flat foundations for every district, bent to the globe. Farms and mines sit straight on the terrain instead. */
export function buildPads(batch: StaticBatch): void {
  for (const z of ZONES) {
    if (z.kind === 'farm' || z.kind === 'mine') continue;
    const chart = zoneChart(z);
    batch.addGeometry(M(PAD_COLOR[z.kind], { side: THREE.DoubleSide }), bentSlab(chart, 0, 0, z.w, z.d, 0.35, 5, 6));
    // A slightly raised inner deck so the pad reads as a built platform, not just terrain.
    batch.addGeometry(M(((PAD_COLOR[z.kind] >> 1) & 0x7f7f7f) + 0x181818, { side: THREE.DoubleSide }), bentSlab(chart, 0, 0, z.w - 4, z.d - 4, 0.5, 0.2, 6));
  }
}
