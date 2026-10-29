import { describe, expect, it } from 'vitest';
import { BAY_SPACING, MAX_BAYS, PLAZA_R, planLayout } from './layoutPlan';

describe('planLayout', () => {
  it('keeps the single-bay layout compact', () => {
    const l = planLayout(1);
    expect(l.bayZ).toEqual([0]);
    expect(l.plazas).toHaveLength(1);
    expect(l.radius).toBeGreaterThanOrEqual(22);
  });

  it('stacks bays away from the camera with a plaza per bay', () => {
    for (let n = 1; n <= MAX_BAYS; n++) {
      const l = planLayout(n);
      expect(l.bayZ).toHaveLength(n);
      expect(l.plazas).toHaveLength(n);
      for (let i = 1; i < n; i++) expect(l.bayZ[i - 1] - l.bayZ[i]).toBe(BAY_SPACING);
    }
  });

  it('keeps plazas from overlapping each other', () => {
    for (let n = 2; n <= MAX_BAYS; n++) {
      const { plazas } = planLayout(n);
      for (let i = 0; i < plazas.length; i++) {
        for (let j = i + 1; j < plazas.length; j++) {
          expect(Math.hypot(plazas[i].x - plazas[j].x, plazas[i].z - plazas[j].z)).toBeGreaterThanOrEqual(PLAZA_R * 2);
        }
      }
    }
  });

  it('makes the planet big enough to hold every corner', () => {
    for (let n = 1; n <= MAX_BAYS; n++) {
      const l = planLayout(n);
      for (const [x, z] of [[l.bounds.x0, l.bounds.z0], [l.bounds.x1, l.bounds.z0], [l.bounds.x0, l.bounds.z1], [l.bounds.x1, l.bounds.z1]]) {
        expect(Math.hypot(x - l.center.x, z - l.center.z)).toBeLessThanOrEqual(l.radius);
      }
    }
  });

  it('clamps the bay count', () => {
    expect(planLayout(0).bayZ).toHaveLength(1);
    expect(planLayout(99).bayZ).toHaveLength(MAX_BAYS);
  });
});
