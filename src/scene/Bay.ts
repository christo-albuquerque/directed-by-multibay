import * as THREE from 'three';
import type { FactoryMode, FactoryState, StageName } from '../sim/factory';
import { STAGES } from '../sim/factory';
import { Tv } from './Tv';
import { box, cyl, makeLabel, mat, shadowAll } from './util';

/** World X of each stage, then the launchpad. Index = path position `u`. */
export const PATH_X = [-10, -6, -2, 2, 6, 12];
export const BELT_Y = 0.55;

const STAGE_COLOR: Record<StageName, number> = {
  depot: 0xc08a4f,
  lint: 0x55b6a7,
  build: 0x3a6ea5,
  test: 0xb8553d,
  dispatch: 0x7a5aa8,
};

const STAGE_TITLE: Record<StageName, string> = {
  depot: 'DEPENDENCIES',
  lint: 'LINT',
  build: 'BUILD',
  test: 'TESTING GROUNDS',
  dispatch: 'DISPATCH',
};

/** Position along the belt for a path value u (clamped to the launchpad). */
export function pathPosition(u: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.min(Math.max(u, 0), PATH_X.length - 1);
  const i = Math.min(Math.floor(c), PATH_X.length - 2);
  const f = c - i;
  return out.set(PATH_X[i] + (PATH_X[i + 1] - PATH_X[i]) * f, BELT_Y, 0);
}

/** One factory bay: a row of stage stations along a conveyor belt. Placeholder art for milestone 1. */
export class Bay {
  readonly group = new THREE.Group();
  readonly tvs: Tv[] = [];
  private beltTex: THREE.CanvasTexture;
  private press!: THREE.Mesh;
  private cannon!: THREE.Mesh;

  constructor(name: string) {
    this.beltTex = makeBeltTexture();
    this.buildBelt();
    this.buildStations();
    const sign = makeLabel(name, { fontPx: 34, color: '#ffd9a0' });
    sign.position.set(-4, 5.6, 4.6);
    this.group.add(sign);
    shadowAll(this.group);
  }

  private buildBelt(): void {
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(PATH_X[4] - PATH_X[0] + 3, 0.3, 1.5),
      [mat(0x2a2d33), mat(0x2a2d33), new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.9 }), mat(0x2a2d33), mat(0x2a2d33), mat(0x2a2d33)],
    );
    belt.position.set((PATH_X[0] + PATH_X[4]) / 2, BELT_Y - 0.15, 0);
    this.group.add(belt);

    // Road from dispatch to the launchpad for the (future) truck.
    const road = new THREE.Mesh(new THREE.BoxGeometry(PATH_X[5] - PATH_X[4] - 1.5, 0.06, 1.8), mat(0x3b3d44));
    road.position.set((PATH_X[4] + PATH_X[5]) / 2 + 0.2, 0.12, 0);
    this.group.add(road);
    for (let x = PATH_X[4] + 1.4; x < PATH_X[5] - 1.2; x += 0.9) {
      const dash = box(0.45, 0.02, 0.1, 0xf4e8b0, x, 0.15, 0);
      this.group.add(dash);
    }
  }

  private buildStations(): void {
    STAGES.forEach((stage, i) => {
      const g = new THREE.Group();
      g.position.x = PATH_X[i];

      const plate = box(3.6, 0.14, 7, 0xa9a398, 0, 0.12, -0.2);
      const stripe = box(3.6, 0.15, 0.25, STAGE_COLOR[stage], 0, 0.12, 3.1);
      g.add(plate, stripe);

      const label = makeLabel(STAGE_TITLE[stage], { fontPx: 30 });
      label.position.set(0, 4.6, 0);
      g.add(label);

      switch (stage) {
        case 'depot':
          g.add(box(1.3, 1.3, 1.3, 0xb5835a, -0.7, 0.2, -2.6), box(1.3, 1.3, 1.3, 0xa3724a, 0.8, 0.2, -2.4), box(1.2, 1.2, 1.2, 0xc08a4f, 0, 1.5, -2.5));
          g.add(cyl(0.35, 0.35, 2.4, 0x6b7280, 0, 0.2, -1.2, 12));
          break;
        case 'lint': {
          g.add(box(0.25, 2.4, 0.25, 0x55b6a7, -1, 0.2, 0), box(0.25, 2.4, 0.25, 0x55b6a7, 1, 0.2, 0), box(2.5, 0.3, 0.35, 0x55b6a7, 0, 2.6, 0));
          const lens = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 8, 20), mat(0xe2e8f0));
          lens.position.set(0, 1.8, -2.2);
          g.add(lens, cyl(0.05, 0.05, 1.3, 0x94a3b8, 0, 0.2, -2.2, 6));
          break;
        }
        case 'build': {
          g.add(box(2.6, 2.4, 1.9, 0x3a6ea5, 0, 0.2, -2.5), cyl(0.3, 0.3, 1.6, 0x475569, 0.8, 2.6, -2.5, 10));
          this.press = box(1.1, 0.6, 1.1, 0xcbd5e1, 0, 3.2, 0);
          const post = box(0.3, 2.6, 0.3, 0x64748b, 0, 0.2, 1.2);
          g.add(this.press, post, box(0.3, 0.3, 1.5, 0x64748b, 0, 2.6, 0.55));
          break;
        }
        case 'test': {
          g.add(box(3.4, 3.2, 0.3, 0xcfc7b8, 0, 0.2, -3.0));
          const target = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 20), mat(0xdc2626));
          target.position.set(-0.85, 1.0, -2.8);
          g.add(target);
          this.cannon = cyl(0.25, 0.35, 1.2, 0x334155, 0, 0.5, 2.2, 12);
          this.cannon.rotation.x = Math.PI / 2.6;
          g.add(this.cannon);
          const tvA = new Tv('metrics', 1.8);
          tvA.group.position.set(-0.85, 2.5, -2.75);
          const tvB = new Tv('lab', 1.3);
          tvB.group.position.set(0.95, 2.5, -2.75);
          this.tvs.push(tvA, tvB);
          g.add(tvA.group, tvB.group);
          break;
        }
        case 'dispatch':
          g.add(box(2.6, 1.0, 2.2, 0x7a5aa8, 0, 0.2, -2.4), box(0.2, 2.2, 0.2, 0x64748b, -1.2, 0.2, 1.6), box(0.2, 2.2, 0.2, 0x64748b, 1.2, 0.2, 1.6), box(2.6, 0.2, 0.3, 0x7a5aa8, 0, 2.2, 1.6));
          break;
      }
      this.group.add(g);
    });
  }

  update(dt: number, elapsed: number, mode: FactoryMode, state: FactoryState): void {
    const running = mode !== 'idle';
    if (running) this.beltTex.offset.x -= dt * 0.9;
    // Press stamps, cannon recoils; both calm when idle.
    if (this.press) this.press.position.y = 3.2 - (running ? (Math.sin(elapsed * 5) * 0.5 + 0.5) * 1.1 : 0);
    if (this.cannon) this.cannon.position.z = 2.2 + (running ? Math.max(0, Math.sin(elapsed * 6)) * 0.25 : 0);
    for (const tv of this.tvs) tv.update(mode, state.stats, elapsed);
  }
}

function makeBeltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a3f48';
  ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = '#4d535e';
  for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 8, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(10, 1);
  return tex;
}
