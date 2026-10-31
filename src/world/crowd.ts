import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceMatrix } from './pools';

export type Outfit = 'overalls' | 'husk' | 'awn' | 'sprout' | 'goggles' | 'cross' | 'hazmat';

/** Looks and sizes for each grain type. */
export interface GrainLook {
  body: number;
  /** 0 = no hat. */
  hat: number;
  scale: number;
  /** Extra detail drawn on top of the plain body (overalls, husks, goggles ...). */
  outfit?: Outfit;
  /** Width and length of the torso relative to the standard grain. */
  girth?: number;
  len?: number;
}

export const LOOKS = {
  rice: { body: 0xf0eae1, hat: 0xffc933, scale: 1, outfit: 'overalls' },
  corn: { body: 0xf5b041, hat: 0xff7a1a, scale: 1.1, outfit: 'husk', girth: 1.15 },
  wheat: { body: 0xd9822b, hat: 0, scale: 1, outfit: 'awn', len: 1.2, girth: 0.9 },
  quinoa: { body: 0xa63a2f, hat: 0x274c8f, scale: 0.78, len: 0.7 },
  millet: { body: 0xf1d27a, hat: 0, scale: 0.66, outfit: 'sprout', len: 0.6, girth: 0.8 },
  basmati: { body: 0xf6efd9, hat: 0, scale: 1.12, outfit: 'goggles', len: 1.5, girth: 0.75 },
  medic: { body: 0xfafafa, hat: 0xffffff, scale: 1, outfit: 'cross' },
  hazmat: { body: 0xe9e24a, hat: 0xe9e24a, scale: 1.05, outfit: 'hazmat', girth: 1.08 },
  punk: { body: 0xc9a6ff, hat: 0xff2d95, scale: 1 },
  neon: { body: 0x8ff0ff, hat: 0x6bff95, scale: 1 },
} satisfies Record<string, GrainLook>;
export type LookName = keyof typeof LOOKS;

/** Things grains hold. Right/left hand props hang off the arm; body props sit on the torso. */
export type HandProp = 'rifle' | 'chopsticks' | 'cup' | 'extinguisher' | 'board' | 'broom' | 'wrench' | 'magnifier' | 'duster' | 'glow' | 'flag';
export type BodyProp = 'paper' | 'bubble' | 'stretcher';

/** One grain to draw this frame, in surface-relative terms. */
export interface GrainPose {
  propR?: HandProp;
  propL?: HandProp;
  propBody?: BodyProp;
  /** 0 = none, 1 = box held overhead, 2 = box on the ground in front of the grain. */
  crate?: 0 | 1 | 2;
  crateColor?: number;
  scooter?: boolean;
  /** 0 = eyes shut, 1 = open, above 1 = wide. */
  eyeOpen?: number;
  /** Size of the chewing-gum bubble (body prop 'bubble'). */
  bubble?: number;
  pos: THREE.Vector3;
  forward: THREE.Vector3;
  up: THREE.Vector3;
  look: GrainLook;
  /** Radians about the x axis; negative swings forward. */
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  /** Extra lift (steps, hops) and forward lean of the whole body. */
  bob: number;
  lean: number;
  /** Sideways tilt (lying down, stumbling). */
  roll: number;
  /** Sideways swing of the right arm (waving, wiping). */
  swingR?: number;
}

const BODY_Y = 0.22 + 0.175 + 0.27;
const SHOULDER = new THREE.Vector3(0.31, 0.94, 0);
const HIP = new THREE.Vector3(0.13, 0.22, 0);
const EYE_Y = 0.88;

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => {
    const ni = g.index ? g.toNonIndexed() : g;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', ni.getAttribute('position'));
    out.setAttribute('normal', ni.getAttribute('normal'));
    return out;
  });
  return mergeGeometries(parts, false)!;
}

