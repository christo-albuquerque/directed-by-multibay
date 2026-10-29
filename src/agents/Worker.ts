import * as THREE from 'three';
import type { BreakRole, Seat } from '../scene/Courtyard';
import type { Particles } from '../scene/Particles';
import { sfx } from '../ui/sfx';
import { createGrain, type GrainRig, type GrainVariant } from './grains';

export type WorkStyle = 'load' | 'polish' | 'operate' | 'throw' | 'pack' | 'clipboard';
export type ResponseRole = 'treat' | 'spray' | 'sweep';
type Activity = WorkStyle | BreakRole | ResponseRole | 'stand';

export type Routine =
  | { kind: 'station'; spot: THREE.Vector3; face: number; style: WorkStyle }
  | { kind: 'courier'; a: THREE.Vector3; b: THREE.Vector3; crate: number }
  | { kind: 'patrol'; points: THREE.Vector3[] }
  | { kind: 'response'; role: ResponseRole; home: THREE.Vector3; offset: THREE.Vector2 };

export interface WorkerContext {
  ground: (x: number, z: number) => number;
  fx: Particles;
  /** Where the current failure is, or null. */
  incident: THREE.Vector3 | null;
  /** 0..1: how busy the factory is. Quiet factories only half-staff their stations. */
  activity: number;
}

type ActionKind = 'hop' | 'flip' | 'wave' | 'stumble' | 'gasp';
interface Action {
  kind: ActionKind;
  t: number;
  dur: number;
}

const BASE_SPEED: Record<GrainVariant, number> = { rice: 1.5, corn: 1.3, wheat: 1.7, quinoa: 4.2, millet: 3, basmati: 1.4, medic: 2.8, hazmat: 2.6 };
const PITCH: Record<GrainVariant, number> = { rice: 1, corn: 0.8, wheat: 1.1, quinoa: 1.5, millet: 1.7, basmati: 0.9, medic: 1.1, hazmat: 0.85 };

const TAU = Math.PI * 2;
function angleDelta(from: number, to: number): number {
  return ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
}

/** Half-width of the conveyor that workers hop across, and how high they jump. */
const BELT_HALF = 0.9;
const HOP_HEIGHT = 0.85;

/** One grain character: owns its rig and decides what to do each frame. */
export class Worker {
  readonly rig: GrainRig;
  readonly pos: THREE.Vector3;
  seat: Seat | null = null;

  private speed: number;
  private scale: number;
  private yaw = 0;
  private walkPhase = Math.random() * 6;
  private phase = Math.random() * 10;
  private hop = 0;
  private activity: Activity = 'stand';
  /** Fixed per worker: those with a low rank get busy first as activity rises. */
  private rank = Math.random();

  private wantIdle = true;
  private idleActive = true;
  private delayLeft = 0;
  private rushLeft = 0;
  private sprayLeft = 0;

  private carrying = false;
  private pause = Math.random() * 1.5;
  private stage = 0;
  private patrolIdx = 0;
  private blink = 2 + Math.random() * 3;
  private action: Action | null = null;
  private hand = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private foamAcc = 0;

  constructor(
    readonly variant: GrainVariant,
    readonly routine: Routine,
  ) {
    this.rig = createGrain(variant);
    this.pos = this.rig.root.position;
    this.speed = BASE_SPEED[variant] * (0.9 + Math.random() * 0.2);
    this.scale = 0.92 + Math.random() * 0.16;
    this.rig.root.scale.setScalar(this.scale);
    this.rig.root.userData.worker = this;
    this.rig.crateMat.color.setHex(routine.kind === 'courier' ? routine.crate : 0xc89b5f);
  }

  /** Called by the crowd when the factory flips between idle and active. */
  setIdle(idle: boolean, alarm: boolean): void {
    this.wantIdle = idle;
    this.delayLeft = Math.random() * (idle ? 2.5 : 0.9);
    if (!idle && alarm) this.rushLeft = 3.5 + this.delayLeft;
  }

  placeAt(p: THREE.Vector3, yaw: number): void {
    this.pos.copy(p);
    this.yaw = yaw;
    this.rig.root.rotation.y = yaw;
  }

