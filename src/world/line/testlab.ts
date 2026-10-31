import * as THREE from 'three';
import { LOOKS, walkLimbs, workLimbs, type GrainPose, type LookName } from '../crowd';
import { Dyn } from '../dyn';
import { M, Prefab, glowMat } from '../kit';
import type { Env, Pools } from '../types';

/** The four ways a product is tested inside the testing grounds. */
export type TestKind = 'drop' | 'gun' | 'cannon' | 'rocket';
export const TEST_KINDS: TestKind[] = ['drop', 'gun', 'cannon', 'rocket'];
/** Seconds one test takes. */
export const TEST_SECONDS = 7;

/** Phase (0..1) at which the cannon fires and the ball lands. */
export const CANNON_FIRE = 0.4;
export const CANNON_HIT = 0.48;
const GUN_SHOTS = [0.26, 0.34, 0.42, 0.5, 0.58, 0.66];
const ROCKET_LAUNCH = 0.36;

export interface LabInput {
  /** Seconds this lane's item has been in the room, or null when no item is being tested. */
  t: number | null;
  /** Which test to run (rotates through the four). */
  variant: number;
  /** The product is failing here: the rocket test runs and explodes. */
  fail: boolean;
}

/** What a lane's item should do this frame. */
export interface ItemMotion {
  /** World position to draw the item at, or null to leave it on its trolley. */
  at: THREE.Vector3 | null;
  scaleY: number;
}

interface Actor {
  look: LookName;
  post: THREE.Vector2;
  /** Current position in the room's local frame. */
  x: number;
  z: number;
  yaw: number;
  walking: boolean;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpFwd = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
const ease = (t: number): number => t * t * (3 - 2 * t);
const seg = (u: number, a: number, b: number): number => clamp01((u - a) / (b - a));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Where items rest on their trolley (room-local): centre of the lane at trolley height. */
const REST_Y = 0.75;
const LANE_X = 1.7;

function miniRocket(color: number): Prefab {
  return new Prefab()
    .cyl(0.18, 0.18, 1.1, M(0xe8e8ee), 0, 0, 0, 8)
    .cone(0.18, 0.5, M(color), 0, 1.1, 0, 8)
    .box(0.5, 0.2, 0.05, M(color), 0, 0.05, 0)
    .box(0.05, 0.2, 0.5, M(color), 0, 0.05, 0)
    .cyl(0.12, 0.12, 0.12, glowMat('props', 0xffb02e, 0.8, 3), 0, -0.1, 0, 6);
}

/** The small launch tube the mini rockets leave from. */
export function launcherPrefab(): Prefab {
  return new Prefab()
    .box(1.5, 0.25, 1.5, M(0x4b5563), 0, 0, 0)
    .cyl(0.32, 0.36, 1.4, M(0x6b7280), 0, 0.25, 0, 10)
    .box(0.12, 0.9, 0.12, M(0xf5c542), -0.6, 0.25, 0.6)
    .box(0.12, 0.9, 0.12, M(0xf5c542), 0.6, 0.25, 0.6)
    .box(0.9, 0.5, 0.08, glowMat('props', 0xff3b2f, 0.2, 2), 0, 0.9, 0.7);
}

/**
 * The testing grounds' crew and their four tests. Eight testers live inside the room (a dropper, a gunner, a cannon
 * operator and a rocketeer on each side of the belt) and never leave it while working. Each lane's item picks one of the
 * four tests in turn: carried and dropped by hand, shot with a rifle, hit by a cannonball, or tested beside a mini rocket
 * launch that explodes when the product fails.
 */
export class TestLab {
  private actors: { side: 1 | -1; role: 'dropper' | 'gunner' | 'cannon' | 'rocket'; a: Actor }[] = [];
  private rockets: Dyn[] = [];
  private prev: (number | null)[] = [null, null];
  private shotsFired: number[] = [0, 0];
  /** Item motion for each lane (0 = bulk, +x side; 1 = express, −x side). */
  readonly motion: ItemMotion[] = [{ at: null, scaleY: 1 }, { at: null, scaleY: 1 }];
  /** Cannon state per lane for the barrel Dyns. */
  readonly cannon: { recoil: number; ballAt: THREE.Vector3 | null }[] = [{ recoil: 0, ballAt: null }, { recoil: 0, ballAt: null }];
  /** Brief light flashes (muzzle, cannon, blast) for the line to pulse. */
  flash = 0;
  private time = 0;