/** Merges pieces carrying their own colour into one vertex-coloured geometry. */
function painted(list: [THREE.BufferGeometry, number][]): THREE.BufferGeometry {
  const c = new THREE.Color();
  const parts = list.map(([g, hex]) => {
    const ni = g.index ? g.toNonIndexed() : g;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', ni.getAttribute('position'));
    out.setAttribute('normal', ni.getAttribute('normal'));
    const n = ni.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    c.setHex(hex);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  });
  return mergeGeometries(parts, false)!;
}

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cylG = (r: number, h: number, x = 0, y = 0, z = 0, seg = 8): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z);
const coneG = (r: number, h: number, x = 0, y = 0, z = 0, seg = 5): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, seg).translate(x, y, z);
const sphG = (r: number, x = 0, y = 0, z = 0): THREE.BufferGeometry => new THREE.SphereGeometry(r, 8, 6).translate(x, y, z);
const rotX = (g: THREE.BufferGeometry, a: number): THREE.BufferGeometry => g.rotateX(a);

function buildGeometries(): Record<'body' | 'hat' | 'arm' | 'leg' | 'eyes', THREE.BufferGeometry> {
  const body = merge([new THREE.CapsuleGeometry(0.27, 0.35, 3, 9).translate(0, BODY_Y, 0)]);
  const dome = new THREE.SphereGeometry(0.3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.93, 0);
  const brim = new THREE.CylinderGeometry(0.37, 0.37, 0.035, 12).translate(0, 0.92, 0);
  const hat = merge([dome, brim]);
  const arm = merge([new THREE.CapsuleGeometry(0.062, 0.2, 2, 5).translate(0, -0.15, 0)]);
  const leg = merge([new THREE.CylinderGeometry(0.075, 0.07, 0.22, 6).translate(0, -0.11, 0)]);
  const eyes = merge([new THREE.SphereGeometry(0.07, 6, 4).translate(-0.12, EYE_Y, 0.24), new THREE.SphereGeometry(0.07, 6, 4).translate(0.12, EYE_Y, 0.24)]);
  return { body, hat, arm, leg, eyes };
}

/** Per-variant costume geometry, in body space. */
function outfitGeometry(o: Outfit): THREE.BufferGeometry {
  switch (o) {
    case 'overalls':
      return painted([[cylG(0.285, 0.3, 0, 0.38, 0, 12), 0x2f6fb5], [box(0.06, 0.45, 0.06, -0.12, 0.7, 0.24), 0x2f6fb5], [box(0.06, 0.45, 0.06, 0.12, 0.7, 0.24), 0x2f6fb5]]);
    case 'husk': {
      const leaves: [THREE.BufferGeometry, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const g = coneG(0.1, 0.5, 0, 0.25, 0, 4);
        g.rotateZ(-Math.cos(a) * 0.5).rotateX(Math.sin(a) * 0.5).translate(Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3);
        leaves.push([g, i % 2 ? 0x6fbf4a : 0x58a63a]);
      }
      return painted(leaves);
    }
    case 'awn': {
      const band = new THREE.TorusGeometry(0.28, 0.035, 5, 14).rotateX(Math.PI / 2).translate(0, 0.9, 0);
      const parts: [THREE.BufferGeometry, number][] = [[band, 0xd62828]];
      for (let i = 0; i < 5; i++) parts.push([coneG(0.035, 0.5, (i - 2) * 0.07, 1.3, 0, 4).rotateZ(((i % 2) - 0.5) * 0.4), 0xe9b44c]);
      return painted(parts);
    }
    case 'sprout':
      return painted([[coneG(0.05, 0.22, 0, 1.2, 0, 5), 0x6fbf4a], [sphG(0.05, 0.07, 1.26, 0), 0x6fbf4a]]);
    case 'goggles':
      return painted([[box(0.54, 0.12, 0.06, 0, EYE_Y, 0.22), 0x1f2937], [box(0.14, 0.1, 0.03, -0.12, EYE_Y, 0.255), 0x7dd3fc], [box(0.14, 0.1, 0.03, 0.12, EYE_Y, 0.255), 0x7dd3fc], [box(0.56, 0.06, 0.5, 0, EYE_Y, 0), 0x1f2937]]);
    case 'cross':
      return painted([[box(0.2, 0.06, 0.02, 0, 1.0, 0.285), 0xdc2626], [box(0.06, 0.2, 0.02, 0, 1.0, 0.285), 0xdc2626]]);
    case 'hazmat':
      return painted([[new THREE.SphereGeometry(0.19, 8, 6).scale(1.05, 0.72, 0.6).translate(0, EYE_Y, 0.19), 0x1d4e5f], [cylG(0.1, 0.45, 0, 0.7, -0.32, 8), 0x6b7280], [cylG(0.03, 0.2, 0.1, 0.4, -0.2, 5).rotateX(Math.PI / 4), 0x2b2b2b]]);
  }
}

