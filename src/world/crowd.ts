import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceMatrix } from './pools';

/** Looks and sizes for each grain type. */
export interface GrainLook {
  body: number;
  /** 0 = no hat. */
  hat: number;
  scale: number;
}

export const LOOKS = {
  rice: { body: 0xf0eae1, hat: 0xffc933, scale: 1 },
  corn: { body: 0xf5b041, hat: 0xff7a1a, scale: 1.12 },
  wheat: { body: 0xd9822b, hat: 0xd62828, scale: 1 },
  quinoa: { body: 0xa63a2f, hat: 0x274c8f, scale: 0.7 },
  millet: { body: 0xf1d27a, hat: 0, scale: 0.62 },
  basmati: { body: 0xf6efd9, hat: 0x1f2937, scale: 1.18 },
  medic: { body: 0xfafafa, hat: 0xdc2626, scale: 1 },
  hazmat: { body: 0xe9e24a, hat: 0xe9e24a, scale: 1.05 },
  punk: { body: 0xc9a6ff, hat: 0xff2d95, scale: 1 },
  neon: { body: 0x8ff0ff, hat: 0x6bff95, scale: 1 },
} satisfies Record<string, GrainLook>;
export type LookName = keyof typeof LOOKS;

/** One grain to draw this frame, in surface-relative terms. */
export interface GrainPose {
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
}

const BODY_Y = 0.22 + 0.175 + 0.27;
const SHOULDER = new THREE.Vector3(0.31, 0.94, 0);
const HIP = new THREE.Vector3(0.13, 0.22, 0);

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

function buildGeometries(): Record<'body' | 'hat' | 'arm' | 'leg' | 'eyes' | 'shoes', THREE.BufferGeometry> {
  const body = merge([new THREE.CapsuleGeometry(0.27, 0.35, 3, 9).translate(0, BODY_Y, 0)]);
  const dome = new THREE.SphereGeometry(0.3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.93, 0);
  const brim = new THREE.CylinderGeometry(0.37, 0.37, 0.035, 12).translate(0, 0.92, 0);
  const hat = merge([dome, brim]);
  const arm = merge([new THREE.CapsuleGeometry(0.062, 0.2, 2, 5).translate(0, -0.15, 0)]);
  const leg = merge([new THREE.CylinderGeometry(0.075, 0.07, 0.22, 6).translate(0, -0.11, 0)]);
  const eyes = merge([new THREE.SphereGeometry(0.07, 6, 4).translate(-0.12, 0.88, 0.24), new THREE.SphereGeometry(0.07, 6, 4).translate(0.12, 0.88, 0.24)]);
  const shoes = merge([new THREE.BoxGeometry(0.15, 0.07, 0.24).translate(0, -0.2, 0.05)]);
  return { body, hat, arm, leg, eyes, shoes };
}

const tmpM = new THREE.Matrix4();
const limbM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const ONE = new THREE.Vector3(1, 1, 1);
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const tintColor = new THREE.Color();

