import * as THREE from 'three';
import { Chart, R } from './surface';

/** Point on a path: world position, unit tangent and local up. */
export interface PathSample {
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
}

/**
 * A route across the globe's surface, sampled at even spacing. Built from 2D chart control points so belts,
 * roads and rails can be authored flat but follow the planet's curve.
 */
export class SurfacePath {
  readonly length: number;
  readonly count: number;
  private readonly step: number;
  private readonly pos: THREE.Vector3[] = [];
  private readonly tan: THREE.Vector3[] = [];
  private readonly up: THREE.Vector3[] = [];
  /** The flat chart samples, kept so parallel lanes can be offset sideways. */
  private readonly flat: THREE.Vector2[];

  private constructor(
    private chart: Chart,
    flat: THREE.Vector2[],
    readonly height: number,
  ) {
    this.flat = flat;
    this.count = flat.length;
    let len = 0;
    for (let i = 1; i < flat.length; i++) len += flat[i].distanceTo(flat[i - 1]);
    this.length = len;
    this.step = len / (flat.length - 1);
    for (let i = 0; i < flat.length; i++) {
      this.pos.push(chart.point(flat[i].x, flat[i].y, height));
      this.up.push(chart.dir(flat[i].x, flat[i].y));
    }
    for (let i = 0; i < flat.length; i++) {
      const a = this.pos[Math.max(0, i - 1)];
      const b = this.pos[Math.min(flat.length - 1, i + 1)];
      this.tan.push(new THREE.Vector3().subVectors(b, a).normalize());
    }
  }

  /** Smooth path through chart (x, z) control points at a fixed height. */
  static through(chart: Chart, ctrl: [number, number][], height = 0.3, closed = false, spacing = 0.8): SurfacePath {
    const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal');
    const n = Math.max(8, Math.ceil(curve.getLength() / spacing));
    const pts = curve.getSpacedPoints(n).map((p) => new THREE.Vector2(p.x, p.z));
    return new SurfacePath(chart, pts, height);
  }

  /** A parallel path `d` units to the left of travel (negative = right), at the same or a new height. */
  offset(d: number, height = this.height): SurfacePath {
    const out: THREE.Vector2[] = [];
    for (let i = 0; i < this.flat.length; i++) {
      const a = this.flat[Math.max(0, i - 1)];
      const b = this.flat[Math.min(this.flat.length - 1, i + 1)];
      const tx = b.x - a.x;
      const tz = b.y - a.y;
      const l = Math.hypot(tx, tz) || 1;
      out.push(new THREE.Vector2(this.flat[i].x + (tz / l) * d, this.flat[i].y - (tx / l) * d));
    }
    return new SurfacePath(this.chart, out, height);
  }

  /** Distance along the path of the sample closest to chart point (x, z). */
  nearest(x: number, z: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.flat.length; i++) {
      const d = (this.flat[i].x - x) ** 2 + (this.flat[i].y - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best * this.step;
  }

  /** Flat chart position at distance s (clamped), for authoring decorations beside the route. */
  flatAt(s: number, out = new THREE.Vector2()): THREE.Vector2 {
    const f = Math.min(this.count - 1, Math.max(0, s / this.step));
    const i = Math.min(this.count - 2, Math.floor(f));
    return out.lerpVectors(this.flat[i], this.flat[i + 1], f - i);
  }

  flatTangentAt(s: number, out = new THREE.Vector2()): THREE.Vector2 {
    const f = Math.min(this.count - 2, Math.max(0, s / this.step));
    const i = Math.floor(f);
    return out.subVectors(this.flat[i + 1], this.flat[i]).normalize();
  }

  at(s: number, out: PathSample): PathSample {
    const f = Math.min(this.count - 1.0001, Math.max(0, s / this.step));
    const i = Math.floor(f);
    const t = f - i;
    out.pos.lerpVectors(this.pos[i], this.pos[i + 1], t);
    out.up.lerpVectors(this.up[i], this.up[i + 1], t).normalize();
    out.tangent.lerpVectors(this.tan[i], this.tan[i + 1], t).normalize();
    // Keep the radius exact between samples.
    out.pos.setLength(R + this.height);
    return out;
  }

  /** Writes a ribbon of the given width following the path (positions/normals only; pairs of left/right verts). */
  ribbon(halfWidth: number, lift = 0): { positions: Float32Array; uvs: Float32Array; indices: number[] } {
    const positions = new Float32Array(this.count * 2 * 3);
    const uvs = new Float32Array(this.count * 2 * 2);
    const indices: number[] = [];
    const side = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      side.crossVectors(this.up[i], this.tan[i]).normalize();
      for (const k of [0, 1]) {
        p.copy(this.pos[i]).addScaledVector(side, k === 0 ? halfWidth : -halfWidth).addScaledVector(this.up[i], lift);
        positions.set([p.x, p.y, p.z], (i * 2 + k) * 3);
        uvs.set([k, i * this.step], (i * 2 + k) * 2);
      }
      if (i < this.count - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    return { positions, uvs, indices };
  }
}
