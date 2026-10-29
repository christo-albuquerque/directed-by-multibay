import type * as THREE from 'three';
import type { Emitter } from '../scene/Particles';
import type { CrowdRenderer } from './crowd';
import type { InstancePool } from './pools';

/** Everything a part of the world needs to know about the current frame. */
export interface Env {
  dt: number;
  elapsed: number;
  /** 0..1 how busy the whole factory is. */
  activity: number;
  fx: Emitter;
  /** Where the camera is looking at and how far away it is: far things skip fine detail. */
  focus: THREE.Vector3;
  camDist: number;
}

/** Shared instanced renderers that every district draws into. */
export interface Pools {
  crates: InstancePool;
  boxes: InstancePool;
  crowd: CrowdRenderer;
}
