import * as THREE from 'three';

export type GrainVariant = 'rice' | 'corn' | 'wheat' | 'quinoa' | 'millet' | 'basmati' | 'medic' | 'hazmat';

interface Spec {
  r: number;
  l: number;
  legH: number;
  color: number;
}

const SPECS: Record<GrainVariant, Spec> = {
  rice: { r: 0.27, l: 0.35, legH: 0.22, color: 0xf0eae1 },
  corn: { r: 0.32, l: 0.3, legH: 0.22, color: 0xf5b041 },
  wheat: { r: 0.24, l: 0.45, legH: 0.22, color: 0xd9822b },
  quinoa: { r: 0.2, l: 0.1, legH: 0.16, color: 0xa63a2f },
  millet: { r: 0.17, l: 0.06, legH: 0.14, color: 0xf1d27a },
  basmati: { r: 0.2, l: 0.75, legH: 0.22, color: 0xf6efd9 },
  medic: { r: 0.27, l: 0.35, legH: 0.22, color: 0xfafafa },
  hazmat: { r: 0.29, l: 0.4, legH: 0.22, color: 0xe9e24a },
};

export interface GrainProps {
  chopsticks: THREE.Group;
  cup: THREE.Group;
  paper: THREE.Mesh;
  bubble: THREE.Mesh;
  zzz: THREE.Sprite;
  extinguisher: THREE.Group;
  stretcher: THREE.Mesh;
}

let paperTex: THREE.CanvasTexture | null = null;
function paperTexture(): THREE.CanvasTexture {
  if (paperTex) return paperTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f0e4';
  ctx.fillRect(0, 0, 64, 48);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(4, 4, 56, 8);
  ctx.fillStyle = '#8a8a8a';
  for (let y = 18; y < 44; y += 5) ctx.fillRect(4, y, y % 10 ? 26 : 22, 2), ctx.fillRect(34, y, 26, 2);
  paperTex = new THREE.CanvasTexture(c);
  paperTex.colorSpace = THREE.SRGBColorSpace;
  return paperTex;
}

let zTex: THREE.CanvasTexture | null = null;
function zTexture(): THREE.CanvasTexture {
  if (zTex) return zTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Z', 32, 34);
  zTex = new THREE.CanvasTexture(c);
  zTex.colorSpace = THREE.SRGBColorSpace;
  return zTex;
}

export interface GrainRig {
  variant: GrainVariant;
  /** World placement and heading. */
  root: THREE.Group;
  /** Rotates/hops about the body centre (flips, jumps, bobbing). */
  pivot: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  eyes: THREE.Mesh[];
  /** Crate held overhead; recoloured per job. */
  carry: THREE.Group;
  crateMat: THREE.MeshStandardMaterial;
  /** Crate that sits on the ground when a worker is poked mid-delivery. */
  dropped: THREE.Mesh;
  wheels: THREE.Mesh[];
  hasScooter: boolean;
  /** Hand-held and face props, shown by the worker's current activity. */
  props: GrainProps;
  armLen: number;
  /** Natural height (before random scaling). */
  height: number;
  /** Height of the hip joint above the feet; used for seat-less breaks. */
  hipY: number;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

const matCache = new Map<number, THREE.MeshStandardMaterial>();
function mat(color: number): THREE.MeshStandardMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, metalness: 0.02 });
    matCache.set(color, m);
  }
  return m;
}

let kernelMat: THREE.MeshStandardMaterial | null = null;
function cornMaterial(): THREE.MeshStandardMaterial {
  if (kernelMat) return kernelMat;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e39a1c';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#f8c04a';
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) ctx.fillRect(x + 1, y + 1, 6, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  kernelMat = new THREE.MeshStandardMaterial({ map: tex, flatShading: false, roughness: 0.7 });
  return kernelMat;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

function limb(len: number, radius: number, color: number, handColor?: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(geo(`limb${len}-${radius}`, () => new THREE.CylinderGeometry(radius, radius, len, 6)), mat(color), 0, -len / 2, 0));
  g.add(mesh(geo(`hand${radius}`, () => new THREE.SphereGeometry(radius * 1.25, 8, 6)), mat(handColor ?? color), 0, -len, 0));
  return g;
}

