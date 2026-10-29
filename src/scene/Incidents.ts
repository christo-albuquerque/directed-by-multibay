import * as THREE from 'three';
import { HUT } from '../agents/Crowd';
import type { FactoryState, ProductStatus } from '../sim/factory';
import { sfx } from '../ui/sfx';
import { BELT_Y, PATH_X, pathPosition } from './layout';
import type { Emitter } from './Particles';
import { box, makeLabel, shadowAll } from './util';

/** Where smoke pours out for a failure at each stage (world coordinates). */
const SMOKE_AT = [
  new THREE.Vector3(PATH_X[0], 2.4, -2.5),
  new THREE.Vector3(PATH_X[1], 3.2, 0),
  new THREE.Vector3(PATH_X[2] + 0.8, 2.9, -2.5),
  new THREE.Vector3(PATH_X[3], 2.2, 0),
  new THREE.Vector3(PATH_X[4], 2.3, -2.4),
];

/** Failure presentation: smoke, sparks, flashing red light, debris, the rescue hut and its stretcher. */
export class Incidents {
  readonly group = new THREE.Group();
  /** World position of the first failed product, or null. */
  incident: THREE.Vector3 | null = null;
  private seen = new Map<number, ProductStatus>();
  private light = new THREE.PointLight(0xff3322, 0, 10, 1.5);
  private stretcher = new THREE.Group();
  private stretcherP = 0;
  private roofLight: THREE.Mesh;
  private incidentAge = 0;
  private smokeAcc = 0;
  private sparkAcc = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor() {
    // Rescue hut.
    const hut = new THREE.Group();
    hut.position.copy(HUT);
    hut.add(box(2.4, 1.5, 1.9, 0xf1f1f1, 0, 0.12), box(2.7, 0.15, 2.2, 0xdc2626, 0, 1.62));
    for (const [x, z, ry] of [[0, 0.96, 0], [1.21, 0, Math.PI / 2]] as const) {
      const cross = new THREE.Group();
      cross.add(box(0.7, 0.2, 0.02, 0xdc2626, 0, 0.6), box(0.2, 0.7, 0.02, 0xdc2626, 0, 0.35));
      cross.position.set(x, 0.55, z);
      cross.rotation.y = ry;
      hut.add(cross);
    }
    this.roofLight = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xff2200, emissiveIntensity: 0.1 }));
    this.roofLight.position.set(0, 1.9, 0);
    const label = makeLabel('RESCUE', { fontPx: 22, color: '#ffd0cc' });
    label.position.set(0, 3.0, 0);
    hut.add(this.roofLight, label);
    shadowAll(hut);
    this.group.add(hut);

    // Stretcher that is set down beside the incident.
    this.stretcher.add(box(0.8, 0.12, 1.8, 0xe8e2d4, 0, 0.18), box(0.7, 0.04, 1.7, 0xdc2626, 0, 0.3), box(0.1, 0.18, 0.1, 0x6b7280, -0.35, 0, -0.8), box(0.1, 0.18, 0.1, 0x6b7280, 0.35, 0, -0.8), box(0.1, 0.18, 0.1, 0x6b7280, -0.35, 0, 0.8), box(0.1, 0.18, 0.1, 0x6b7280, 0.35, 0, 0.8));
    this.stretcher.rotation.y = Math.PI / 2;
    this.stretcher.visible = false;
    shadowAll(this.stretcher);
    this.group.add(this.stretcher, this.light);
  }

  update(dt: number, elapsed: number, state: FactoryState, fx: Emitter): void {
    let failed = null as (typeof state.products)[number] | null;
    for (const p of state.products) {
      if (p.status === 'failed' && !failed) failed = p;
      if (p.status === 'failed' && this.seen.get(p.id) !== 'failed') this.onFail(p, fx);
      this.seen.set(p.id, p.status);
    }
    // Forget products that are gone.
    if (this.seen.size > 40) for (const id of this.seen.keys()) if (!state.products.some((p) => p.id === id)) this.seen.delete(id);

    if (!failed) {
      this.incident = null;
      this.incidentAge = 0;
      this.light.intensity = 0;
    } else {
      this.incident = pathPosition(failed.u, this.incident ?? new THREE.Vector3());
      this.incidentAge = failed.age;
      this.emitSmoke(dt, failed.failAt ?? 0, fx);
      const flick = 0.55 + 0.45 * Math.sin(elapsed * 22);
      this.light.position.set(this.incident.x, 2.2, this.incident.z + 0.5);
      this.light.intensity = 14 * flick;
    }

    (this.roofLight.material as THREE.MeshStandardMaterial).emissiveIntensity = failed ? 0.4 + 1.8 * (0.5 + 0.5 * Math.sin(elapsed * 12)) : 0.1;

    // Stretcher pops in once the crew has arrived, and packs away afterwards.
    const wantStretcher = !!failed && this.incidentAge > 2.2;
    this.stretcherP = THREE.MathUtils.clamp(this.stretcherP + (wantStretcher ? dt * 3 : -dt * 4), 0, 1);
    this.stretcher.visible = this.stretcherP > 0.01;
    if (this.incident) this.stretcher.position.set(this.incident.x + 2.0, 0.26, this.incident.z + 1.0);
    this.stretcher.scale.setScalar(Math.max(0.01, this.stretcherP));
  }

  private onFail(p: { u: number; failAt: number | null }, fx: Emitter): void {
    sfx.crash();
    const at = pathPosition(p.u, this.tmp).setY(BELT_Y + 0.5);
    fx.burst(at, 8, 0.5, 1, new THREE.Vector3(0, 0.2, 0), { color: 0xfff1b0, size0: 1.0, size1: 2.6, life: 0.25, alpha: 0.9, drag: 4 });
    fx.burst(at, 22, 4.2, 2, new THREE.Vector3(0, 1, 0), { color: 0xc89b5f, size0: 0.14, size1: 0.1, life: 1.1, alpha: 1, gravity: -9, drag: 0.3 });
    fx.burst(at, 12, 3.2, 2, new THREE.Vector3(0, 1, 0), { color: 0xd62828, size0: 0.14, size1: 0.1, life: 1.0, alpha: 1, gravity: -9, drag: 0.3 });
  }

  private emitSmoke(dt: number, stage: number, fx: Emitter): void {
    const src = SMOKE_AT[Math.min(Math.max(Math.floor(stage), 0), SMOKE_AT.length - 1)];
    this.smokeAcc += dt * 26;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      fx.emit(this.tmp.copy(src), this.tmp2.set((Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6), { color: 0x2a2b30, size0: 0.4, size1: 2.0, life: 2.4, alpha: 0.75, drag: 0.5 });
    }
    this.sparkAcc += dt * 7;
    while (this.sparkAcc >= 1) {
      this.sparkAcc -= 1;
      fx.emit(this.tmp.copy(src).add(this.tmp2.set((Math.random() - 0.5) * 0.4, -0.3, (Math.random() - 0.5) * 0.4)), this.tmp2.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3), { color: 0xffa31a, size0: 0.12, size1: 0.03, life: 0.7, alpha: 1, gravity: -7, drag: 0.2 });
    }
  }
}
