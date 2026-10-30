import * as THREE from 'three';
import { Chart, R } from './surface';

/** Point on a path: world position, unit tangent and local up. */
export interface PathSample {
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
}

interface PathData {
  pos: THREE.Vector3[];
  tan: THREE.Vector3[];
  up: THREE.Vector3[];
  length: number;
  /** Flat chart samples (present for chart-authored paths, so parallel lanes can be offset). */
  flat?: THREE.Vector2[];
  chart?: Chart;
  height: number;
  /** True when the points already carry their own heights (bridges, ramps). */
  freeHeight: boolean;
}

/**
 * A route across the globe's surface, sampled at even spacing. Authored flat in a zone's chart (so belts and roads
 * follow the planet's curve), or through arbitrary 3D points (long bridges that climb and descend).
 */
export class SurfacePath {
  readonly length: number;
  readonly count: number;
  private readonly step: number;
  private readonly pos: THREE.Vector3[];
  private readonly tan: THREE.Vector3[];
  private readonly up: THREE.Vector3[];
  private readonly flat?: THREE.Vector2[];
  private readonly chart?: Chart;
  readonly height: number;
  private readonly freeHeight: boolean;

  private constructor(d: PathData) {
    this.pos = d.pos;
    this.tan = d.tan;
    this.up = d.up;
    this.flat = d.flat;
    this.chart = d.chart;
    this.height = d.height;
    this.freeHeight = d.freeHeight;
    this.length = d.length;
    this.count = d.pos.length;
    this.step = d.length / (d.pos.length - 1);
  }

  private static finish(pos: THREE.Vector3[]): { tan: THREE.Vector3[]; up: THREE.Vector3[] } {
    const tan: THREE.Vector3[] = [];
    const up: THREE.Vector3[] = [];
    for (let i = 0; i < pos.length; i++) {
      up.push(pos[i].clone().normalize());
      const a = pos[Math.max(0, i - 1)];
      const b = pos[Math.min(pos.length - 1, i + 1)];
      tan.push(new THREE.Vector3().subVectors(b, a).normalize());
    }
    return { tan, up };
  }

  private static fromFlat(chart: Chart, flat: THREE.Vector2[], height: number): SurfacePath {
    let len = 0;
    for (let i = 1; i < flat.length; i++) len += flat[i].distanceTo(flat[i - 1]);
    const pos = flat.map((p) => chart.point(p.x, p.y, height));
    const { tan, up } = SurfacePath.finish(pos);
    return new SurfacePath({ pos, tan, up, length: len, flat, chart, height, freeHeight: false });
  }

  /** Smooth path through chart (x, z) control points at a fixed height. */
  static through(chart: Chart, ctrl: [number, number][], height = 0.3, closed = false, spacing = 0.8): SurfacePath {
    const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal');
    const n = Math.max(8, Math.ceil(curve.getLength() / spacing));
    return SurfacePath.fromFlat(chart, curve.getSpacedPoints(n).map((p) => new THREE.Vector2(p.x, p.z)), height);
  }

  /** Smooth path through world-space points (each at its own height above the ground), e.g. an elevated feeder belt. */
  static through3D(points: THREE.Vector3[], spacing = 1): SurfacePath {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const n = Math.max(8, Math.ceil(curve.getLength() / spacing));
    const pos = curve.getSpacedPoints(n);
    let len = 0;
    for (let i = 1; i < pos.length; i++) len += pos[i].distanceTo(pos[i - 1]);
    const { tan, up } = SurfacePath.finish(pos);
    return new SurfacePath({ pos, tan, up, length: len, height: 0, freeHeight: true });
  }

  /** A parallel path `d` units to the left of travel (negative = right), at the same or a new height. */
  offset(d: number, height = this.height): SurfacePath {
    if (!this.flat || !this.chart) throw new Error('offset needs a chart path');
    const out: THREE.Vector2[] = [];
    for (let i = 0; i < this.flat.length; i++) {
      const a = this.flat[Math.max(0, i - 1)];
      const b = this.flat[Math.min(this.flat.length - 1, i + 1)];
      const tx = b.x - a.x;
      const tz = b.y - a.y;
      const l = Math.hypot(tx, tz) || 1;
      out.push(new THREE.Vector2(this.flat[i].x + (tz / l) * d, this.flat[i].y - (tx / l) * d));
    }
    return SurfacePath.fromFlat(this.chart, out, height);
  }

  /** Distance along the path of the sample closest to chart point (x, z). */
  nearest(x: number, z: number): number {
    if (!this.flat) throw new Error('nearest needs a chart path');
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
    const flat = this.flat!;
    const f = Math.min(this.count - 1, Math.max(0, s / this.step));
    const i = Math.min(this.count - 2, Math.floor(f));
    return out.lerpVectors(flat[i], flat[i + 1], f - i);
  }

  flatTangentAt(s: number, out = new THREE.Vector2()): THREE.Vector2 {
    const flat = this.flat!;
    const f = Math.min(this.count - 2, Math.max(0, s / this.step));
    const i = Math.floor(f);
    return out.subVectors(flat[i + 1], flat[i]).normalize();
  }

  at(s: number, out: PathSample): PathSample {
    const f = Math.min(this.count - 1.0001, Math.max(0, s / this.step));
    const i = Math.floor(f);
    const t = f - i;
    out.pos.lerpVectors(this.pos[i], this.pos[i + 1], t);
    out.up.lerpVectors(this.up[i], this.up[i + 1], t).normalize();
    out.tangent.lerpVectors(this.tan[i], this.tan[i + 1], t).normalize();
    // Chart paths keep their radius exact between samples; free paths keep whatever height they climbed to.
    if (!this.freeHeight) out.pos.setLength(R + this.height);
    return out;
  }

  /** A ribbon of the given width following the path (left/right vertex pairs), optionally only between two distances. */
  ribbon(halfWidth: number, lift = 0, from = 0, to = this.length): { positions: Float32Array; uvs: Float32Array; indices: number[] } {
    const i0 = Math.max(0, Math.ceil(from / this.step));
    const i1 = Math.min(this.count - 1, Math.floor(to / this.step));
    const n = Math.max(0, i1 - i0 + 1);
    const positions = new Float32Array(n * 2 * 3);
    const uvs = new Float32Array(n * 2 * 2);
    const indices: number[] = [];
    const side = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let j = 0; j < n; j++) {
      const i = i0 + j;
      side.crossVectors(this.up[i], this.tan[i]).normalize();
      for (const k of [0, 1]) {
        p.copy(this.pos[i]).addScaledVector(side, k === 0 ? halfWidth : -halfWidth).addScaledVector(this.up[i], lift);
        positions.set([p.x, p.y, p.z], (j * 2 + k) * 3);
        uvs.set([k, i * this.step], (j * 2 + k) * 2);
      }
      if (j < n - 1) {
        const a = j * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    return { positions, uvs, indices };
  }
}