function hemi(r: number): THREE.BufferGeometry {
  return geo(`hemi${r}`, () => new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
}

/** Builds a procedurally generated, low-poly grain character. All geometry is created in code. */
export function createGrain(variant: GrainVariant): GrainRig {
  const { r, l, legH, color } = SPECS[variant];
  const top = legH + l + 2 * r;
  const height = top;
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  const inner = new THREE.Group();
  pivot.position.y = height / 2;
  inner.position.y = -height / 2;
  root.add(pivot);
  pivot.add(inner);

  // Torso.
  const bodyMat = variant === 'corn' ? cornMaterial() : mat(color);
  inner.add(mesh(geo(`body${r}-${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 12)), bodyMat, 0, legH + l / 2 + r, 0));

  // Face.
  const eyeY = legH + l + r * 1.1;
  const eyeGeo = geo('eye', () => new THREE.SphereGeometry(r * 0.3, 8, 6));
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = mesh(eyeGeo, mat(0x15171d), s * r * 0.45, eyeY, r * 0.86);
    inner.add(e);
    eyes.push(e);
  }

  // Limbs.
  const armLen = 0.18 + r * 0.55;
  const shoulderY = legH + l + r * 0.9;
  const skin = variant === 'hazmat' ? 0xcfc83a : color;
  const armL = limb(armLen, 0.06 + r * 0.05, skin, variant === 'hazmat' ? 0x2b2b2b : undefined);
  const armR = limb(armLen, 0.06 + r * 0.05, skin, variant === 'hazmat' ? 0x2b2b2b : undefined);
  armL.position.set(-(r + 0.03), shoulderY, 0);
  armR.position.set(r + 0.03, shoulderY, 0);
  const legL = limb(legH, 0.07, 0x3d3d46);
  const legR = limb(legH, 0.07, 0x3d3d46);
  legL.position.set(-r * 0.5, legH, 0);
  legR.position.set(r * 0.5, legH, 0);
  // Little shoes.
  for (const leg of [legL, legR]) leg.add(mesh(geo('shoe', () => new THREE.BoxGeometry(0.16, 0.07, 0.24)), mat(0x24262d), 0, -legH + 0.02, 0.05));
  inner.add(armL, armR, legL, legR);

  addOutfit(variant, inner, { r, l, legH, top, eyeY, armR });

  // Carried crate (hidden until needed) and the one dropped when poked.
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xc89b5f, flatShading: true });
  const crateGeo = geo('crate', () => new THREE.BoxGeometry(0.34, 0.3, 0.34));
  const carry = new THREE.Group();
  carry.add(mesh(crateGeo, crateMat));
  carry.position.set(0, top + (variant === 'rice' || variant === 'corn' ? 0.34 : 0.22), 0);
  carry.visible = false;
  inner.add(carry);
  const dropped = mesh(crateGeo, crateMat, 0, 0.15, 0.6);
  dropped.visible = false;
  root.add(dropped);

  // Scooter for the couriers.
  const wheels: THREE.Mesh[] = [];
  const hasScooter = variant === 'quinoa';
  if (hasScooter) {
    const s = new THREE.Group();
    s.add(mesh(geo('deck', () => new THREE.BoxGeometry(0.3, 0.05, 0.95)), mat(0x2f3542), 0, 0.14, 0));
    s.add(mesh(geo('post', () => new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6)), mat(0x9aa4b2), 0, 0.48, 0.42));
    s.add(mesh(geo('bar', () => new THREE.BoxGeometry(0.4, 0.04, 0.04)), mat(0x9aa4b2), 0, 0.83, 0.42));
    for (const z of [-0.38, 0.42]) {
      const w = mesh(geo('wheel', () => new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12)), mat(0x1c1e24), 0, 0.1, z);
      w.rotation.z = Math.PI / 2;
      wheels.push(w);
      s.add(w);
    }
    root.add(s);
    // Rider stands on the deck with hands on the bar.
    inner.position.y += 0.18;
    legL.position.x = -0.1;
    legR.position.x = 0.1;
  }

  // Props, hidden until a behaviour needs them.
  const chopsticks = new THREE.Group();
  for (const s of [-0.02, 0.02]) {
    const stick = mesh(geo('stick', () => new THREE.CylinderGeometry(0.012, 0.012, 0.38, 5)), mat(0x8a5a2b), s, 0, 0);
    chopsticks.add(stick);
  }
  chopsticks.add(mesh(geo('noodle', () => new THREE.BoxGeometry(0.07, 0.03, 0.07)), mat(0xe9c46a), 0, 0.17, 0));
  chopsticks.position.set(0, -armLen, 0.08);
  chopsticks.rotation.x = -1.1;
  chopsticks.visible = false;
  armR.add(chopsticks);

  const cup = new THREE.Group();
  cup.add(mesh(geo('cup', () => new THREE.CylinderGeometry(0.075, 0.06, 0.13, 10)), mat(0xf5f0e6), 0, 0.02, 0), mesh(geo('coffee', () => new THREE.CylinderGeometry(0.065, 0.065, 0.01, 10)), mat(0x4b2e1f), 0, 0.085, 0));
  cup.position.set(0, -armLen, 0.08);
  cup.visible = false;
  armL.add(cup);

  const paper = new THREE.Mesh(geo('newspaper', () => new THREE.PlaneGeometry(0.55, 0.41)), new THREE.MeshStandardMaterial({ map: paperTexture(), side: THREE.DoubleSide, roughness: 1 }));
  paper.position.set(0, shoulderY - 0.1, r + 0.2);
  paper.rotation.x = -0.25;
  paper.visible = false;
  inner.add(paper);

  const bubble = mesh(geo('bubble', () => new THREE.SphereGeometry(0.1, 10, 8)), new THREE.MeshStandardMaterial({ color: 0xff9bd0, roughness: 0.3, transparent: true, opacity: 0.85 }), 0, eyeY - r * 0.6, r * 0.95 + 0.03);
  bubble.scale.setScalar(0.01);
  bubble.visible = false;
  inner.add(bubble);

  const zzz = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture(), transparent: true, depthTest: false }));
  zzz.scale.setScalar(0.3);
  zzz.position.set(0, top + 0.3, 0);
  zzz.visible = false;
  zzz.renderOrder = 11;
  inner.add(zzz);

  const extinguisher = new THREE.Group();
  extinguisher.add(mesh(geo('ext', () => new THREE.CylinderGeometry(0.06, 0.06, 0.26, 8)), mat(0xdc2626), 0, 0, 0), mesh(geo('extNozzle', () => new THREE.ConeGeometry(0.03, 0.12, 6)), mat(0x1f2937), 0, 0.17, 0.0));
  extinguisher.position.set(0, -armLen, 0.1);
  extinguisher.rotation.x = Math.PI / 2;
  extinguisher.visible = false;
  armR.add(extinguisher);

  const stretcher = mesh(geo('stretcher', () => new THREE.BoxGeometry(0.16, 0.05, 1.1)), mat(0xe8e2d4), 0, shoulderY - 0.2, -r - 0.1);
  stretcher.rotation.x = 0.9;
  stretcher.visible = variant === 'medic';
  inner.add(stretcher);

  // Only the torso casts a shadow: shadows from hands, eyes and props are invisible at this size but cost
  // a draw call each, which adds up across a few hundred workers.
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = o.geometry instanceof THREE.CapsuleGeometry;
      o.receiveShadow = false;
    }
  });
  return {
    props: { chopsticks, cup, paper, bubble, zzz, extinguisher, stretcher },
    armLen,
    variant,
    root,
    pivot,
    armL,
    armR,
    legL,
    legR,
    eyes,
    carry,
    crateMat,
    dropped,
    wheels,
    hasScooter,
    height,
    hipY: legH,
  };
}

interface Dims {
  r: number;
  l: number;
  legH: number;
  top: number;
  eyeY: number;
  armR: THREE.Group;
}

function addOutfit(variant: GrainVariant, inner: THREE.Group, d: Dims): void {
  const { r, l, legH, top, eyeY } = d;
  const hardHat = (hex: number): void => {
    const hat = mesh(hemi(r * 1.08), mat(hex), 0, top - r * 0.72, 0);
    const brim = mesh(geo(`brim${r}`, () => new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.04, 16)), mat(hex), 0, top - r * 0.74, 0);
    brim.scale.z = 1.1;
    inner.add(hat, brim);
  };

  switch (variant) {
    case 'rice': {
      // Blue overalls: a band around the lower body.
      inner.add(mesh(geo(`overall${r}`, () => new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.32, 14)), mat(0x2f6fb5), 0, legH + 0.2, 0));
      hardHat(0xffc933);
      break;
    }
    case 'corn': {
      // Husk leaves around the base, orange hard hat.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leaf = mesh(geo('husk', () => new THREE.ConeGeometry(0.17, 0.75, 4)), mat(0x6fbf4a), Math.cos(a) * 0.24, legH + 0.32, Math.sin(a) * 0.24);
        leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        inner.add(leaf);
      }
      hardHat(0xff7a1a);
      break;
    }
    case 'wheat': {
      const band = mesh(geo(`band${r}`, () => new THREE.TorusGeometry(r * 0.86, 0.035, 6, 18)), mat(0xd62828), 0, eyeY + r * 0.45, 0);
      band.rotation.x = Math.PI / 2;
      inner.add(band);
      for (let i = 0; i < 5; i++) {
        const awn = mesh(geo('awn', () => new THREE.ConeGeometry(0.035, 0.5, 5)), mat(0xe9b44c), 0, top + 0.12, 0);
        awn.rotation.set((i - 2) * 0.22, 0, ((i % 2) - 0.5) * 0.5);
        inner.add(awn);
      }
      break;
    }
    case 'quinoa': {
      const cap = mesh(hemi(r * 1.05), mat(0x274c8f), 0, top - r * 0.7, -0.01);
      inner.add(cap);
      break;
    }
    case 'millet': {
      const sprout = mesh(geo('sprout', () => new THREE.ConeGeometry(0.04, 0.2, 5)), mat(0x6fbf4a), 0, top + 0.08, 0);
      inner.add(sprout);
      break;
    }
    case 'basmati': {
      const goggles = mesh(geo('goggles', () => new THREE.BoxGeometry(r * 1.8, 0.13, 0.08)), mat(0x1f2937), 0, eyeY, r * 0.92);
      const lensL = mesh(geo('lens', () => new THREE.BoxGeometry(0.1, 0.09, 0.02)), mat(0x7dd3fc), -r * 0.42, eyeY, r * 0.98);
      const lensR = mesh(geo('lens', () => new THREE.BoxGeometry(0.1, 0.09, 0.02)), mat(0x7dd3fc), r * 0.42, eyeY, r * 0.98);
      inner.add(goggles, lensL, lensR);
      const board = new THREE.Group();
      board.add(mesh(geo('board', () => new THREE.BoxGeometry(0.26, 0.34, 0.03)), mat(0x8a5a2b)), mesh(geo('paper', () => new THREE.BoxGeometry(0.21, 0.28, 0.012)), mat(0xf8fafc), 0, 0, 0.02));
      board.position.set(0, -0.3, 0.1);
      d.armR.add(board);
      break;
    }
    case 'medic': {
      const cap = mesh(hemi(r * 1.05), mat(0xffffff), 0, top - r * 0.72, 0);
      const crossA = mesh(geo('crossA', () => new THREE.BoxGeometry(0.2, 0.06, 0.02)), mat(0xdc2626), 0, top - r * 0.5, r * 0.98);
      const crossB = mesh(geo('crossB', () => new THREE.BoxGeometry(0.06, 0.2, 0.02)), mat(0xdc2626), 0, top - r * 0.5, r * 0.98);
      inner.add(cap, crossA, crossB);
      break;
    }
    case 'hazmat': {
      const hood = mesh(hemi(r * 1.1), mat(0xe9e24a), 0, top - r * 0.72, 0);
      const visor = mesh(geo('visor', () => new THREE.SphereGeometry(r * 0.62, 10, 8)), mat(0x1d4e5f), 0, eyeY, r * 0.72);
      visor.scale.set(1, 0.7, 0.7);
      const tank = mesh(geo('tank', () => new THREE.CylinderGeometry(0.1, 0.1, 0.45, 8)), mat(0x6b7280), 0, legH + l / 2 + r, -r * 1.05);
      inner.add(hood, visor, tank);
      break;
    }
  }
}
