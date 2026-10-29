import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Prefab } from './kit';

/** Merges a prefab into one geometry with per-vertex colours, so a multi-colour model is one instanced draw call. */
export function colouredGeometry(prefab: Prefab): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  for (const p of prefab.parts) {
    const g = p.geo.clone().applyMatrix4(p.m);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    c.copy((p.mat as THREE.MeshStandardMaterial).color);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  return mergeGeometries(parts, false)!;
}

const tmpR = new THREE.Vector3();

/** World matrix for something standing on the surface: `up` is the local up, `forward` the heading. */
export function surfaceMatrix(pos: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3, out: THREE.Matrix4, scale = 1): THREE.Matrix4 {
  // Re-orthogonalise: the heading may not be exactly tangent to the sphere.
  const f = forward.clone().addScaledVector(up, -forward.dot(up)).normalize();
  tmpR.crossVectors(up, f).normalize();
  out.makeBasis(tmpR, up, f);
  if (scale !== 1) out.scale(new THREE.Vector3(scale, scale, scale));
  out.setPosition(pos);
  return out;
}

/**
 * A pile of identical props drawn as one instanced mesh. Each frame, call `begin()`, `push()` for every live
 * instance, then `end()`; nothing needs slot bookkeeping.
 */
export class InstancePool {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private colour = new THREE.Color();

  constructor(prefab: Prefab, readonly capacity: number, private tinted = false, castShadow = true) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(colouredGeometry(prefab), mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (tinted) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin(): void {
    this.n = 0;
  }

  /** Adds an instance; `tint` multiplies the prefab's own colours. Returns false when the pool is full. */
  push(m: THREE.Matrix4, tint?: number): boolean {
    if (this.n >= this.capacity) return false;
    this.mesh.setMatrixAt(this.n, m);
    if (this.tinted && tint !== undefined) this.mesh.setColorAt(this.n, this.colour.setHex(tint));
    this.n++;
    return true;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
