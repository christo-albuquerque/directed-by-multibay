import * as THREE from 'three';
import type { FactoryMode } from '../sim/factory';
import { PATH_X } from '../scene/layout';
import { rng } from '../scene/util';
import type { GrainVariant } from './grains';
import { Worker, type Routine, type WorkStyle } from './Worker';

const PLATE_TOP = 0.26;
const APRON_TOP = 0.12;
const COURTYARD = new THREE.Vector3(1, 0, 5.4);

/** Height of the floor under (x, z): raised plates under each stage, apron elsewhere. */
export function groundAt(x: number, z: number): number {
  if (z < -3.6 || z > 3.3) return APRON_TOP;
  return PATH_X.slice(0, 5).some((sx) => Math.abs(x - sx) < 1.8) ? PLATE_TOP : APRON_TOP;
}

function v(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z);
}

function station(x: number, z: number, style: WorkStyle): Routine {
  // Workers in front of the belt look -Z toward it; those behind look +Z.
  return { kind: 'station', spot: v(x, z), face: z > 0 ? Math.PI : 0, style };
}

function roster(): { variant: GrainVariant; routine: Routine }[] {
  const [depot, lint, build, test, dispatch] = PATH_X;
  const list: { variant: GrainVariant; routine: Routine }[] = [];
  const add = (variant: GrainVariant, routine: Routine): void => void list.push({ variant, routine });

  // Rice: the assembly line.
  add('rice', station(depot - 0.9, 1.3, 'load'));
  add('rice', station(depot + 0.9, 1.3, 'load'));
  add('rice', station(depot, -1.2, 'load'));
  add('rice', station(lint - 0.9, 1.3, 'polish'));
  add('rice', station(lint + 0.9, 1.3, 'polish'));
  add('rice', station(lint, -1.2, 'polish'));
  add('rice', station(dispatch - 0.9, 1.3, 'pack'));
  add('rice', station(dispatch + 0.9, 1.3, 'pack'));

  // Corn: heavy machinery at the build stage.
  add('corn', station(build - 0.9, 1.3, 'operate'));
  add('corn', station(build + 0.9, 1.3, 'operate'));
  add('corn', station(build - 0.7, -1.2, 'operate'));
  add('corn', station(build + 0.9, -1.2, 'operate'));

  // Wheat: the testing squad.
  add('wheat', station(test - 1.0, 1.4, 'throw'));
  add('wheat', station(test + 1.1, 1.4, 'throw'));
  add('wheat', station(test - 1.3, 2.4, 'throw'));
  add('wheat', station(test + 1.3, 2.4, 'throw'));
  add('wheat', station(test, -1.2, 'throw'));

  // Quinoa couriers on scooters, running the whole line.
  add('quinoa', { kind: 'courier', a: v(depot, 3.0), b: v(dispatch, 3.0), crate: 0xc08a4f });
  add('quinoa', { kind: 'courier', a: v(dispatch, 3.0), b: v(depot, 3.0), crate: 0x7a5aa8 });
  add('quinoa', { kind: 'courier', a: v(lint, 3.0), b: v(test, 3.0), crate: 0x55b6a7 });
  add('quinoa', { kind: 'courier', a: v(build, 3.0), b: v(lint, 3.0), crate: 0x3a6ea5 });

  // Millet runners hauling raw materials between the first stages.
  add('millet', { kind: 'courier', a: v(depot, 2.1), b: v(lint, 2.1), crate: 0xc08a4f });
  add('millet', { kind: 'courier', a: v(depot + 0.5, 2.1), b: v(lint - 0.5, 2.1), crate: 0x8b6b45 });
  add('millet', { kind: 'courier', a: v(lint + 1, 2.1), b: v(build - 1, 2.1), crate: 0x55b6a7 });
  add('millet', { kind: 'courier', a: v(build + 1, 2.1), b: v(test - 1, 2.1), crate: 0x3a6ea5 });

  // Basmati supervisors patrol the front of the bay with clipboards.
  add('basmati', { kind: 'patrol', points: [v(depot, 3.9), v(build, 3.9), v(test, 3.9), v(lint, 3.9)] });
  add('basmati', { kind: 'patrol', points: [v(dispatch, 3.9), v(test, 3.9), v(build, 3.9), v(dispatch + 2, 3.9)] });
  return list;
}

/** Owns every worker, reacts to factory mode changes, and handles click picking. */
export class Crowd {
  readonly group = new THREE.Group();
  readonly workers: Worker[] = [];
  private prevMode: FactoryMode = 'idle';
  private raycaster = new THREE.Raycaster();

  constructor() {
    for (const { variant, routine } of roster()) {
      const w = new Worker(variant, routine);
      this.workers.push(w);
      this.group.add(w.rig.root);
    }
    this.assignBreakSpots();
  }

  /** The courtyard crowd: a loose grid in front of the bay, everyone facing the centre. */
  private assignBreakSpots(): void {
    const rand = rng(11);
    const spots: THREE.Vector3[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 10; col++) spots.push(v(-5.5 + col * 1.45 + (row % 2) * 0.5, 4.7 + row * 0.8));
    }
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    this.workers.forEach((w, i) => {
      const s = spots[i];
      w.breakSpot.copy(s);
      w.breakFace = Math.atan2(COURTYARD.x - s.x, COURTYARD.z - s.z);
      w.placeAt(s, w.breakFace);
      w.pos.y = APRON_TOP;
    });
  }

  update(dt: number, elapsed: number, mode: FactoryMode): void {
    if (mode !== this.prevMode) {
      const wasIdle = this.prevMode === 'idle';
      const idle = mode === 'idle';
      if (wasIdle !== idle) for (const w of this.workers) w.setIdle(idle, wasIdle);
      if (mode === 'failure') for (const w of this.workers) if (w.variant === 'wheat') w.react('gasp');
      this.prevMode = mode;
    }
    for (const w of this.workers) w.update(dt, elapsed, groundAt);
  }

  /** Returns the worker under the pointer (normalised device coords), if any. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): Worker | null {
    this.raycaster.setFromCamera(ndc, camera);
    const hit = this.raycaster.intersectObjects(this.group.children, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o) {
      if (o.userData.worker) return o.userData.worker as Worker;
      o = o.parent;
    }
    return null;
  }
}