  poke(): void {
    if (this.action) return;
    sfx.squeak(PITCH[this.variant]);
    if (this.carrying) {
      this.action = { kind: 'stumble', t: 0, dur: 1.7 };
      return;
    }
    const pick = Math.random();
    this.action = pick < 0.34 ? { kind: 'hop', t: 0, dur: 0.6 } : pick < 0.67 ? { kind: 'flip', t: 0, dur: 0.85 } : { kind: 'wave', t: 0, dur: 1.9 };
  }

  react(kind: 'gasp'): void {
    if (!this.action) this.action = { kind, t: 0, dur: 1.4 };
  }

  /** Grab the extinguisher and spray the incident for a while. */
  spray(seconds: number): void {
    this.sprayLeft = seconds;
  }

  update(dt: number, t: number, ctx: WorkerContext): void {
    const rig = this.rig;
    if (this.delayLeft > 0) {
      this.delayLeft -= dt;
      if (this.delayLeft <= 0) this.idleActive = this.wantIdle;
    }
    if (this.rushLeft > 0 && this.delayLeft <= 0) this.rushLeft -= dt;
    if (this.sprayLeft > 0) this.sprayLeft -= dt;
    const rushing = this.rushLeft > 0 && this.delayLeft <= 0 && !this.idleActive;

    this.resetPose();

    let moving = false;
    let activity: Activity = 'stand';
    let speed = this.speed * (rushing ? 2.4 : 1);
    let seated = false;

    if (this.action) {
      this.runAction(dt, t);
    } else if (this.routine.kind === 'response') {
      const r = this.routine;
      const target = ctx.incident ? this.aim.set(ctx.incident.x + r.offset.x, 0, ctx.incident.z + r.offset.y) : r.home;
      speed = this.speed * (ctx.incident ? 1.5 : 1);
      moving = !this.goTo(target, speed, dt);
      if (!moving) {
        if (ctx.incident) {
          this.turnTo(Math.atan2(ctx.incident.x - this.pos.x, ctx.incident.z - this.pos.z), dt);
          activity = r.role;
        } else {
          this.turnTo(Math.PI / 4, dt);
        }
      }
    } else if (this.idleActive) {
      this.carrying = false;
      const seat = this.seat;
      if (seat) {
        moving = !this.goTo(seat.pos, speed, dt);
        if (!moving) {
          this.turnTo(seat.face, dt);
          activity = seat.kind;
          seated = true;
        }
      }
    } else if (this.sprayLeft > 0 && ctx.incident) {
      // Testers grab extinguishers and fight the fire from where they stand.
      this.turnTo(Math.atan2(ctx.incident.x - this.pos.x, ctx.incident.z - this.pos.z), dt, 10);
      activity = 'spray';
    } else {
      const r = this.routine;
      if (r.kind === 'station') {
        moving = !this.goTo(r.spot, speed, dt);
        if (!moving) {
          this.turnTo(r.face, dt);
          // Quiet factory: only some of the crew are hard at work; the rest wait by their station.
          activity = this.rank < 0.35 + 0.65 * ctx.activity ? r.style : 'stand';
        }
      } else if (r.kind === 'courier') {
        if (this.pause > 0 || this.rank > 0.25 + 0.75 * ctx.activity) {
          this.pause -= dt;
        } else if (this.goTo(this.stage === 0 ? r.a : r.b, speed, dt)) {
          this.carrying = this.stage === 0;
          this.stage ^= 1;
          this.pause = 0.45;
        } else {
          moving = true;
        }
      } else if (r.kind === 'patrol') {
        if (this.pause > 0) {
          this.pause -= dt;
          activity = 'clipboard';
        } else if (this.goTo(r.points[this.patrolIdx], speed, dt)) {
          this.patrolIdx = (this.patrolIdx + 1) % r.points.length;
          this.pause = 2 + Math.random() * 3;
        } else {
          moving = true;
        }
      }
    }

    this.activity = activity;
    this.hop = moving ? HOP_HEIGHT * Math.cos(Math.min(1, Math.abs(this.pos.z) / BELT_HALF) * (Math.PI / 2)) : 0;
    if (Math.abs(this.pos.z) >= BELT_HALF) this.hop = 0;

    this.hideProps();
    if (!this.action) {
      if (moving) this.walkPose(dt, speed, rushing);
      else this.restPose(activity, t);
    }
    if (activity === 'spray' && !this.action) this.foam(dt, ctx);
    this.tickBlink(dt);

    rig.carry.visible = this.carrying && !(this.action?.kind === 'stumble' && this.stumbling());

    // Vertical placement: floor, stool, hammock, plus the belt hop.
    let y = ctx.ground(this.pos.x, this.pos.z);
    if (seated && this.seat) {
      if (this.seat.kind === 'ramen') y = this.seat.surfaceY - rig.hipY * this.scale + 0.02;
      else if (this.seat.kind === 'nap') y = this.seat.surfaceY + 0.25 - (rig.height / 2) * this.scale;
      else y = this.seat.surfaceY;
    }
    this.pos.y += (y - this.pos.y) * (1 - Math.exp(-dt * 12));
    rig.root.rotation.y = this.yaw;
  }