/**
 * Thousands of grains drawn with seven instanced meshes. Behaviours live elsewhere; each frame the world hands
 * over a pose per visible grain and this just puts them on screen.
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
    if (p.bob !== 0) tmpM.multiply(tmpL.makeTranslation(0, p.bob, 0));
    if (p.lean !== 0 || p.roll !== 0) {
      // Rotate about the hips so leaning and lying look natural.
      tmpL.makeTranslation(0, 0.5, 0);
      tmpM.multiply(tmpL);
      tmpQ.setFromEuler(tmpE.set(p.lean, 0, p.roll));
      tmpM.multiply(tmpL.makeRotationFromQuaternion(tmpQ));
      tmpM.multiply(tmpL.makeTranslation(0, -0.5, 0));
    }
    this.body.setMatrixAt(i, tmpM);
    tintColor.setHex(p.look.body);
    this.body.setColorAt(i, tintColor);
    this.armL.setColorAt(i, tintColor);
    this.armR.setColorAt(i, tintColor);

    if (p.look.hat) {
      this.hat.setMatrixAt(i, tmpM);
      this.hat.setColorAt(i, tintColor.setHex(p.look.hat));
    } else {
      this.hat.setMatrixAt(i, ZERO_M);
    }
    this.eyes.setMatrixAt(i, tmpM);

    this.limb(this.armL, i, SHOULDER.x * -1, SHOULDER.y, p.armL);
    this.limb(this.armR, i, SHOULDER.x, SHOULDER.y, p.armR);
    this.limb(this.legL, i, -HIP.x, HIP.y, p.legL);
    this.limb(this.legR, i, HIP.x, HIP.y, p.legR);
  }

  private limb(mesh: THREE.InstancedMesh, i: number, x: number, y: number, angle: number): void {
    const m = limbM.copy(tmpM);
    m.multiply(tmpL.makeTranslation(x, y, 0));
    m.multiply(tmpL.makeRotationX(angle));
    mesh.setMatrixAt(i, m);
  }

  end(): void {
    for (const m of this.all) {
      m.count = this.n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

export { ONE };

// --- reusable animation helpers ---------------------------------------------------------

export interface Limbs {
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  bob: number;
  lean: number;
  roll: number;
}

export const IDLE_LIMBS = (t: number, phase: number): Limbs => ({ armL: Math.sin(t * 1.5 + phase) * 0.06, armR: -Math.sin(t * 1.5 + phase) * 0.06, legL: 0, legR: 0, bob: Math.sin(t * 2 + phase) * 0.008, lean: 0, roll: 0 });

/** Walking: legs and arms swing against each other; faster travel swings more. */
export function walkLimbs(phase: number, speed: number, carrying = false): Limbs {
  const s = Math.sin(phase);
  const k = Math.min(1, speed / 1.5);
  return { armL: carrying ? -2.6 : -s * 0.8 * k, armR: carrying ? -2.6 : s * 0.8 * k, legL: s * 0.85 * k, legR: -s * 0.85 * k, bob: Math.abs(s) * 0.07 * k, lean: 0.05 * k, roll: 0 };
}

export type WorkStyle = 'hammer' | 'polish' | 'load' | 'throw' | 'clipboard' | 'sweep' | 'wave' | 'sit' | 'sip' | 'spray' | 'dance';

export function workLimbs(style: WorkStyle, t: number, phase = 0): Limbs {
  const ph = t + phase;
  const base: Limbs = { armL: 0, armR: 0, legL: 0, legR: 0, bob: Math.sin(ph * 2) * 0.008, lean: 0, roll: 0 };
  switch (style) {
    case 'hammer':
      return { ...base, armL: -1.0 + Math.sin(ph * 5) * 0.6, armR: -1.0 - Math.sin(ph * 5) * 0.6, lean: 0.12 };
    case 'polish':
      return { ...base, armR: -1.5 + Math.sin(ph * 7) * 0.2, armL: -0.4 };
    case 'load':
      return { ...base, armL: -1.3 + Math.sin(ph * 2.2) * 0.9, armR: -1.3 + Math.sin(ph * 2.2) * 0.9, lean: 0.28 * Math.sin(ph * 2.2) };
    case 'throw': {
      const u = (ph % 1.7) / 1.7;
      const a = u < 0.5 ? 0.9 * (u / 0.5) : u < 0.62 ? 0.9 + (-2.6 - 0.9) * ((u - 0.5) / 0.12) : -2.6 * (1 - (u - 0.62) / 0.38);
      return { ...base, armR: a, armL: -0.3 - a * 0.2 };
    }
    case 'clipboard':
      return { ...base, armR: -0.9, armL: -0.15, lean: 0.05 };
    case 'sweep':
      return { ...base, armL: -0.9, armR: -0.9, lean: 0.2 };
    case 'wave':
      return { ...base, armR: -2.7 + Math.sin(ph * 12) * 0.3 };
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
  }
}
