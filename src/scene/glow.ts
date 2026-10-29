import * as THREE from 'three';

interface Entry {
  mat: THREE.MeshStandardMaterial;
  day: number;
  night: number;
}

const entries: Entry[] = [];

/** A material that glows brighter as night falls (neon, string lights, signs). */
export function glowMaterial(color: number, day = 0.1, night = 1.6, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: day, flatShading: true, roughness: 0.6, ...opts });
  entries.push({ mat, day, night });
  return mat;
}

/** `night` is 0 (day) .. 1 (night). */
export function updateGlow(night: number): void {
  for (const e of entries) e.mat.emissiveIntensity = e.day + (e.night - e.day) * night;
}
