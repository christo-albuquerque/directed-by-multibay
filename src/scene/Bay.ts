import * as THREE from 'three';
import type { FactoryMode, FactoryState, StageName } from '../sim/factory';
import { STAGES } from '../sim/factory';
import { pressDip } from './choreography';
import { BELT_Y, PATH_X, pathPosition, TRUCK_DOCK_X, TRUCK_PAD_X } from './layout';
import type { Particles } from './Particles';
import { TestRig } from './TestRig';
import { Truck } from './Truck';
import { sfx } from '../ui/sfx';
import { glowMaterial } from './glow';
import { Tv } from './Tv';
import { box, cyl, makeLabel, mat, shadowAll } from './util';

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

const PRESS_REST = 3.2;
const PRESS_HALF = 0.3;
const CHIMNEY_TOP = new THREE.Vector3(PATH_X[2] + 0.8, 4.3, -2.5);

function lamp(color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 }));
}

/** One factory bay: a row of stage stations along a conveyor belt, plus the truck that serves the launchpad. */
export class Bay {
  readonly group = new THREE.Group();
  readonly tvs: Tv[] = [];
  readonly truck = new Truck();
  private beltTex: THREE.CanvasTexture;
  private press!: THREE.Mesh;
  private lens!: THREE.Mesh;
  private lintLamp = lamp(0x22c55e);
  private passLamp = lamp(0x22c55e);
  private testRig: TestRig;
  private pressDown = false;
  private smokeAcc = 0;
  private tmp = new THREE.Vector3();

  constructor(name: string) {
    this.beltTex = makeBeltTexture();
    this.buildBelt();
    this.buildStations();
    this.testRig = new TestRig(this.group);
    this.group.add(this.truck.group);
    const sign = makeLabel(name, { fontPx: 34, color: '#ffd9a0' });
    sign.position.set(-4, 5.6, 4.6);
    this.group.add(sign);
    shadowAll(this.group);
  }

