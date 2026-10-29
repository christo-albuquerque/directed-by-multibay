import * as THREE from 'three';
import type { SurfacePath } from '../globe/path';
import { surfaceMatrix } from './pools';
import { M, Prefab, type StaticBatch } from './kit';

/** One scrolling belt surface (stripes and cleats) shared by a line's lanes. */
export class BeltSurface {
  readonly tex: THREE.CanvasTexture;
  readonly mat: THREE.MeshStandardMaterial;

  constructor() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#353a43';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#23262d';
    ctx.fillRect(0, 0, 7, 64);
    ctx.fillRect(57, 0, 7, 64);
    ctx.fillStyle = '#4c525e';
    for (let y = 0; y < 64; y += 32) ctx.fillRect(9, y, 46, 8);
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.repeat.set(1, 1 / 2);
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  }

  /** Moves the stripes forward by `distance` world units. */
  scroll(distance: number): void {
    this.tex.offset.y -= distance / 2;
  }
}

/** A belt (or road) following a path as a flat ribbon on the planet's surface. */
export function ribbonMesh(path: SurfacePath, halfWidth: number, mat: THREE.Material, lift = 0): THREE.Mesh {
  const r = path.ribbon(halfWidth, lift);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(r.positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(r.uvs, 2));
  g.setIndex(r.indices);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.frustumCulled = false;
  return m;
}

const LEG = new Prefab().box(0.35, 0.6, 1.5, M(0x4a505c), 0, 0, 0).box(2.4, 0.15, 0.35, M(0x4a505c), 0, 0.5, 0);

/** Support legs and edge rails along a belt, merged into the static scenery. */
export function beltSupports(batch: StaticBatch, path: SurfacePath, spacing = 4, railHalf = 2.0): void {
  const p = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
  const m = new THREE.Matrix4();
  const rail = new Prefab().box(0.16, 0.34, spacing + 0.1, M(0x9aa4b2), railHalf, 0, 0).box(0.16, 0.34, spacing + 0.1, M(0x9aa4b2), -railHalf, 0, 0);
  for (let s = spacing / 2; s < path.length; s += spacing) {
    path.at(s, p);
    surfaceMatrix(p.pos, p.tangent, p.up, m);
    // `at` sits at belt height; legs hang below it.
    m.multiply(new THREE.Matrix4().makeTranslation(0, -0.55, 0));
    batch.place(LEG, m);
    batch.place(rail, new THREE.Matrix4().copy(m).multiply(new THREE.Matrix4().makeTranslation(0, 0.5, 0)));
  }
}