/** Handheld props: the origin is the grain's hand, +y up along the arm, +z forward. */
function propGeometry(p: HandProp | BodyProp): THREE.BufferGeometry {
  switch (p) {
    case 'rifle':
      return painted([[box(0.09, 0.12, 0.9, 0, 0.02, 0.4), 0x3a3f4b], [box(0.1, 0.22, 0.2, 0, -0.1, 0.0), 0x6b4a2f], [box(0.05, 0.05, 0.5, 0, 0.09, 0.75), 0x15171c]]);
    case 'chopsticks':
      return painted([[rotX(cylG(0.012, 0.38, -0.02, 0.0, 0.1, 5), 1.1), 0x8a5a2b], [rotX(cylG(0.012, 0.38, 0.02, 0.0, 0.1, 5), 1.1), 0x8a5a2b], [box(0.08, 0.04, 0.08, 0, 0.12, 0.28), 0xe9c46a]]);
    case 'cup':
      return painted([[cylG(0.075, 0.13, 0, 0.02, 0.06, 10), 0xf5f0e6], [cylG(0.065, 0.012, 0, 0.085, 0.06, 10), 0x4b2e1f]]);
    case 'extinguisher':
      return painted([[rotX(cylG(0.06, 0.26, 0, 0, 0.14, 8), Math.PI / 2), 0xdc2626], [rotX(coneG(0.035, 0.14, 0, 0, 0.32, 6), Math.PI / 2), 0x1f2937]]);
    case 'board':
      return painted([[box(0.26, 0.34, 0.03, 0, 0.02, 0.08), 0x8a5a2b], [box(0.21, 0.28, 0.012, 0, 0.02, 0.1), 0xf8fafc]]);
    case 'broom':
      return painted([[cylG(0.025, 0.9, 0, 0.0, 0.1, 5).rotateX(0.35), 0x8a5a2b], [box(0.3, 0.12, 0.1, 0, -0.38, 0.25), 0xd9b34a]]);
    case 'wrench':
      return painted([[box(0.05, 0.42, 0.05, 0, 0.1, 0.1), 0x9aa4b2], [box(0.16, 0.1, 0.05, 0, 0.34, 0.1), 0x9aa4b2]]);
    case 'magnifier':
      return painted([[cylG(0.02, 0.3, 0, 0.1, 0.1, 5), 0x4b3a2b], [new THREE.TorusGeometry(0.14, 0.02, 5, 14).translate(0, 0.38, 0.1), 0x9aa4b2], [new THREE.CircleGeometry(0.13, 12).translate(0, 0.38, 0.1), 0xbfe8ff]]);
    case 'duster':
      return painted([[cylG(0.02, 0.26, 0, 0.05, 0.08, 5), 0x4b3a2b], [coneG(0.09, 0.28, 0, 0.3, 0.08, 6), 0xffd9a0]]);
    case 'glow':
      return painted([[cylG(0.025, 0.42, 0, 0.18, 0.05, 5), 0x7dffb0]]);
    case 'flag':
      return painted([[cylG(0.015, 0.6, 0, 0.25, 0.05, 4), 0xdddddd], [box(0.26, 0.2, 0.01, 0.13, 0.5, 0.05), 0xf5f5f5], [box(0.13, 0.1, 0.012, 0.065, 0.55, 0.05), 0x111111]]);
    case 'paper':
      return painted([[box(0.55, 0.41, 0.015, 0, 0.8, 0.42), 0xf4f0e4], [box(0.5, 0.06, 0.018, 0, 0.95, 0.42), 0x3a3a3a]]);
    case 'bubble':
      return painted([[sphG(0.5, 0, 0, 0), 0xff9bd0]]);
    case 'stretcher':
      return painted([[box(0.2, 0.05, 1.1, 0, 0.7, -0.45), 0xe8e2d4], [box(0.03, 0.4, 0.03, 0, 0.5, -0.9), 0x9aa4b2]]);
  }
}

