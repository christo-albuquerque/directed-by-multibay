import * as THREE from 'three';
import type { Prefab } from './kit';
import { colouredGeometry } from './pools';

export const DYN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0.2 });

/** A moving machine part: a mesh whose transform is a fixed placement times a per-frame local offset. */
export class Dyn {
  readonly mesh: THREE.Mesh;

  constructor(
    prefab: Prefab,
    readonly base: THREE.Matrix4,
    parent: THREE.Object3D,
  ) {
    this.mesh = new THREE.Mesh(colouredGeometry(prefab), DYN_MAT);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    parent.add(this.mesh);
    this.set(new THREE.Matrix4());
  }

  set(local: THREE.Matrix4): void {
    this.mesh.matrix.multiplyMatrices(this.base, local);
    this.mesh.matrixWorldNeedsUpdate = true;
  }
}
