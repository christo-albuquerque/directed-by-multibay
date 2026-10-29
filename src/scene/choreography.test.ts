import { describe, expect, it } from 'vitest';
import { IMPACT_PHASE, pressDip, SHOT_PHASE, testPose } from './choreography';

describe('testPose', () => {
  it('starts and ends at rest', () => {
    for (const p of [0, 1]) {
      const pose = testPose(p);
      expect(pose.dy).toBeCloseTo(0);
      expect(pose.dz).toBeCloseTo(0);
      expect(pose.scaleY).toBeCloseTo(1);
    }
  });

  it('lifts the box, squashes it later, and never goes below the belt', () => {
    let maxDy = 0;
    let minScale = 1;
    for (let p = 0; p <= 1; p += 0.005) {
      const pose = testPose(p);
      maxDy = Math.max(maxDy, pose.dy);
      minScale = Math.min(minScale, pose.scaleY);
      expect(pose.dy).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(maxDy).toBeGreaterThan(1.5);
    expect(minScale).toBeLessThan(0.7);
  });

  it('fires the cannonball only between the shot and the impact', () => {
    expect(testPose(SHOT_PHASE - 0.01).ballT).toBeNull();
    expect(testPose((SHOT_PHASE + IMPACT_PHASE) / 2).ballT).toBeCloseTo(0.5);
    expect(testPose(IMPACT_PHASE + 0.01).ballT).toBeNull();
  });
});

describe('pressDip', () => {
  it('is zero away from the press and peaks as the product passes', () => {
    expect(pressDip(1)).toBe(0);
    expect(pressDip(3)).toBe(0);
    expect(pressDip(2.175)).toBeCloseTo(1, 1);
  });
});
