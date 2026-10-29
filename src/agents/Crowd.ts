import * as THREE from 'three';
import type { FactoryMode } from '../sim/factory';
import { PLAZA_RADIUS, PLAZA_TOP } from '../scene/Courtyard';
import { PATH_X } from '../scene/layout';
import { BAY_X0, BAY_X1, BAY_Z0, BAY_Z1, type Layout } from '../scene/layoutPlan';
import type { Seat } from '../scene/Courtyard';
import type { Particles } from '../scene/Particles';
import type { GrainVariant } from './grains';
import { Worker, type Routine, type WorkStyle } from './Worker';

const PLATE_TOP = 0.26;
const APRON_TOP = 0.12;
/** The rescue hut sits at the left end of each apron (bay-local); crew wait in front of it. */
export const HUT = new THREE.Vector3(-14, 0, 3.4);
const ALARM_SECONDS = 3.5;

let ground: Pick<Layout, 'bayZ' | 'plazas'> = { bayZ: [0], plazas: [{ x: 0, z: 10.5 }] };

/** Tells every worker where the floors are, for the current set of bays and plazas. */
export function setGroundLayout(layout: Pick<Layout, 'bayZ' | 'plazas'>): void {
  ground = layout;
}

/** Height of the floor under (x, z): plates under each stage, the apron, the plaza, or bare ground. */
export function groundAt(x: number, z: number): number {
  for (const bz of ground.bayZ) {
    const lz = z - bz;
    if (lz >= -3.6 && lz <= 3.3 && PATH_X.slice(0, 5).some((sx) => Math.abs(x - sx) < 1.8)) return PLATE_TOP;
    if (lz >= BAY_Z0 && lz <= BAY_Z1 && x >= BAY_X0 && x <= BAY_X1) return APRON_TOP;
  }
  if (ground.plazas.some((p) => Math.hypot(x - p.x, z - p.z) < PLAZA_RADIUS)) return PLAZA_TOP;
  return 0;
}

/** z shift of the bay whose roster is being built; set by the Crowd constructor. */
let bayDz = 0;

function v(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z + bayDz);
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

/** The rescue crew: two hazmat suits with extinguishers/brooms and two medics, based at the hut. */
function crewRoster(): { variant: GrainVariant; routine: Routine }[] {
  const crew = (variant: GrainVariant, role: 'treat' | 'spray' | 'sweep', hx: number, hz: number, ox: number, oz: number) => ({
    variant,
    routine: { kind: 'response', role, home: v(hx, hz), offset: new THREE.Vector2(ox, oz) } as Routine,
  });
  return [
    crew('hazmat', 'spray', HUT.x + 1.6, 5.6, -1.1, 1.9),
    crew('medic', 'treat', HUT.x + 0.2, 5.8, 1.1, 1.9),
    crew('medic', 'treat', HUT.x - 1.2, 5.5, -0.4, 2.8),
    crew('hazmat', 'sweep', HUT.x + 2.8, 5.2, 1.0, 2.9),
  ];
}

export interface CrowdContext {
  fx: Particles;
  /** Position of the failed product, or null when nothing is broken. */
  incident: THREE.Vector3 | null;
  /** 0..1 factory busyness. */
  activity: number;
}

/** Owns every worker, reacts to factory mode changes, and handles click picking. */
export class Crowd {
  readonly group = new THREE.Group();
  readonly workers: Worker[] = [];
  /** Seconds of alarm remaining after a new commit wakes the factory. */
  alarmLeft = 0;
  private prevMode: FactoryMode = 'idle';
  private raycaster = new THREE.Raycaster();

  /** `bayZ` is the world z of the bay this crowd works in. */
  constructor(bayZ: number) {
    bayDz = bayZ;
    for (const { variant, routine } of [...roster(), ...crewRoster()]) {
      const w = new Worker(variant, routine);
      this.workers.push(w);
      this.group.add(w.rig.root);
      if (routine.kind === 'response') w.placeAt(routine.home, Math.PI / 4);
    }
    bayDz = 0;
  }

  /** Everyone except the rescue crew, who need a break spot on the plaza. */
  get seatable(): Worker[] {
    return this.workers.filter((w) => w.routine.kind !== 'response');
  }

  update(dt: number, elapsed: number, mode: FactoryMode, ctx: CrowdContext): void {
    if (mode !== this.prevMode) {
      const wasIdle = this.prevMode === 'idle';
      const idle = mode === 'idle';
      if (wasIdle !== idle) {
        for (const w of this.workers) w.setIdle(idle, wasIdle);
        if (wasIdle) this.alarmLeft = ALARM_SECONDS;
      }
      if (mode === 'failure') {
        for (const w of this.workers) {
          if (w.variant === 'wheat') {
            w.react('gasp');
            w.spray(7);
          }
        }
      }
      this.prevMode = mode;
    }
    this.alarmLeft = Math.max(0, this.alarmLeft - dt);
    const wctx = { ground: groundAt, fx: ctx.fx, incident: ctx.incident, activity: ctx.activity };
    for (const w of this.workers) w.update(dt, elapsed, wctx);
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

/** Deals out break spots (random, but the same every load) to every seatable worker across all crowds. */
export function assignBreakSeats(crowds: Crowd[], seats: Seat[]): void {
  let a = 11;
  const rand = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...seats];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const crowd of crowds) {
    for (const w of crowd.seatable) {
      const s = pool.pop();
      if (!s) continue;
      w.seat = s;
      w.placeAt(s.pos, s.face);
    }
  }
}
