import { M, Prefab, glowMat } from '../kit';

/** Everything a street can sell besides market stalls. */
export type ShopKind = 'restaurant' | 'barber' | 'tailor' | 'arcade' | 'pharmacy' | 'bakery' | 'teahouse';
export const SHOP_KINDS: { kind: ShopKind; sign: string; wall: number; neon: number }[] = [
  { kind: 'restaurant', sign: 'RAMEN HOUSE', wall: 0x4a2f2a, neon: 0xff4fa3 },
  { kind: 'barber', sign: 'BARBER', wall: 0x2e4a66, neon: 0x7aa8ff },
  { kind: 'restaurant', sign: 'STEAK HOUSE', wall: 0x3a2a2a, neon: 0xffb02e },
  { kind: 'tailor', sign: 'TAILOR', wall: 0x4a3a5a, neon: 0xc36bff },
  { kind: 'arcade', sign: 'ARCADE', wall: 0x20243a, neon: 0x39ffe0 },
  { kind: 'pharmacy', sign: 'PHARMACY', wall: 0x2f4a3f, neon: 0x6bff95 },
  { kind: 'bakery', sign: 'BAKERY', wall: 0x5a4632, neon: 0xffd166 },
  { kind: 'teahouse', sign: 'TEA HOUSE', wall: 0x3a4a3a, neon: 0x9bff6b },
  { kind: 'barber', sign: 'HAIR SALON', wall: 0x4a3552, neon: 0xff2d95 },
];

/**
 * A small street shop, front toward +z: walls, a lit shop window, an awning and details that say what it is (a barber's
 * striped pole, a restaurant's chimney and lanterns, an arcade's neon frame, a pharmacy's green cross).
 */
export function shopPrefab(zone: string, kind: ShopKind, wall: number, neon: number, w = 8, d = 6, h = 4.6): Prefab {
  const glass = glowMat(zone, 0xfff0c8, 0.2, 1.5);
  const accent = glowMat(zone, neon, 0.2, 2.2);
  const p = new Prefab().box(w, h, d, M(wall), 0, 0, 0).box(w + 0.4, 0.35, d + 0.4, M(0x23262d), 0, h, 0);
  // Shop window, door and a slanted awning over them.
  p.box(w * 0.55, h * 0.45, 0.12, glass, -w * 0.12, 0.7, d / 2 + 0.04).box(1.1, h * 0.55, 0.14, M(0x15171c), w * 0.32, 0, d / 2 + 0.05);
  p.box(w * 0.95, 0.18, 1.5, M(neon, { rough: 0.6 }), 0, h * 0.62, d / 2 + 0.7, 0, -0.25);
  p.box(w + 0.1, 0.12, 0.12, accent, 0, h + 0.2, d / 2 + 0.2);
  switch (kind) {
    case 'barber':
      // A striped barber's pole beside the door.
      p.cyl(0.35, 0.35, 0.3, M(0x9aa4b2), -w / 2 + 0.6, 0.3, d / 2 + 0.5, 8).cyl(0.3, 0.3, 2.2, M(0xf5f5f5), -w / 2 + 0.6, 0.6, d / 2 + 0.5, 8);
      for (let i = 0; i < 4; i++) p.box(0.66, 0.26, 0.66, M(i % 2 ? 0xdc2626 : 0x2f6fb5), -w / 2 + 0.6, 0.8 + i * 0.5, d / 2 + 0.5, 0.5);
      p.sphere(0.34, glowMat(zone, 0xffffff, 0.4, 1.8), -w / 2 + 0.6, 3, d / 2 + 0.5, 1, 6);
      break;
    case 'restaurant':
      p.cyl(0.35, 0.4, 2.2, M(0x5a606c), w * 0.3, h, -d * 0.2, 8);
      for (let i = 0; i < 5; i++) p.sphere(0.24, glowMat(zone, 0xff3b3b, 0.3, 1.9), -w * 0.4 + i * w * 0.2, h * 0.58, d / 2 + 1.5, 1, 6);
      break;
    case 'arcade':
      p.box(w * 0.9, 0.2, 0.1, accent, 0, 0.25, d / 2 + 0.1).box(0.2, h * 0.9, 0.1, accent, -w * 0.45, 0.2, d / 2 + 0.1).box(0.2, h * 0.9, 0.1, accent, w * 0.45, 0.2, d / 2 + 0.1);
      break;
    case 'pharmacy':
      p.box(1.3, 0.4, 0.15, glowMat(zone, 0x39ff8a, 0.3, 2.4), 0, h + 0.7, d / 2).box(0.4, 1.3, 0.15, glowMat(zone, 0x39ff8a, 0.3, 2.4), 0, h + 0.25, d / 2);
      break;
    case 'bakery':
      p.sphere(1.5, M(0xb8643a), -w * 0.25, h, -d * 0.1, 0.7, 8).cyl(0.3, 0.3, 1.6, M(0x5a606c), -w * 0.25, h + 0.8, -d * 0.1, 6);
      break;
    case 'tailor':
      for (let i = 0; i < 3; i++) p.cyl(0.35, 0.35, 0.8, M([0xdc2626, 0x2f6fb5, 0xf2b134][i]), -w * 0.4 + i * 0.8, 0, d / 2 + 0.6, 8);
      break;
    case 'teahouse':
      p.box(w + 1.4, 0.3, d + 1.4, M(0x6b3a2a), 0, h + 0.35, 0, 0, 0).box(w * 0.5, 0.5, d * 0.5, M(0x6b3a2a), 0, h + 0.65, 0);
      break;
  }
  return p;
}
