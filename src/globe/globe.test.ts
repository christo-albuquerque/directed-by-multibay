import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SurfacePath } from './path';
import { Chart, R, lonLatDir } from './surface';
import { MAX_LINES, ZONES, zoneChart, zoneWeight } from './zones';

describe('globe surface', () => {
  it('maps lon/lat to unit vectors', () => {
    const d = lonLatDir(0, 0);
    expect(d.length()).toBeCloseTo(1, 6);
    expect(lonLatDir(0, 90).y).toBeCloseTo(1, 6);
  });

  it('chart round-trips a local point and keeps heights on the sphere', () => {
    const chart = new Chart(lonLatDir(30, 20), 0);
    const dir = chart.dir(12, -7);
    const back = chart.toLocal(dir);
    expect(back.x).toBeCloseTo(12, 1);
    expect(back.y).toBeCloseTo(-7, 1);
    expect(chart.point(0, 0, 5).length()).toBeCloseTo(R + 5, 3);
  });
});

describe('master plan', () => {
  it('has unique zones and one line per repo slot', () => {
    expect(new Set(ZONES.map((z) => z.id)).size).toBe(ZONES.length);
    expect(ZONES.filter((z) => z.kind === 'line')).toHaveLength(MAX_LINES);
  });

  it('never lets two districts overlap', () => {
    for (let i = 0; i < ZONES.length; i++) {
      for (let j = i + 1; j < ZONES.length; j++) {
        const a = ZONES[i];
        const b = ZONES[j];
        const p = zoneChart(a).toLocal(lonLatDir(b.lon, b.lat));
        const overlapX = Math.abs(p.x) < (a.w + b.w) / 2;
        const overlapZ = Math.abs(p.y) < (a.d + b.d) / 2;
        expect(overlapX && overlapZ, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('weights are 1 at a zone centre and 0 far away', () => {
    const city = ZONES.find((z) => z.kind === 'city')!;
    expect(zoneWeight(city, lonLatDir(city.lon, city.lat))).toBe(1);
    expect(zoneWeight(city, lonLatDir(city.lon + 180, -city.lat))).toBe(0);
  });
});

describe('surface paths', () => {
  it('closed 3D loops report a positive length and stay near their height', () => {
    const pts = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0], [10, 0]].map(([lo, la]) => lonLatDir(lo, la).multiplyScalar(R + 12));
    const path = SurfacePath.through3D(pts, 2);
    expect(path.length).toBeGreaterThan(50);
    const s = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
    path.at(path.length / 2, s);
    expect(s.pos.length()).toBeGreaterThan(R + 5);
    expect(s.tangent.length()).toBeCloseTo(1, 3);
  });
});
