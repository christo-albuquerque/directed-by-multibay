import * as THREE from 'three';

/** Radius of Kepler-22b in world units. Ground level is exactly R; everything stands on or above it. */
export const R = 160;

const DEG = Math.PI / 180;

/** Unit direction from the planet's centre for a longitude/latitude in degrees. The camera starts looking down +Z. */
export function lonLatDir(lonDeg: number, latDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  return out.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
}

export interface Basis {
  right: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
}

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

/** East / up / south basis at a surface direction (forward = south = right x up, as in the chart convention). */
export function basisAt(dir: THREE.Vector3, out: Basis = { right: new THREE.Vector3(), up: new THREE.Vector3(), forward: new THREE.Vector3() }): Basis {
  out.up.copy(dir);
  out.right.crossVectors(Y, dir);
  if (out.right.lengthSq() < 1e-8) out.right.copy(X);
  out.right.normalize();
  out.forward.crossVectors(out.right, out.up).normalize();
  return out;
}

/**
 * A local flat-looking coordinate chart on the globe (azimuthal equidistant), so zones can be authored in plain
 * x/z units and still wrap the sphere. x is east, z is south (toward the default camera), y is height above ground.
 */
export class Chart {
  readonly center: THREE.Vector3;
  private east = new THREE.Vector3();
  private south = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();

  constructor(center: THREE.Vector3, readonly yaw = 0) {
    this.center = center.clone().normalize();
    const b = basisAt(this.center);
    // The chart can be turned about its centre so whole zones can face different ways.
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    this.east.copy(b.right).multiplyScalar(c).addScaledVector(b.forward, -s);
    this.south.copy(b.right).multiplyScalar(s).addScaledVector(b.forward, c);
  }

  /** Unit direction of the surface point at chart coordinates (x, z). */
  dir(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const r = Math.hypot(x, z);
    if (r < 1e-6) return out.copy(this.center);
    const t = r / R;
    return out
      .copy(this.center)
      .multiplyScalar(Math.cos(t))
      .addScaledVector(this.east, (Math.sin(t) * x) / r)
      .addScaledVector(this.south, (Math.sin(t) * z) / r)
      .normalize();
  }

  /** Inverse of `dir`: chart (x, z) of a surface direction. */
  toLocal(dir: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    const c = Math.min(1, Math.max(-1, this.center.dot(dir)));
    const theta = Math.acos(c);
    const ex = this.east.dot(dir);
    const sz = this.south.dot(dir);
    const l = Math.hypot(ex, sz);
    // Dead centre, or exactly opposite it (where the chart is singular: report the far edge).
    if (l < 1e-9) return out.set(c > 0 ? 0 : theta * R, 0);
    return out.set((ex / l) * theta * R, (sz / l) * theta * R);
  }

  point(x: number, z: number, h = 0, out = new THREE.Vector3()): THREE.Vector3 {
    return this.dir(x, z, out).multiplyScalar(R + h);
  }

  /**
   * World matrix for an object at chart (x, z), height h, turned by `rot` about the local up.
   * rot = 0 keeps the object's +z pointing toward chart +z (south).
   */
  matrix(x: number, z: number, h: number, rot: number, out = new THREE.Matrix4()): THREE.Matrix4 {
    const d = this.dir(x, z, this.tmpDir);
    // Carry the chart's own axes to this point so every object in a zone agrees which way is "east".
    const up = d;
    const right0 = new THREE.Vector3().copy(this.east).addScaledVector(up, -this.east.dot(up)).normalize();
    const fwd0 = new THREE.Vector3().crossVectors(right0, up).normalize();
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const right = right0.clone().multiplyScalar(c).addScaledVector(fwd0, -s);
    const fwd = right0.clone().multiplyScalar(s).addScaledVector(fwd0, c);
    out.makeBasis(right, up, fwd);
    out.setPosition(d.x * (R + h), d.y * (R + h), d.z * (R + h));
    return out;
  }
}

/** Angle in radians between two unit directions. */
export function angleBetween(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
}