const SCOOTER = painted([
  [box(0.3, 0.05, 0.95, 0, 0.14, 0), 0x2f3542],
  [cylG(0.025, 0.7, 0, 0.48, 0.42, 6), 0x9aa4b2],
  [box(0.4, 0.04, 0.04, 0, 0.83, 0.42), 0x9aa4b2],
  [new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10).rotateZ(Math.PI / 2).translate(0, 0.1, -0.38), 0x1c1e24],
  [new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10).rotateZ(Math.PI / 2).translate(0, 0.1, 0.42), 0x1c1e24],
]);

const tmpM = new THREE.Matrix4();
const bodyM = new THREE.Matrix4();
const limbM = new THREE.Matrix4();
const handM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const tintColor = new THREE.Color();

/** A pool of identical, per-vertex-coloured pieces drawn with one instanced mesh. */
class Bits {
  readonly mesh: THREE.InstancedMesh;
  n = 0;
  constructor(geo: THREE.BufferGeometry, capacity: number, tint = false) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (tint) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }
  push(m: THREE.Matrix4, tint?: number): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.mesh.setMatrixAt(this.n, m);
    if (tint !== undefined && this.mesh.instanceColor) this.mesh.setColorAt(this.n, tintColor.setHex(tint));
    this.n++;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.n = 0;
  }
}

/**
 * Thousands of grains drawn with a handful of instanced meshes. Behaviours live elsewhere; each frame the world
 * hands over a pose per visible grain and this just puts them on screen: body, hat, limbs, costume, props,
 * the box they carry and the scooter some couriers ride.
 */
export class CrowdRenderer {
  readonly group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private hat: THREE.InstancedMesh;
  private armL: THREE.InstancedMesh;
  private armR: THREE.InstancedMesh;
  private legL: THREE.InstancedMesh;
  private legR: THREE.InstancedMesh;
  private eyes: THREE.InstancedMesh;
  private all: THREE.InstancedMesh[];
  private outfits = new Map<Outfit, Bits>();
  private props = new Map<string, Bits>();
  private crate: Bits;
  private scooter: Bits;
  private n = 0;

