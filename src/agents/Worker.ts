import * as THREE from 'three';
import { sfx } from '../ui/sfx';
import { createGrain, type GrainRig, type GrainVariant } from './grains';

export type WorkStyle = 'load' | 'polish' | 'operate' | 'throw' | 'pack' | 'clipboard';

export type Routine =
  | { kind: 'station'; spot: THREE.Vector3; face: number; style: WorkStyle }
  | { kind: 'courier'; a: THREE.Vector3; b: THREE.Vector3; crate: number }
  | { kind: 'patrol'; points: THREE.Vector3[] };

type ActionKind = 'hop' | 'flip' | 'wave' | 'stumble' | 'gasp';
interface Action {
  kind: ActionKind;
  t: number;
  dur: number;
}

const BASE_SPEED: Record<GrainVariant, number> = { rice: 1.5, corn: 1.3, wheat: 1.7, quinoa: 4.2, millet: 3, basmati: 1.4, medic: 2.6, hazmat: 2.4 };
const PITCH: Record<GrainVariant, number> = { rice: 1, corn: 0.8, wheat: 1.1, quinoa: 1.5, millet: 1.7, basmati: 0.9, medic: 1.1, hazmat: 0.85 };

const TAU = Math.PI * 2;
function angleDelta(from: number, to: number): number {
  return ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
}

/** One grain character: owns its rig and decides what to do each frame. */
export class Worker {
  readonly rig: GrainRig;
  readonly pos: THREE.Vector3;
  breakSpot = new THREE.Vector3();
  breakFace = 0;

  private speed: number;
  private scale: number;
  private yaw = 0;
  private walkPhase = Math.random() * 6;
  private phase = Math.random() * 10;

  private wantIdle = true;
  private idleActive = true;
  private delayLeft = 0;
  private rushLeft = 0;

  private carrying = false;
  private pause = Math.random() * 1.5;
  private stage = 0;
  private patrolIdx = 0;
  private blink = 2 + Math.random() * 3;
  private action: Action | null = null;

  constructor(
    readonly variant: GrainVariant,
    private routine: Routine,
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

  update(dt: number, t: number, groundAt: (x: number, z: number) => number): void {
    const rig = this.rig;
    this.tickBlink(dt);

    if (this.delayLeft > 0) {
      this.delayLeft -= dt;
      if (this.delayLeft <= 0) this.idleActive = this.wantIdle;
    }
    if (this.rushLeft > 0 && this.delayLeft <= 0) this.rushLeft -= dt;
    const rushing = this.rushLeft > 0 && this.delayLeft <= 0 && !this.idleActive;

    // Reset the pose, then layer behaviour on top.
    this.resetPose();

    let moving = false;
    let activity: WorkStyle | 'stand' | 'break' = 'stand';
    const speed = this.speed * (rushing ? 1.8 : 1);

    if (this.action) {
      this.runAction(dt, t);
    } else if (this.idleActive) {
      this.carrying = false;
      moving = !this.goTo(this.breakSpot, speed, dt);
      if (!moving) {
        this.turnTo(this.breakFace, dt);
        activity = 'break';
      }
    } else {
      const r = this.routine;
      if (r.kind === 'station') {
        moving = !this.goTo(r.spot, speed, dt);
        if (!moving) {
          this.turnTo(r.face, dt);
          activity = r.style;
        }
      } else if (r.kind === 'courier') {
        if (this.pause > 0) {
          this.pause -= dt;
        } else if (this.goTo(this.stage === 0 ? r.a : r.b, speed, dt)) {
          this.carrying = this.stage === 0;
          this.stage ^= 1;
          this.pause = 0.45;
        } else {
          moving = true;
        }
      } else {
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

    if (!this.action) {
      if (moving) this.walkPose(dt, speed, rushing);
      else this.restPose(activity, t);
    }

    rig.carry.visible = this.carrying && !(this.action?.kind === 'stumble' && this.stumbling());
    this.pos.y += (groundAt(this.pos.x, this.pos.z) - this.pos.y) * (1 - Math.exp(-dt * 14));
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
    r.pivot.position.y += Math.abs(s) * 0.07;
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

  private restPose(activity: WorkStyle | 'stand' | 'break', t: number): void {
    const r = this.rig;
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
      case 'break': {
        r.pivot.rotation.z = Math.sin(ph * 1.2) * 0.05;
        r.armL.rotation.x = Math.sin(ph * 0.8) * 0.1;
        // Occasional sip.
        const sip = (ph % 7) / 7;
        r.armR.rotation.x = sip < 0.17 ? -2.2 * Math.sin((sip / 0.17) * Math.PI) : 0;
        break;
      }
      default:
        r.armL.rotation.x = Math.sin(ph * 1.5) * 0.06;
        r.armR.rotation.x = -Math.sin(ph * 1.5) * 0.06;
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
    const closed = this.blink < 0.12 && this.blink > 0 ? 0.1 : this.action?.kind === 'gasp' ? 1.5 : 1;
    for (const e of this.rig.eyes) e.scale.y = closed;
    if (this.blink <= 0) this.blink = 2 + Math.random() * 4;
  }
}
