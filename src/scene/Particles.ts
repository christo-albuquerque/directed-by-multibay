import * as THREE from 'three';
import { motion } from '../ui/motion';

export interface EmitOpts {
  life?: number;
  size0?: number;
  size1?: number;
  color?: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

/** Anything particles can be emitted into. Bays use an offset emitter so their local coordinates just work. */
export interface Emitter {
  emit(p: THREE.Vector3, v: THREE.Vector3, o?: EmitOpts): void;
  burst(p: THREE.Vector3, n: number, speed: number, spread: number, dir: THREE.Vector3, o?: EmitOpts): void;
}

/** Wraps an emitter, shifting every emission by a fixed world offset (a bay's position). */
export class OffsetEmitter implements Emitter {
  private tmp = new THREE.Vector3();

  constructor(
    private base: Emitter,
    private offset: THREE.Vector3,
  ) {}

  emit(p: THREE.Vector3, v: THREE.Vector3, o?: EmitOpts): void {
    this.base.emit(this.tmp.copy(p).add(this.offset), v, o);
  }

  burst(p: THREE.Vector3, n: number, speed: number, spread: number, dir: THREE.Vector3, o?: EmitOpts): void {
    this.base.burst(this.tmp.copy(p).add(this.offset), n, speed, spread, dir, o);
  }
}

const CAPACITY = 1800;

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uPx;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Perspective camera: apparent size falls off with distance.
    gl_PointSize = clamp(aSize * uPx / max(0.1, -mv.z), 0.0, 220.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = vAlpha * smoothstep(0.5, 0.15, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/** Pooled soft-sprite particles (smoke, sparks, steam, exhaust) drawn as one Points object. */
export class Particles implements Emitter {
  readonly points: THREE.Points;
  private pos = new Float32Array(CAPACITY * 3);
  private col = new Float32Array(CAPACITY * 3);
  private size = new Float32Array(CAPACITY);
  private alpha = new Float32Array(CAPACITY);
  private vel = new Float32Array(CAPACITY * 3);
  private age = new Float32Array(CAPACITY).fill(1e9);
  private life = new Float32Array(CAPACITY).fill(1);
  private s0 = new Float32Array(CAPACITY);
  private s1 = new Float32Array(CAPACITY);
  private a0 = new Float32Array(CAPACITY);
  private grav = new Float32Array(CAPACITY);
  private drag = new Float32Array(CAPACITY);
  private next = 0;
  private uniforms = { uPx: { value: 40 } };
  private tmp = new THREE.Color();

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, o: EmitOpts = {}): void {
    if (motion.reduced && Math.random() > 0.35) return;
    const i = this.next;
    this.next = (this.next + 1) % CAPACITY;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.tmp.setHex(o.color ?? 0xcfd3da);
    this.col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    this.age[i] = 0;
    this.life[i] = o.life ?? 1.5;
    this.s0[i] = o.size0 ?? 0.3;
    this.s1[i] = o.size1 ?? 1;
    this.a0[i] = o.alpha ?? 0.6;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0.5;
  }

  /** Emit `n` particles in random directions around `dir` with the given spread and speed. */
  burst(p: THREE.Vector3, n: number, speed: number, spread: number, dir: THREE.Vector3, o: EmitOpts = {}): void {
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      v.set(dir.x + (Math.random() - 0.5) * spread, dir.y + (Math.random() - 0.5) * spread, dir.z + (Math.random() - 0.5) * spread).multiplyScalar(speed * (0.6 + Math.random() * 0.8));
      this.emit(p, v, { ...o, life: (o.life ?? 1.5) * (0.7 + Math.random() * 0.6) });
    }
  }

  update(dt: number, camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    // World units -> pixels at unit distance for a perspective camera.
    const heightPx = renderer.domElement.height;
    const fov = camera instanceof THREE.PerspectiveCamera ? THREE.MathUtils.degToRad(camera.fov) : 0.7;
    this.uniforms.uPx.value = heightPx / (2 * Math.tan(fov / 2));

    for (let i = 0; i < CAPACITY; i++) {
      if (this.age[i] >= this.life[i]) {
        this.size[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const t = Math.min(this.age[i] / this.life[i], 1);
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 8);
    }
    const g = this.points.geometry;
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }
}