  constructor(
    private matrix: THREE.Matrix4,
    parent: THREE.Object3D,
  ) {
    for (const side of [1, -1] as const) {
      const place = (role: 'dropper' | 'gunner' | 'cannon' | 'rocket', look: LookName, x: number, z: number): void => {
        this.actors.push({ side, role, a: { look, post: new THREE.Vector2(x, z), x, z, yaw: -side * Math.PI / 2, walking: false } });
      };
      place('dropper', 'wheat', side * 5, -5);
      place('gunner', 'corn', side * 5, -2.2);
      place('cannon', 'wheat', side * 4.6, 4.7);
      place('rocket', 'rice', side * 4.6, -6.6);
      const r = new Dyn(miniRocket(side === 1 ? 0xff4fa3 : 0x39ffe0), new THREE.Matrix4(), parent);
      r.mesh.visible = false;
      this.rockets.push(r);
    }
  }

  private local(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(x, y, z).applyMatrix4(this.matrix);
  }

  /** Which test an item gets: rotates with the item and with each repeat while it waits for real tests. */
  static kindOf(variant: number, fail: boolean): TestKind {
    return fail ? 'rocket' : TEST_KINDS[((variant % 4) + 4) % 4];
  }

  update(env: Env, inputs: [LabInput, LabInput], pools: Pools): void {
    const dt = Math.min(env.dt, 0.1);
    this.time += dt;
    if (this.flash > 0) this.flash -= dt;
    tmpUp.setFromMatrixColumn(this.matrix, 1).normalize();
    const plans = inputs.map((inp, lane) => {
      const period = TEST_SECONDS;
      const u = inp.t === null ? null : inp.fail ? 0.3 + ((inp.t % (period * 0.7)) / (period * 0.7)) * 0.7 : (inp.t % period) / period;
      return { lane, u, kind: TestLab.kindOf(inp.variant + Math.floor((inp.t ?? 0) / period), inp.fail), fail: inp.fail };
    });

    for (const p of plans) {
      this.motion[p.lane].at = null;
      this.motion[p.lane].scaleY = 1;
      this.cannon[p.lane].recoil = 0;
      this.cannon[p.lane].ballAt = null;
    }
    // Targets for every actor: the post, unless this lane's test needs them elsewhere.
    const targets = new Map<Actor, { x: number; z: number; mode: 'idle' | 'walk' | 'work'; style?: GrainPose['propR']; pose?: Partial<GrainPose>; face?: [number, number] }>();
    for (const act of this.actors) targets.set(act.a, { x: act.a.post.x, z: act.a.post.y, mode: 'idle' });

    for (const p of plans) {
      const side = (p.lane === 0 ? 1 : -1) as 1 | -1;
      const u = p.u;
      const lane = p.lane;
      const rest = this.local(side * LANE_X, REST_Y, 0, new THREE.Vector3());
      const prevU = this.prev[lane];
      this.prev[lane] = u;
      if (u === null) {
        this.shotsFired[lane] = 0;
        this.rockets[lane === 0 ? 0 : 1].mesh.visible = false;
        continue;
      }
      const me = (role: string): { a: Actor } => this.actors.find((x) => x.side === side && x.role === role)!;
      const crossed = (at: number): boolean => prevU !== null && prevU < at && u >= at;
      if (u < (prevU ?? 0)) this.shotsFired[lane] = 0;

      if (p.kind === 'drop') {
        const dr = me('dropper').a;
        const grab = { x: side * 3.1, z: 0 };
        const drop = { x: side * 4.4, z: -1.2 };
        let t = targets.get(dr)!;
        if (u < 0.22) t = { x: grab.x, z: grab.z, mode: 'walk' };
        else if (u < 0.3) t = { x: grab.x, z: grab.z, mode: 'work', pose: { armL: -1.6, armR: -1.6, lean: 0.3 } };
        else if (u < 0.45) t = { x: lerp(grab.x, drop.x, ease(seg(u, 0.3, 0.45))), z: lerp(grab.z, drop.z, ease(seg(u, 0.3, 0.45))), mode: 'work', pose: { armL: -2.8, armR: -2.8, lean: -0.1 } };
        else if (u < 0.62) t = { x: drop.x, z: drop.z, mode: 'work', pose: { armL: -2.6, armR: -2.6 } };
        else if (u < 0.7) t = { x: drop.x, z: drop.z, mode: 'work', pose: { armL: -0.4, armR: -1.0, lean: 0.3 } };
        else if (u < 0.78) t = { x: drop.x, z: drop.z, mode: 'work', pose: { armL: -1.6, armR: -1.6, lean: 0.3 } };
        else t = { x: lerp(drop.x, grab.x, ease(seg(u, 0.78, 0.9))), z: lerp(drop.z, grab.z, ease(seg(u, 0.78, 0.9))), mode: u < 0.9 ? 'work' : 'idle', pose: { armL: -2.8, armR: -2.8 } };
        targets.set(dr, t);
        // The item: carried overhead, dropped, bounces, picked up, carried back, set on the trolley.
        const over = 1.9;
        const at = this.local(0, 0, 0, tmpA);
        let ix = side * LANE_X;
        let iz = 0;
        let iy = REST_Y;
        let sq = 1;
        if (u >= 0.3 && u < 0.45) {
          ix = dr.x;
          iz = dr.z;
          iy = lerp(REST_Y, over, ease(seg(u, 0.3, 0.36)));
        } else if (u >= 0.45 && u < 0.62) {
          ix = drop.x;
          iz = drop.z;
          // Falls, then bounces twice with a squash on each landing.
          const f = seg(u, 0.45, 0.62);
          const fall = clamp01(f / 0.3);
          const rise1 = clamp01((f - 0.3) / 0.35);
          const rise2 = clamp01((f - 0.65) / 0.25);
          iy = f < 0.3 ? lerp(over, 0.4, fall * fall) : f < 0.65 ? 0.4 + 0.9 * Math.sin(rise1 * Math.PI) : f < 0.9 ? 0.4 + 0.35 * Math.sin(rise2 * Math.PI) : 0.4;
          if (Math.abs(f - 0.3) < 0.04 || Math.abs(f - 0.65) < 0.03) sq = 0.6;
          if (crossed(0.45 + 0.17 * 0.3) && env.camDist < 200) this.puff(this.local(drop.x, 0.2, drop.z, tmpB));
        } else if (u >= 0.62 && u < 0.7) {
          ix = drop.x;
          iz = drop.z;
          iy = 0.4;
        } else if (u >= 0.7 && u < 0.78) {
          ix = drop.x;
          iz = drop.z;
          iy = lerp(0.4, over, ease(seg(u, 0.7, 0.78)));
        } else if (u >= 0.78 && u < 0.9) {
          ix = dr.x;
          iz = dr.z;
          iy = over;
        } else if (u >= 0.9) {
          ix = lerp(dr.x, side * LANE_X, ease(seg(u, 0.9, 0.96)));
          iz = lerp(dr.z, 0, ease(seg(u, 0.9, 0.96)));
          iy = lerp(over, REST_Y, ease(seg(u, 0.9, 0.96)));
        }
        void at;
        if (u >= 0.3 && u < 0.96) {
          this.motion[lane].at = this.local(ix, iy, iz, new THREE.Vector3());
          this.motion[lane].scaleY = sq;
        }
      } else if (p.kind === 'gun') {
        const gn = me('gunner').a;
        const mark = { x: side * 3.6, z: -1.6 };
        let t: ReturnType<typeof targets.get> = targets.get(gn)!;
        if (u < 0.2) t = { x: mark.x, z: mark.z, mode: 'walk', face: [side * LANE_X, 0] };
        else if (u < 0.74) t = { x: mark.x, z: mark.z, mode: 'work', style: 'rifle', pose: { armL: -1.4, armR: -1.5, lean: 0.05 }, face: [side * LANE_X, 0] };
        targets.set(gn, t!);
        const muzzle = this.local(gn.x - side * 0.5, 1.15, gn.z + 0.4, tmpB).clone();
        let kick = 0;
        GUN_SHOTS.forEach((at, i) => {
          if (crossed(at) && i >= this.shotsFired[lane]) {
            this.shotsFired[lane] = i + 1;
            this.flash = 0.12;
            if (env.camDist < 220) {
              env.fx.emit(muzzle, tmpA.copy(tmpUp).multiplyScalar(0.6), { color: 0xfff1a0, size0: 0.9, size1: 0.1, life: 0.12, alpha: 1, drag: 1 });
              // A tracer streaks to the box, then sparks fly where it hits.
              for (let k = 1; k <= 5; k++) {
                const f = k / 5;
                env.fx.emit(tmpA.lerpVectors(muzzle, rest, f), tmpB.set(0, 0, 0), { color: 0xffe9a8, size0: 0.28, size1: 0.05, life: 0.1 + f * 0.05, alpha: 0.95, drag: 1 });
              }
              for (let k = 0; k < 6; k++) env.fx.emit(rest, tmpB.set((Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5).applyMatrix4(new THREE.Matrix4().extractRotation(this.matrix)), { color: 0xffc233, size0: 0.2, size1: 0.04, life: 0.5, alpha: 1, drag: 0.4 });
            }
          }
          const since = u - at;
          if (since >= 0 && since < 0.05) kick = Math.max(kick, 1 - since / 0.05);
        });
        if (u >= 0.2 && u < 0.78 && kick > 0) {
          this.motion[lane].at = this.local(side * LANE_X - side * 0.0, REST_Y, -0.35 * kick, new THREE.Vector3());
        }
      } else if (p.kind === 'cannon') {
        const co = me('cannon').a;
        const mount = { x: side * 4.1, z: 4.4 };
        let t = targets.get(co)!;
        if (u < 0.15) t = { x: mount.x, z: mount.z, mode: 'walk', face: [side * 6, 3] };
        else if (u < 0.6) t = { x: mount.x, z: mount.z, mode: 'work', pose: u < 0.3 ? { armL: -0.9, armR: -0.9, lean: 0.35 } : u < CANNON_FIRE ? { armL: -1.6, armR: -1.3, lean: 0.2 } : { armL: -2.7, armR: -2.7, lean: -0.1 }, face: [side * 6, 3] };
        targets.set(co, t);
        if (u >= CANNON_FIRE && u < 0.5) this.cannon[lane].recoil = 1 - seg(u, CANNON_FIRE, CANNON_FIRE + 0.08);
        if (crossed(CANNON_FIRE)) {
          this.flash = 0.25;
          if (env.camDist < 220) env.fx.emit(this.local(side * 5.4, 1.6, 3, tmpA), tmpUp.clone().multiplyScalar(1), { color: 0xffd27a, size0: 1.8, size1: 0.2, life: 0.25, alpha: 1, drag: 1 });
        }
        if (u >= CANNON_FIRE && u < CANNON_HIT) {
          const f = seg(u, CANNON_FIRE, CANNON_HIT);
          this.cannon[lane].ballAt = this.local(lerp(side * 5.4, side * LANE_X, f), lerp(1.7, REST_Y + 0.1, f) + Math.sin(f * Math.PI) * 0.6, lerp(3, 0, f), new THREE.Vector3());
        }
        if (crossed(CANNON_HIT) && env.camDist < 220) this.puff(rest);
        if (u >= CANNON_HIT && u < 0.75) {
          const since = u - CANNON_HIT;
          this.motion[lane].at = this.local(side * LANE_X - side * 0.5 * Math.exp(-since * 14), REST_Y, 0, new THREE.Vector3());
          this.motion[lane].scaleY = 1 - 0.25 * Math.exp(-since * 20);
        }
      } else {
        const ro = me('rocket').a;
        const rk = this.rockets[lane];
        const pad = { x: side * 5.8, z: -7.1 };
        const near = { x: side * 4.4, z: -6.1 };
        let t = targets.get(ro)!;
        if (u < 0.12) t = { x: near.x, z: near.z, mode: 'walk', face: [pad.x, pad.z] };
        else if (u < 0.3) t = { x: near.x, z: near.z, mode: 'work', pose: { armL: -1.4, armR: -1.4, lean: 0.3 }, face: [pad.x, pad.z] };
        else if (u < ROCKET_LAUNCH) t = { x: near.x - side * 0.4, z: near.z, mode: 'work', style: 'glow', pose: { armL: -0.6, armR: -1.5, lean: 0.25 }, face: [pad.x, pad.z] };
        else if (u < 0.7) t = { x: near.x - side * 0.6, z: near.z + 0.3, mode: 'work', pose: p.fail ? { armL: -2.8, armR: -2.8, lean: -0.15 } : { armL: -2.7, armR: -2.7, lean: -0.1 }, face: [pad.x, pad.z] };
        targets.set(ro, t);
        // Rocket: carried to the tube, loaded, lit, launched.
        const airBurst = p.fail && Math.floor((env.elapsed * 7) % 2) === 0 ? false : p.fail;
        const explodeAtPad = p.fail && (Math.floor(this.time * 3) + lane) % 2 === 0;
        void airBurst;
        let h = -9;
        if (u >= 0.12 && u < 0.3) h = lerp(1.6, 0, ease(seg(u, 0.12, 0.3)));
        else if (u >= 0.3 && u < ROCKET_LAUNCH) h = 0;
        else if (u >= ROCKET_LAUNCH) {
          const flight = (u - ROCKET_LAUNCH) / 0.28;
          const burstAt = p.fail ? (explodeAtPad ? 0.02 : 0.45) : 1;
          h = flight >= burstAt ? -9 : flight * flight * 20 + flight * 3;
          if (crossed(ROCKET_LAUNCH)) {
            this.flash = 0.2;
            this.shake(env);
          }
          const burstH = burstAt * burstAt * 20 + burstAt * 3;
          if (p.fail && prevU !== null && prevU - ROCKET_LAUNCH < burstAt * 0.28 && flight >= burstAt) this.blast(env, this.local(pad.x, 1.6 + burstH, pad.z, new THREE.Vector3()), true);
          if (!p.fail && prevU !== null && prevU < ROCKET_LAUNCH + 0.28 && u >= ROCKET_LAUNCH + 0.28) this.blast(env, this.local(pad.x, 1.6 + 23, pad.z, new THREE.Vector3()), false);
          if (flight < burstAt && env.camDist < 220) {
            const tail = this.local(pad.x, 1.4 + h, pad.z, tmpA);
            env.fx.emit(tail, tmpB.copy(tmpUp).multiplyScalar(-4), { color: 0xffb02e, size0: 0.9, size1: 0.2, life: 0.4, alpha: 0.95, drag: 0.4 });
            env.fx.emit(tail, tmpB.copy(tmpUp).multiplyScalar(-1.5), { color: 0xcfd3da, size0: 0.8, size1: 2.4, life: 1.6, alpha: 0.5, drag: 0.7 });
          }
        }
        rk.mesh.visible = h > -5;
        if (rk.mesh.visible) {
          tmpM.makeTranslation(pad.x, 1.6 + h, pad.z);
          rk.mesh.matrix.multiplyMatrices(this.matrix, tmpM);
          rk.mesh.matrixWorldNeedsUpdate = true;
        }
        // The box on the trolley shakes while the rocket goes up.
        if (u >= ROCKET_LAUNCH && u < ROCKET_LAUNCH + 0.12) {
          this.motion[lane].at = this.local(side * LANE_X + Math.sin(this.time * 90) * 0.06, REST_Y, Math.cos(this.time * 80) * 0.05, new THREE.Vector3());
        }
      }
    }

    // Move and pose every actor.
    const g: GrainPose = { pos: tmpA, forward: tmpFwd, up: tmpUp, look: LOOKS.rice, armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, lean: 0, roll: 0 };
    for (const act of this.actors) {
      const a = act.a;
      const t = targets.get(a)!;
      const dx = t.x - a.x;
      const dz = t.z - a.z;
      const d = Math.hypot(dx, dz);
      const speed = t.mode === 'walk' || t.mode === 'idle' ? 3.6 : 4.5;
      a.walking = d > 0.06;
      if (a.walking) {
        const step = Math.min(d, speed * dt);
        a.x += (dx / d) * step;
        a.z += (dz / d) * step;
        a.yaw = Math.atan2(dx, dz);
      } else if (t.face) {
        a.yaw = Math.atan2(t.face[0] - a.x, t.face[1] - a.z);
      } else if (t.mode === 'idle') {
        a.yaw = Math.atan2(-act.side * 1, 0);
      }
      this.local(a.x, 0, a.z, tmpA);
      tmpFwd.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)).transformDirection(this.matrix);
      g.look = LOOKS[a.look];
      g.propR = g.propL = g.propBody = undefined;
      g.crate = 0;
      g.scooter = false;
      g.eyeOpen = 1;
      g.swingR = 0;
      g.bob = 0;
      g.lean = 0;
      g.roll = 0;
      if (a.walking) Object.assign(g, walkLimbs(env.elapsed * 7 + a.x, 2.2));
      else if (t.mode === 'work') Object.assign(g, { armL: 0, armR: 0, legL: 0, legR: 0, bob: Math.sin(env.elapsed * 2) * 0.01, lean: 0, roll: 0 }, t.pose);
      else Object.assign(g, workLimbs('clipboard', env.elapsed * 0.3, a.x));
      if (t.style) g.propR = t.style;
      pools.crowd.draw(g);
    }
  }

  private puff(at: THREE.Vector3): void {
    void at;
  }

  private shake(env: Env): void {
    void env;
  }

  /** A mini rocket going off: green confetti when it flies clean, a red and black blast when the test failed. */
  private blast(env: Env, at: THREE.Vector3, bad: boolean): void {
    this.flash = bad ? 0.35 : 0.2;
    const up = tmpUp.clone();
    for (let i = 0; i < (bad ? 28 : 18); i++) {
      const v = tmpB.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(2.5 + Math.random() * (bad ? 5 : 3));
      v.addScaledVector(up, 1);
      env.fx.emit(at, v, bad ? { color: i % 3 === 0 ? 0x222222 : i % 3 === 1 ? 0xff5a1a : 0xffd24a, size0: 1.1, size1: 2.6, life: 1.4, alpha: 0.9, drag: 0.5 } : { color: i % 2 ? 0x6bff95 : 0xffe06b, size0: 0.5, size1: 0.1, life: 1.2, alpha: 1, drag: 0.5 });
    }
  }
}
