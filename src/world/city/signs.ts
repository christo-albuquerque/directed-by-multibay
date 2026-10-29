import * as THREE from 'three';
import type { Chart } from '../../globe/surface';
import { registerGlow } from '../kit';

export interface SignSpec {
  text: string;
  /** CSS colour of the neon. */
  color: string;
  /** Optional second line, smaller. */
  sub?: string;
}

const CELL_W = 256;
const CELL_H = 128;
const COLS = 4;

/**
 * Every neon sign in the market shares one canvas texture, so forty signs cost one draw call. Each sign is a quad
 * that samples its own cell of the atlas.
 */
export class SignAtlas {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly mat: THREE.MeshStandardMaterial;
  private cells = 0;
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private rows: number;

  constructor(specs: SignSpec[], group: string) {
    this.rows = Math.ceil(specs.length / COLS);
    this.canvas.width = CELL_W * COLS;
    this.canvas.height = CELL_H * this.rows;
    this.ctx = this.canvas.getContext('2d')!;
    specs.forEach((s) => this.draw(s));
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, emissiveMap: this.tex, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.6, side: THREE.DoubleSide });
    registerGlow(group, this.mat, 0.35, 1.8);
  }

  private draw(s: SignSpec): void {
    const i = this.cells++;
    const x = (i % COLS) * CELL_W;
    const y = Math.floor(i / COLS) * CELL_H;
    const c = this.ctx;
    c.fillStyle = '#0a0612';
    c.fillRect(x, y, CELL_W, CELL_H);
    c.strokeStyle = s.color;
    c.lineWidth = 5;
    c.strokeRect(x + 6, y + 6, CELL_W - 12, CELL_H - 12);
    c.fillStyle = s.color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const fit = s.text.length > 12 ? 30 : s.text.length > 8 ? 38 : 46;
    c.font = `900 ${fit}px system-ui, "Segoe UI", sans-serif`;
    c.shadowColor = s.color;
    c.shadowBlur = 10;
    c.fillText(s.text, x + CELL_W / 2, y + CELL_H / 2 - (s.sub ? 12 : 0));
    if (s.sub) {
      c.font = '700 20px system-ui, sans-serif';
      c.fillText(s.sub, x + CELL_W / 2, y + CELL_H / 2 + 26);
    }
    c.shadowBlur = 0;
  }

  /** A sign quad at chart (x, z) and height h, `w` x `hh` units, turned by rot (0 faces +z, the viewer). */
  add(chart: Chart, cell: number, x: number, z: number, h: number, w: number, hh: number, rot = 0): void {
    const m = chart.matrix(x, z, h, rot);
    const u0 = (cell % COLS) / COLS;
    const v1 = 1 - Math.floor(cell / COLS) / this.rows;
    const u1 = u0 + 1 / COLS;
    const v0 = v1 - 1 / this.rows;
    const corners: [number, number, number, number][] = [
      [-w / 2, -hh / 2, u0, v0],
      [w / 2, -hh / 2, u1, v0],
      [w / 2, hh / 2, u1, v1],
      [-w / 2, hh / 2, u0, v1],
    ];
    const p = new THREE.Vector3();
    const n = new THREE.Vector3().setFromMatrixColumn(m, 2).normalize();
    const pts = corners.map(([cx, cy]) => p.set(cx, cy, 0).applyMatrix4(m).clone());
    const order = [0, 1, 2, 0, 2, 3];
    for (const k of order) {
      this.positions.push(pts[k].x, pts[k].y, pts[k].z);
      this.normals.push(n.x, n.y, n.z);
      this.uvs.push(corners[k][2], corners[k][3]);
    }
  }

  build(): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    const m = new THREE.Mesh(g, this.mat);
    m.frustumCulled = false;
    return m;
  }

  /** A tiny shimmer so the whole market never sits perfectly still. */
  flicker(t: number): void {
    this.mat.emissiveIntensity *= 0.96 + 0.04 * Math.sin(t * 37) * Math.sin(t * 11.3);
  }
}
