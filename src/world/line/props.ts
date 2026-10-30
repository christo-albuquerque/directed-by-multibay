import { M, Prefab, glowMat } from '../kit';

/** Forklift body: chassis, cab, roof, wheels, counterweight and mast. Forward is +z. */
export function forkliftBody(): Prefab {
  return new Prefab()
    .box(1.3, 0.7, 1.9, M(0xf2a31b), 0, 0.3, -0.25)
    .box(1.1, 0.12, 1.1, M(0x2b2f3a), 0, 1.0, -0.4)
    .box(0.08, 1.1, 0.08, M(0x2b2f3a), -0.52, 1.0, -0.9)
    .box(0.08, 1.1, 0.08, M(0x2b2f3a), 0.52, 1.0, -0.9)
    .box(0.08, 1.1, 0.08, M(0x2b2f3a), -0.52, 1.0, 0.1)
    .box(0.08, 1.1, 0.08, M(0x2b2f3a), 0.52, 1.0, 0.1)
    .box(1.3, 0.1, 1.3, M(0x2b2f3a), 0, 2.15, -0.4)
    .box(1.2, 0.5, 0.5, M(0x3b3f4a), 0, 0.45, -1.35)
    .box(0.1, 2.4, 0.12, M(0x7a808c), -0.35, 0, 0.82)
    .box(0.1, 2.4, 0.12, M(0x7a808c), 0.35, 0, 0.82)
    .cyl(0.3, 0.3, 0.25, M(0x15171c), -0.7, 0.0, 0.5, 10)
    .cyl(0.3, 0.3, 0.25, M(0x15171c), 0.7, 0.0, 0.5, 10)
    .cyl(0.28, 0.28, 0.25, M(0x15171c), -0.7, 0.0, -0.8, 10)
    .cyl(0.28, 0.28, 0.25, M(0x15171c), 0.7, 0.0, -0.8, 10)
    .sphere(0.12, glowMat('props', 0xffb02e, 0.6, 3), 0, 2.3, -0.4, 1, 6);
}

/** The carriage and forks that slide up the mast. Origin at the mast's base. */
export function forkliftForks(): Prefab {
  return new Prefab().box(0.95, 0.5, 0.1, M(0x7a808c), 0, 0, 0.95).box(0.14, 0.08, 1.4, M(0x9aa4b2), -0.3, 0.05, 1.65).box(0.14, 0.08, 1.4, M(0x9aa4b2), 0.3, 0.05, 1.65);
}

/** Hazmat funnel: a wide hopper with hazard stripes where swept debris is dumped. */
export function funnel(zone: string): Prefab {
  const p = new Prefab().cyl(0.9, 0.9, 1.0, M(0x4a505c), 0, 0, 0, 10).cone(1.5, 1.2, M(0xe9e24a), 0, 1.0, 0, 10).box(0.5, 0.8, 0.5, M(0x2b2f3a), 0, 2.15, 0).box(1.9, 0.12, 0.12, glowMat(zone, 0xff3b2f, 0.3, 2), 0, 1.0, 1.0);
  for (let i = 0; i < 6; i++) p.box(0.25, 0.9, 0.06, M(i % 2 ? 0x111111 : 0xe9e24a), Math.cos(i) * 0.92, 0.02, Math.sin(i) * 0.92);
  return p;
}

/** Pneumatic cache tube: the hatch a courier shoots out of on a cache hit. */
export function tubeHatch(zone: string): Prefab {
  return new Prefab()
    .cyl(0.8, 0.9, 0.35, M(0x3a3f4b), 0, 0, 0, 10)
    .cyl(0.62, 0.62, 0.06, M(0x15171c), 0, 0.35, 0, 10)
    .cyl(0.75, 0.75, 0.08, glowMat(zone, 0x39ffe0, 0.3, 2.4), 0, 0.33, 0, 10)
    .cyl(0.2, 0.2, 2.6, M(0x8a93a3), 1.0, 0, 0.3, 6)
    .box(0.9, 0.5, 0.1, glowMat(zone, 0x39ffe0, 0.3, 2.0), 0, 1.4, -0.9);
}