  constructor(readonly capacity = 2600) {
    const g = buildGeometries();
    const tinted = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.75 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f3a, flatShading: true, roughness: 0.9 });
    const black = new THREE.MeshStandardMaterial({ color: 0x101218, flatShading: true, roughness: 0.4 });
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, tint: boolean, shadow = false): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, mat, capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (tint) {
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      m.castShadow = shadow;
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
      return m;
    };
    this.body = mk(g.body, tinted, true, true);
    this.hat = mk(g.hat, tinted, true);
    this.armL = mk(g.arm, tinted, true);
    this.armR = mk(g.arm, tinted, true);
    this.legL = mk(g.leg, dark, false);
    this.legR = mk(g.leg, dark, false);
    this.eyes = mk(g.eyes, black, false);
    this.all = [this.body, this.hat, this.armL, this.armR, this.legL, this.legR, this.eyes];
    const per = Math.min(capacity, 700);
    for (const o of ['overalls', 'husk', 'awn', 'sprout', 'goggles', 'cross', 'hazmat'] as Outfit[]) this.addBits(this.outfits, o, outfitGeometry(o), per);
    for (const p of ['rifle', 'chopsticks', 'cup', 'extinguisher', 'board', 'broom', 'wrench', 'magnifier', 'duster', 'glow', 'flag', 'paper', 'bubble', 'stretcher'] as (HandProp | BodyProp)[]) this.addBits(this.props, p, propGeometry(p), 160);
    const crateGeo = painted([[box(0.34, 0.3, 0.34, 0, 0, 0), 0xffffff], [box(0.36, 0.05, 0.36, 0, 0.1, 0), 0x8a6236]]);
    this.crate = new Bits(crateGeo, 600, true);
    this.scooter = new Bits(SCOOTER, 120);
    this.group.add(this.crate.mesh, this.scooter.mesh);
  }

  private addBits(map: Map<string, Bits>, key: string, geo: THREE.BufferGeometry, cap: number): void {
    const b = new Bits(geo, cap);
    map.set(key, b);
    this.group.add(b.mesh);
  }

  begin(): void {
    this.n = 0;
  }

  draw(p: GrainPose): void {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    const s = p.look.scale;
    // Root: stand on the surface, optionally lifted, leaned and rolled.
    surfaceMatrix(p.pos, p.forward, p.up, tmpM, s);
    bodyM.copy(tmpM);
    if (p.scooter) bodyM.multiply(tmpL.makeTranslation(0, 0.18, 0));
    if (p.bob !== 0) bodyM.multiply(tmpL.makeTranslation(0, p.bob, 0));
    if (p.lean !== 0 || p.roll !== 0) {
      // Rotate about the hips so leaning and lying look natural.
      bodyM.multiply(tmpL.makeTranslation(0, 0.5, 0));
      tmpQ.setFromEuler(tmpE.set(p.lean, 0, p.roll));
      bodyM.multiply(tmpL.makeRotationFromQuaternion(tmpQ));
      bodyM.multiply(tmpL.makeTranslation(0, -0.5, 0));
    }
    const girth = p.look.girth ?? 1;
    const len = p.look.len ?? 1;
    if (girth !== 1 || len !== 1) bodyM.multiply(tmpL.makeScale(girth, len, girth));
    this.body.setMatrixAt(i, bodyM);
    tintColor.setHex(p.look.body);
    this.body.setColorAt(i, tintColor);
    this.armL.setColorAt(i, tintColor);
    this.armR.setColorAt(i, tintColor);

    if (p.look.hat) {
      this.hat.setMatrixAt(i, bodyM);
      this.hat.setColorAt(i, tintColor.setHex(p.look.hat));
    } else {
      this.hat.setMatrixAt(i, ZERO_M);
    }
    const open = p.eyeOpen ?? 1;
    if (open !== 1) {
      tmpL.makeTranslation(0, EYE_Y, 0).multiply(handM.makeScale(1, Math.max(0.05, open), 1)).multiply(limbM.makeTranslation(0, -EYE_Y, 0));
      this.eyes.setMatrixAt(i, limbM.multiplyMatrices(bodyM, tmpL));
    } else {
      this.eyes.setMatrixAt(i, bodyM);
    }

    this.limb(this.armL, i, -SHOULDER.x, SHOULDER.y, p.armL, 0);
    const lm = limbM.clone();
    this.limb(this.armR, i, SHOULDER.x, SHOULDER.y, p.armR, p.swingR ?? 0);
    const rm = limbM.clone();
    this.limb(this.legL, i, -HIP.x, HIP.y, p.legL, 0);
    this.limb(this.legR, i, HIP.x, HIP.y, p.legR, 0);

    if (p.look.outfit) this.outfits.get(p.look.outfit)?.push(bodyM);
    if (p.propR) this.props.get(p.propR)?.push(handM.multiplyMatrices(rm, tmpL.makeTranslation(0, -0.3, 0)));
    if (p.propL) this.props.get(p.propL)?.push(handM.multiplyMatrices(lm, tmpL.makeTranslation(0, -0.3, 0)));
    if (p.propBody) {
      const b = this.props.get(p.propBody);
      if (p.propBody === 'bubble') b?.push(handM.copy(bodyM).multiply(tmpL.makeTranslation(0, 0.72, 0.3)).multiply(tmpL.makeScale(Math.max(0.01, (p.bubble ?? 0.2) * 0.25), Math.max(0.01, (p.bubble ?? 0.2) * 0.25), Math.max(0.01, (p.bubble ?? 0.2) * 0.25))));
      else b?.push(bodyM);
    }
    if (p.crate) {
      const m = handM.copy(p.crate === 1 ? bodyM : tmpM);
      if (p.crate === 1) m.multiply(tmpL.makeTranslation(0, 1.28, 0));
      else m.multiply(tmpL.makeTranslation(0, 0.15, 0.7));
      this.crate.push(m, p.crateColor ?? 0xc89b5f);
    }
    if (p.scooter) this.scooter.push(tmpM);
  }

  private limb(mesh: THREE.InstancedMesh, i: number, x: number, y: number, angle: number, swing: number): void {
    limbM.copy(bodyM);
    limbM.multiply(tmpL.makeTranslation(x, y, 0));
    limbM.multiply(tmpL.makeRotationX(angle));
    if (swing) limbM.multiply(tmpL.makeRotationZ(swing));
    mesh.setMatrixAt(i, limbM);
  }

  end(): void {
    for (const m of this.all) {
      m.count = this.n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    for (const b of this.outfits.values()) b.end();
    for (const b of this.props.values()) b.end();
    this.crate.end();
    this.scooter.end();
  }
}

