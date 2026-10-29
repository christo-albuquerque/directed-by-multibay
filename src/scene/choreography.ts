/** Pure timing curves for the product's trip through the test stage and the build press. */

export interface TestPose {
  /** World height of the bottom of the test head. */
  headY: number;
  /** Product offsets from its belt position. */
  dy: number;
  dz: number;
  scaleY: number;
  /** Jitter amplitude. */
  shake: number;
  /** 0..1 progress of the cannonball in flight, or null. */
  ballT: number | null;
}

export const HEAD_UP = 4.3;
export const HEAD_GRAB = 1.5;
export const IMPACT_PHASE = 0.45;
export const SHOT_PHASE = 0.37;

const LIFT_Y = 3.4;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/**
 * Test sequence over phase 0..1: head grabs and lifts the box, drops it (bounce), cannon shot,
 * wobble, then a hydraulic squash that it survives.
 */
export function testPose(p: number): TestPose {
  const pose: TestPose = { headY: HEAD_UP, dy: 0, dz: 0, scaleY: 1, shake: 0, ballT: null };
  if (p < 0.12) {
    pose.headY = lerp(HEAD_UP, HEAD_GRAB, ease(p / 0.12));
  } else if (p < 0.25) {
    pose.headY = lerp(HEAD_GRAB, LIFT_Y, ease((p - 0.12) / 0.13));
    pose.dy = pose.headY - HEAD_GRAB;
  } else if (p < 0.31) {
    const t = (p - 0.25) / 0.06;
    pose.headY = lerp(LIFT_Y, HEAD_UP, t);
    pose.dy = (LIFT_Y - HEAD_GRAB) * (1 - t * t);
  } else if (p < 0.37) {
    const t = (p - 0.31) / 0.06;
    pose.dy = 0.4 * 4 * t * (1 - t);
  }

  if (p >= SHOT_PHASE && p < IMPACT_PHASE) pose.ballT = (p - SHOT_PHASE) / (IMPACT_PHASE - SHOT_PHASE);
  if (p >= IMPACT_PHASE && p < 0.66) {
    const since = p - IMPACT_PHASE;
    pose.dz = -0.55 * Math.exp(-since * 14);
    pose.shake = 0.1 * Math.exp(-since * 9);
  }

  if (p >= 0.66) {
    if (p < 0.78) pose.headY = lerp(HEAD_UP, HEAD_GRAB, ease((p - 0.66) / 0.12));
    else if (p < 0.86) pose.headY = HEAD_GRAB;
    else pose.headY = lerp(HEAD_GRAB, HEAD_UP, ease(clamp01((p - 0.86) / 0.09)));

    if (p >= 0.78 && p < 0.84) pose.scaleY = lerp(1, 0.55, ease((p - 0.78) / 0.06));
    else if (p >= 0.84 && p < 0.88) pose.scaleY = 0.55;
    else if (p >= 0.88) pose.scaleY = lerp(0.55, 1, ease(clamp01((p - 0.88) / 0.08)));
  }
  return pose;
}

/** How far the build press is down (0..1) when a product is at path position `u`. */
export function pressDip(u: number): number {
  const ph = (u - 1.95) / 0.45;
  if (ph < 0 || ph > 1) return 0;
  return ph < 0.5 ? ease(ph * 2) : ease((1 - ph) * 2);
}