  // --- movement -------------------------------------------------------------

  private goTo(target: THREE.Vector3, speed: number, dt: number): boolean {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.04) return true;
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.turnTo(Math.atan2(dx, dz), dt, 14);
    return false;
  }

  private turnTo(yaw: number, dt: number, rate = 8): void {
    this.yaw += angleDelta(this.yaw, yaw) * (1 - Math.exp(-dt * rate));
  }

  // --- poses ----------------------------------------------------------------

  private resetPose(): void {
    const r = this.rig;
    r.armL.rotation.set(0, 0, 0);
    r.armR.rotation.set(0, 0, 0);
    r.legL.rotation.set(0, 0, 0);
    r.legR.rotation.set(0, 0, 0);
    r.pivot.rotation.set(0, 0, 0);
    r.pivot.position.y = r.height / 2;
    r.pivot.scale.set(1, 1, 1);
  }

  private hideProps(): void {
    const p = this.rig.props;
    const a = this.activity;
    p.chopsticks.visible = a === 'ramen';
    p.cup.visible = a === 'coffee';
    p.paper.visible = a === 'news';
    p.bubble.visible = a === 'gum';
    p.zzz.visible = a === 'nap';
    p.extinguisher.visible = a === 'spray';
  }

  private walkPose(dt: number, speed: number, rushing: boolean): void {
    const r = this.rig;
    this.walkPhase += dt * speed * (r.hasScooter ? 0 : 5.5);
    const s = Math.sin(this.walkPhase);
    if (r.hasScooter) {
      for (const w of r.wheels) w.rotation.x -= dt * speed * 9;
      r.armL.rotation.x = r.armR.rotation.x = -1.15;
      r.pivot.rotation.x = 0.1;
      return;
    }
    r.legL.rotation.x = s * 0.8;
    r.legR.rotation.x = -s * 0.8;
    r.pivot.position.y += Math.abs(s) * 0.07 + this.hop;
    if (this.hop > 0.05) {
      r.legL.rotation.x = -0.6;
      r.legR.rotation.x = 0.4;
    }
    if (this.carrying) {
      r.armL.rotation.set(-2.7, 0, 0.25);
      r.armR.rotation.set(-2.7, 0, -0.25);
    } else if (rushing) {
      r.armL.rotation.set(-2.4 + Math.sin(this.walkPhase * 2) * 0.5, 0, 0.4);
      r.armR.rotation.set(-2.4 - Math.sin(this.walkPhase * 2) * 0.5, 0, -0.4);
    } else {
      r.armL.rotation.x = -s * 0.7;
      r.armR.rotation.x = s * 0.7;
    }
  }

  private restPose(activity: Activity, t: number): void {
    const r = this.rig;
    const p = r.props;
    const ph = t + this.phase;
    r.pivot.position.y += Math.sin(ph * 2) * 0.008;
    switch (activity) {
      case 'load':
        r.pivot.rotation.x = 0.28 * Math.sin(ph * 2.2);
        r.armL.rotation.x = r.armR.rotation.x = -1.3 + Math.sin(ph * 2.2) * 0.9;
        break;
      case 'polish':
        r.armR.rotation.set(-1.5, 0, Math.sin(ph * 7) * 0.5);
        r.armL.rotation.x = -0.4;
        break;
      case 'operate':
        r.pivot.rotation.x = 0.12;
        r.armL.rotation.x = -1.0 + Math.sin(ph * 5) * 0.6;
        r.armR.rotation.x = -1.0 - Math.sin(ph * 5) * 0.6;
        break;
      case 'throw': {
        const u = (ph % 1.7) / 1.7;
        // Wind up, whip forward over the head, recover.
        const arm = u < 0.5 ? 0.9 * (u / 0.5) : u < 0.62 ? 0.9 + (-2.6 - 0.9) * ((u - 0.5) / 0.12) : -2.6 * (1 - (u - 0.62) / 0.38);
        r.armR.rotation.x = arm;
        r.armL.rotation.x = -0.3 - arm * 0.2;
        r.pivot.rotation.y = arm > 0 ? -0.3 * (arm / 0.9) : 0;
        break;
      }
      case 'pack':
        r.armL.rotation.x = -0.9 + Math.sin(ph * 3) * 0.5;
        r.armR.rotation.x = -0.9 - Math.sin(ph * 3) * 0.5;
        r.pivot.rotation.x = 0.1;
        break;
      case 'clipboard':
        r.armR.rotation.x = -0.9;
        r.armL.rotation.x = -0.15;
        r.pivot.rotation.x = 0.05 + Math.sin(ph * 1.3) * 0.04;
        break;
      case 'ramen': {
        // Sitting: legs forward; chopsticks go bowl -> mouth, with a happy bob.
        r.legL.rotation.x = r.legR.rotation.x = -1.5;
        const u = (ph * 0.6) % 1;
        const lift = u < 0.45 ? 0 : Math.sin(((u - 0.45) / 0.55) * Math.PI);
        r.armR.rotation.x = -0.9 - lift * 1.1;
        r.armL.rotation.x = -0.8;
        r.pivot.rotation.x = 0.1 + lift * 0.12;
        break;
      }
      case 'coffee': {
        const u = (ph % 5) / 5;
        const sip = u > 0.65 && u < 0.85 ? Math.sin(((u - 0.65) / 0.2) * Math.PI) : 0;
        r.armL.rotation.x = -0.7 - sip * 1.3;
        r.armR.rotation.x = Math.sin(ph) * 0.08;
        r.pivot.rotation.x = -sip * 0.12;
        break;
      }
      case 'news': {
        r.armL.rotation.set(-1.3, 0, 0.12);
        r.armR.rotation.set(-1.3, 0, -0.12);
        r.pivot.rotation.x = Math.sin(ph * 0.9) * 0.05;
        p.paper.rotation.z = Math.sin(ph * 1.1) * 0.05 + ((ph % 6) > 5.6 ? Math.sin(ph * 40) * 0.12 : 0);
        break;
      }
      case 'gum': {
        const s = (ph % 4) / 4;
        const grow = s < 0.6 ? s / 0.6 : 0;
        p.bubble.scale.setScalar(Math.max(0.01, 0.2 + grow * 1.6));
        p.bubble.visible = s < 0.6 || s > 0.64;
        r.armL.rotation.x = Math.sin(ph * 1.2) * 0.1;
        r.armR.rotation.x = -Math.sin(ph * 1.2) * 0.1;
        r.pivot.rotation.z = Math.sin(ph * 0.8) * 0.04;
        break;
      }
      case 'nap': {
        r.pivot.rotation.z = Math.PI / 2;
        r.pivot.scale.setScalar(1 + Math.sin(ph * 1.6) * 0.012);
        r.armL.rotation.set(0.2, 0, 0.15);
        r.armR.rotation.set(0.2, 0, -0.15);
        // Zzz float upwards (local +x is world up while lying).
        const f = (ph % 2.4) / 2.4;
        p.zzz.position.set(0.55 + f * 0.7, r.height * 0.75, 0.1);
        p.zzz.scale.setScalar(0.2 + f * 0.18);
        (p.zzz.material as THREE.SpriteMaterial).opacity = 1 - f;
        break;
      }
      case 'treat':
        r.pivot.rotation.x = 0.3;
        r.armL.rotation.x = -1.1 + Math.sin(ph * 5) * 0.5;
        r.armR.rotation.x = -1.1 - Math.sin(ph * 5) * 0.5;
        break;
      case 'spray':
        r.pivot.rotation.x = 0.06;
        r.armR.rotation.x = -1.45;
        r.armL.rotation.x = -0.6;
        break;
      case 'sweep':
        r.pivot.rotation.x = 0.2;
        r.pivot.rotation.y = Math.sin(ph * 3) * 0.5;
        r.armL.rotation.x = r.armR.rotation.x = -0.9;
        break;
      default:
        r.armL.rotation.x = Math.sin(ph * 1.5) * 0.06;
        r.armR.rotation.x = -Math.sin(ph * 1.5) * 0.06;
    }
  }

  /** White foam from the extinguisher toward the incident. */
  private foam(dt: number, ctx: WorkerContext): void {
    if (!ctx.incident) return;
    const rig = this.rig;
    rig.armR.localToWorld(this.hand.set(0, -rig.armLen, 0.3));
    this.foamAcc += dt * 55;
    while (this.foamAcc >= 1) {
      this.foamAcc -= 1;
      this.aim.set(ctx.incident.x - this.hand.x, ctx.incident.y + 1.0 - this.hand.y, ctx.incident.z - this.hand.z).normalize().multiplyScalar(4.2);
      this.aim.x += (Math.random() - 0.5) * 0.8;
      this.aim.y += (Math.random() - 0.3) * 0.8;
      this.aim.z += (Math.random() - 0.5) * 0.8;
      ctx.fx.emit(this.hand, this.aim, { color: 0xffffff, size0: 0.12, size1: 0.55, life: 0.55, alpha: 0.85, drag: 0.3 });
    }
  }

  // --- one-shot actions -----------------------------------------------------

  private stumbling(): boolean {
    const a = this.action;
    return !!a && a.kind === 'stumble' && a.t / a.dur > 0.1 && a.t / a.dur < 0.78;
  }

  private runAction(dt: number, t: number): void {
    const a = this.action!;
    const r = this.rig;
    a.t += dt;
    const u = Math.min(a.t / a.dur, 1);
    switch (a.kind) {
      case 'hop':
        r.pivot.position.y += Math.sin(u * Math.PI) * 0.8;
        r.armL.rotation.set(-2.8, 0, 0.3);
        r.armR.rotation.set(-2.8, 0, -0.3);
        break;
      case 'flip':
        r.pivot.position.y += Math.sin(u * Math.PI) * 1.0;
        r.pivot.rotation.x = -u * TAU;
        r.armL.rotation.set(-1.6, 0, 0.5);
        r.armR.rotation.set(-1.6, 0, -0.5);
        break;
      case 'wave':
        this.turnTo(Math.PI / 4, dt, 10);
        r.armR.rotation.set(-2.7, 0, Math.sin(t * 13) * 0.45);
        break;
      case 'stumble': {
        r.pivot.rotation.z = Math.sin(u * Math.PI * 5) * 0.4 * (1 - u);
        r.armL.rotation.set(-2.2 + Math.sin(u * 20) * 0.6, 0, 0.5);
        r.armR.rotation.set(-2.2 - Math.sin(u * 20) * 0.6, 0, -0.5);
        r.dropped.visible = this.stumbling();
        break;
      }
      case 'gasp':
        r.pivot.position.y += Math.abs(Math.sin(u * Math.PI * 3)) * 0.15;
        r.armL.rotation.set(-2.7, 0, 0.5);
        r.armR.rotation.set(-2.7, 0, -0.5);
        break;
    }
    if (u >= 1) {
      r.dropped.visible = false;
      this.action = null;
    }
  }

  private tickBlink(dt: number): void {
    this.blink -= dt;
    const asleep = this.activity === 'nap';
    const closed = asleep || (this.blink < 0.12 && this.blink > 0) ? 0.1 : this.action?.kind === 'gasp' ? 1.5 : 1;
    for (const e of this.rig.eyes) e.scale.y = closed;
    if (this.blink <= 0) this.blink = 2 + Math.random() * 4;
  }
}