  private buildBelt(): void {
    const len = PATH_X[4] - PATH_X[0] + 3;
    const cx = (PATH_X[0] + PATH_X[4]) / 2;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 1.5), [mat(0x2a2d33), mat(0x2a2d33), new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.9 }), mat(0x2a2d33), mat(0x2a2d33), mat(0x2a2d33)]);
    belt.position.set(cx, BELT_Y - 0.15, 0);
    this.group.add(belt);
    // Side rails and support legs.
    for (const z of [-0.78, 0.78]) this.group.add(box(len, 0.12, 0.08, 0x9aa4b2, cx, BELT_Y - 0.02, z));
    for (let x = PATH_X[0] - 1.2; x <= PATH_X[4] + 1.5; x += 2) for (const z of [-0.6, 0.6]) this.group.add(box(0.14, 0.25, 0.14, 0x475569, x, 0.12, z));

    // Road from the dock to the launchpad.
    const road = new THREE.Mesh(new THREE.BoxGeometry(TRUCK_PAD_X - PATH_X[4] + 3, 0.06, 1.9), mat(0x3b3d44));
    road.position.set((PATH_X[4] + TRUCK_PAD_X) / 2 + 1.2, 0.12, 0);
    this.group.add(road);
    for (let x = PATH_X[4] + 2; x < TRUCK_PAD_X + 2; x += 0.9) this.group.add(box(0.45, 0.02, 0.1, 0xf4e8b0, x, 0.15, 0));
  }

  private buildStations(): void {
    STAGES.forEach((stage, i) => {
      const g = new THREE.Group();
      g.position.x = PATH_X[i];

      const neon = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 0.25), glowMaterial(STAGE_COLOR[stage], 0.05, 1.5));
      neon.position.set(0, 0.2, 3.1);
      g.add(box(3.6, 0.14, 7, 0xa9a398, 0, 0.12, -0.2), neon);
      const label = makeLabel(STAGE_TITLE[stage], { fontPx: 30 });
      label.position.set(0, 4.6, 0);
      g.add(label);

      switch (stage) {
        case 'depot': {
          g.add(box(1.3, 1.3, 1.3, 0xb5835a, -0.7, 0.2, -2.6), box(1.3, 1.3, 1.3, 0xa3724a, 0.8, 0.2, -2.4), box(1.2, 1.2, 1.2, 0xc08a4f, 0, 1.5, -2.5));
          const tagA = makeLabel('npm-deps', { fontPx: 22 });
          tagA.position.set(-0.7, 2.0, -1.8);
          const tagB = makeLabel('cache', { fontPx: 22 });
          tagB.position.set(0.9, 1.5, -1.7);
          g.add(tagA, tagB);
          // Pipe from the stack over the belt to a funnel that drops new crates.
          g.add(cyl(0.12, 0.12, 3.4, 0x6b7280, 0, 0.2, -1.8, 8));
          const pipe = cyl(0.14, 0.14, 1.9, 0x6b7280, 0, 0, -0.85, 8);
          pipe.rotation.x = Math.PI / 2;
          pipe.position.set(0, 3.5, -0.85);
          const funnel = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.8, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x8b95a5, flatShading: true, side: THREE.DoubleSide }));
          funnel.rotation.x = Math.PI;
          funnel.position.set(0, 3.1, 0);
          g.add(pipe, funnel);
          break;
        }
        case 'lint': {
          // Gate across the belt: posts either side, beam overhead.
          g.add(box(0.25, 2.6, 0.25, 0x55b6a7, 0, 0.2, -1.0), box(0.25, 2.6, 0.25, 0x55b6a7, 0, 0.2, 1.0), box(0.3, 0.3, 2.5, 0x55b6a7, 0, 2.8, 0));
          this.lintLamp.position.set(0, 3.2, 0);
          g.add(this.lintLamp);
          this.lens = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 8, 20), mat(0xe2e8f0));
          this.lens.position.set(0, 1.8, -2.2);
          g.add(this.lens, cyl(0.05, 0.05, 1.3, 0x94a3b8, 0, 0.2, -2.2, 6));
          break;
        }
        case 'build': {
          g.add(box(2.6, 2.4, 1.9, 0x3a6ea5, 0, 0.2, -2.5), cyl(0.3, 0.3, 1.6, 0x475569, 0.8, 2.6, -2.5, 10));
          this.press = box(1.1, 0.6, 1.1, 0xcbd5e1, 0, PRESS_REST, 0);
          g.add(this.press, box(0.3, 2.6, 0.3, 0x64748b, 0, 0.2, 1.2), box(0.3, 0.3, 1.5, 0x64748b, 0, 2.6, 0.55));
          break;
        }
        case 'test': {
          g.add(box(3.4, 3.2, 0.3, 0xcfc7b8, 0, 0.2, -3.0));
          const target = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 20), mat(0xdc2626));
          target.position.set(-0.85, 1.0, -2.8);
          g.add(target);
          const tvA = new Tv('metrics', 1.8);
          tvA.group.position.set(-0.85, 2.5, -2.75);
          const tvB = new Tv('lab', 1.3);
          tvB.group.position.set(0.95, 2.5, -2.75);
          this.tvs.push(tvA, tvB);
          g.add(tvA.group, tvB.group);
          break;
        }
        case 'dispatch': {
          g.add(box(2.6, 1.0, 2.2, 0x7a5aa8, 0, 0.2, -2.4));
          g.add(box(0.25, 2.2, 0.25, 0x7a5aa8, 0, 0.2, -1.0), box(0.25, 2.2, 0.25, 0x7a5aa8, 0, 0.2, 1.0), box(0.3, 0.3, 2.5, 0x7a5aa8, 0, 2.2, 0));
          this.passLamp.position.set(0, 2.8, 0);
          g.add(this.passLamp);
          break;
        }
      }
      this.group.add(g);
    });
  }

  update(dt: number, elapsed: number, mode: FactoryMode, state: FactoryState, fx: Particles, night: number): void {
    const running = mode !== 'idle';
    if (running) this.beltTex.offset.x -= dt * 0.9;

    // Build press: stamps down on each crate, dry-cycles gently otherwise.
    let dip = 0;
    for (const p of state.products) dip = Math.max(dip, pressDip(p.u));
    const idleBob = running && dip === 0 ? (Math.sin(elapsed * 3) * 0.5 + 0.5) * 0.35 : 0;
    this.press.position.y = PRESS_REST + PRESS_HALF - 1.7 * dip - idleBob;
    if (dip > 0.92 && !this.pressDown) {
      this.pressDown = true;
      sfx.thud();
      fx.burst(this.tmp.set(PATH_X[2], BELT_Y + 0.1, 0), 12, 1.6, 2, new THREE.Vector3(0, 0.4, 0), { color: 0xd9d2c4, size0: 0.25, size1: 0.8, life: 0.7, alpha: 0.7 });
    } else if (dip < 0.3) this.pressDown = false;

    // Chimney smoke while the factory is busy.
    if (running) {
      this.smokeAcc += dt * 6;
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        fx.emit(CHIMNEY_TOP, this.tmp.set((Math.random() - 0.3) * 0.3, 0.9, (Math.random() - 0.5) * 0.3), { color: 0x9aa1ab, size0: 0.35, size1: 1.3, life: 2.6, alpha: 0.5, drag: 0.4 });
      }
    }

    // Lint gate: sparkles and a green lamp while a crate is under it; a slowly turning magnifier.
    let lintActive = false;
    let passActive = false;
    for (const p of state.products) {
      if (p.u > 0.85 && p.u < 1.3) {
        lintActive = true;
        if (Math.random() < dt * 30) fx.emit(pathPosition(p.u, this.tmp).add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 0.9)), new THREE.Vector3(0, 0.5, 0), { color: 0xfff7b0, size0: 0.18, size1: 0.02, life: 0.7, alpha: 1, drag: 1 });
      }
      if (p.u > 3.8 && p.u < 4.3 && p.status === 'moving') passActive = true;
    }
    (this.lintLamp.material as THREE.MeshStandardMaterial).emissiveIntensity = lintActive ? 1.8 : 0.15;
    (this.passLamp.material as THREE.MeshStandardMaterial).emissiveIntensity = passActive ? 1.8 : 0.15;
    if (this.lens) this.lens.rotation.y = running ? elapsed * 1.5 : 0;

    // Test stage hardware follows the product that is in it.
    const testing = state.products.find((p) => p.u > 3 && p.u <= 4 && (p.status === 'moving' || p.status === 'failed')) ?? null;
    this.testRig.update(dt, testing, fx);

    // Truck: waits at the dock, rides with the product to the pad, then returns.
    let target = TRUCK_DOCK_X;
    for (const p of state.products) {
      if (p.status === 'moving' && p.u >= 4.45) target = Math.max(target, pathPosition(p.u).x);
      if (p.status === 'launching' && p.age < 0.8) target = TRUCK_PAD_X;
    }
    this.truck.update(dt, elapsed, target, night);

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