export { ONE, tmpS as _unused };

// --- reusable animation helpers ---------------------------------------------------------

export interface Limbs {
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  bob: number;
  lean: number;
  roll: number;
  swingR?: number;
}

export const IDLE_LIMBS = (t: number, phase: number): Limbs => ({ armL: Math.sin(t * 1.5 + phase) * 0.06, armR: -Math.sin(t * 1.5 + phase) * 0.06, legL: 0, legR: 0, bob: Math.sin(t * 2 + phase) * 0.008, lean: 0, roll: 0 });

/** Walking: legs and arms swing against each other; faster travel swings more. */
export function walkLimbs(phase: number, speed: number, carrying = false): Limbs {
  const s = Math.sin(phase);
  const k = Math.min(1, speed / 1.5);
  return { armL: carrying ? -2.6 : -s * 0.8 * k, armR: carrying ? -2.6 : s * 0.8 * k, legL: s * 0.85 * k, legR: -s * 0.85 * k, bob: Math.abs(s) * 0.07 * k, lean: 0.05 * k, roll: 0 };
}

export type WorkStyle =
  | 'hammer' | 'polish' | 'load' | 'throw' | 'clipboard' | 'sweep' | 'wave' | 'sit' | 'sip' | 'spray' | 'dance'
  | 'ramen' | 'coffee' | 'news' | 'gum' | 'nap' | 'treat' | 'pack' | 'cheer' | 'inspect' | 'repair';

