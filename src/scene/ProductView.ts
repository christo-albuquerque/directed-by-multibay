import * as THREE from 'three';
import type { FactoryState, Product, ProductStatus } from '../sim/factory';
import { pathPosition } from './Bay';
import { box, makeLabel, shadowAll } from './util';

const COLOR: Record<ProductStatus, number> = {
  moving: 0xc89b5f,
  launching: 0x86d17a,
  launched: 0x86d17a,
  failed: 0xd62828,
  cancelled: 0x8a8f98,
};

/** Sealed cardboard box with tape and a floating label. */
function makeProductMesh(p: Product): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.9, 0.9, 0.9, 0xffffff, 0, 0));
  const tape = box(0.2, 0.02, 0.92, 0xe8dcc0, 0, 0.9);
  tape.position.y = 0.9;
  g.add(tape);
  const label = makeLabel(p.label, { fontPx: 26 });
  label.position.y = 1.9;
  g.add(label);
  shadowAll(g);
  return g;
}

/** Keeps one 3D box per Product in the sim and moves it along the belt. */
export class ProductView {
  readonly group = new THREE.Group();
  private views = new Map<number, THREE.Group>();
  private tmp = new THREE.Vector3();

  update(state: FactoryState, elapsed: number): void {
    const live = new Set<number>();
    for (const p of state.products) {
      live.add(p.id);
      let v = this.views.get(p.id);
      if (!v) {
        v = makeProductMesh(p);
        this.views.set(p.id, v);
        this.group.add(v);
      }
      pathPosition(p.u, this.tmp);
      v.position.copy(this.tmp);
      if (p.status === 'launching') v.position.y = -50; // loaded into the rocket
      v.rotation.z = p.status === 'failed' ? Math.sin(elapsed * 30) * 0.08 : 0;
      const body = v.children[0] as THREE.Mesh;
      (body.material as THREE.MeshStandardMaterial).color.setHex(COLOR[p.status]);
      (body.material as THREE.MeshStandardMaterial).emissive.setHex(p.status === 'failed' ? 0x550000 : 0x000000);
    }
    for (const [id, v] of this.views) {
      if (!live.has(id)) {
        this.group.remove(v);
        this.views.delete(id);
      }
    }
  }
}