export function workLimbs(style: WorkStyle, t: number, phase = 0): Limbs {
  const ph = t + phase;
  const base: Limbs = { armL: 0, armR: 0, legL: 0, legR: 0, bob: Math.sin(ph * 2) * 0.008, lean: 0, roll: 0 };
  switch (style) {
    case 'hammer':
      return { ...base, armL: -1.0 + Math.sin(ph * 5) * 0.6, armR: -1.0 - Math.sin(ph * 5) * 0.6, lean: 0.12 };
    case 'polish':
      return { ...base, armR: -1.5 + Math.sin(ph * 7) * 0.2, armL: -0.4, swingR: Math.sin(ph * 7) * 0.5 };
    case 'load':
      return { ...base, armL: -1.3 + Math.sin(ph * 2.2) * 0.9, armR: -1.3 + Math.sin(ph * 2.2) * 0.9, lean: 0.28 * Math.sin(ph * 2.2) };
    case 'throw': {
      const u = (ph % 1.7) / 1.7;
      const a = u < 0.5 ? 0.9 * (u / 0.5) : u < 0.62 ? 0.9 + (-2.6 - 0.9) * ((u - 0.5) / 0.12) : -2.6 * (1 - (u - 0.62) / 0.38);
      return { ...base, armR: a, armL: -0.3 - a * 0.2 };
    }
    case 'clipboard':
      return { ...base, armR: -0.9, armL: -0.15, lean: 0.05 + Math.sin(ph * 1.3) * 0.04 };
    case 'sweep':
      return { ...base, armL: -0.9, armR: -0.9, lean: 0.2, roll: Math.sin(ph * 3) * 0.12 };
    case 'wave':
      return { ...base, armR: -2.7, swingR: Math.sin(ph * 12) * 0.45 };
    case 'sit':
      return { ...base, legL: -1.5, legR: -1.5, armL: -0.8, armR: -0.9 - Math.max(0, Math.sin(ph * 2)) * 0.9, bob: -0.2 };
    case 'sip': {
      const u = (ph % 5) / 5;
      return { ...base, armL: -0.7 - (u > 0.65 && u < 0.85 ? Math.sin(((u - 0.65) / 0.2) * Math.PI) * 1.3 : 0) };
    }
    case 'spray':
      return { ...base, armR: -1.45, armL: -0.6, lean: 0.06 };
    case 'dance':
      return { ...base, armL: -2 + Math.sin(ph * 6) * 0.8, armR: -2 - Math.sin(ph * 6) * 0.8, legL: Math.sin(ph * 6) * 0.5, legR: -Math.sin(ph * 6) * 0.5, bob: Math.abs(Math.sin(ph * 6)) * 0.1 };
    case 'ramen': {
      // Seated: chopsticks go bowl to mouth, with a happy bob.
      const u = (ph * 0.6) % 1;
      const lift = u < 0.45 ? 0 : Math.sin(((u - 0.45) / 0.55) * Math.PI);
      return { ...base, legL: -1.5, legR: -1.5, bob: -0.2, armR: -0.9 - lift * 1.1, armL: -0.8, lean: 0.1 + lift * 0.12 };
    }
    case 'coffee': {
      const u = (ph % 5) / 5;
      const sip = u > 0.65 && u < 0.85 ? Math.sin(((u - 0.65) / 0.2) * Math.PI) : 0;
      return { ...base, armL: -0.7 - sip * 1.3, armR: Math.sin(ph) * 0.08, lean: -sip * 0.12 };
    }
    case 'news':
      return { ...base, armL: -1.3, armR: -1.3, lean: Math.sin(ph * 0.9) * 0.05 };
    case 'gum':
      return { ...base, armL: Math.sin(ph * 1.2) * 0.1, armR: -Math.sin(ph * 1.2) * 0.1, roll: Math.sin(ph * 0.8) * 0.04 };
    case 'nap':
      return { ...base, roll: Math.PI / 2, armL: 0.2, armR: 0.2, bob: 0.05 };
    case 'treat':
      return { ...base, lean: 0.3, armL: -1.1 + Math.sin(ph * 5) * 0.5, armR: -1.1 - Math.sin(ph * 5) * 0.5 };
    case 'pack':
      return { ...base, lean: 0.1, armL: -0.9 + Math.sin(ph * 3) * 0.5, armR: -0.9 - Math.sin(ph * 3) * 0.5 };
    case 'cheer':
      return { ...base, armL: -2.7 + Math.sin(ph * 9) * 0.4, armR: -2.7 - Math.sin(ph * 9) * 0.4, bob: Math.abs(Math.sin(ph * 5)) * 0.25, legL: Math.sin(ph * 5) * 0.3, legR: -Math.sin(ph * 5) * 0.3 };
    case 'inspect':
      return { ...base, armR: -1.2 + Math.sin(ph * 1.4) * 0.15, armL: -0.3, lean: 0.12 + Math.sin(ph * 0.9) * 0.05 };
    case 'repair':
      return { ...base, armR: -1.3 + Math.sin(ph * 6) * 0.35, armL: -0.9, lean: 0.25 };
  }
}

/** Props and eyes each work style wants. */
export function styleProps(style: WorkStyle): Pick<GrainPose, 'propR' | 'propL' | 'propBody'> {
  switch (style) {
    case 'polish': return { propR: 'magnifier', propL: 'duster' };
    case 'clipboard': return { propR: 'board' };
    case 'ramen': return { propR: 'chopsticks' };
    case 'coffee': return { propL: 'cup' };
    case 'news': return { propBody: 'paper' };
    case 'gum': return { propBody: 'bubble' };
    case 'spray': return { propR: 'extinguisher' };
    case 'sweep': return { propR: 'broom' };
    case 'repair': return { propR: 'wrench' };
    case 'cheer': return { propR: 'flag', propL: 'glow' };
    case 'inspect': return { propR: 'board' };
    default: return {};
  }
}
