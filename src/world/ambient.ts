import * as THREE from 'three';
import type { SurfacePath } from '../globe/path';
import { LOOKS, styleProps, walkLimbs, workLimbs, type GrainPose, type LookName, type WorkStyle } from './crowd';
import { actionPose, pokeAction, type Action } from './folk';
import type { Env, Pools } from './types';

export interface WalkSpec {
  path: SurfacePath;
  /** Start distance along the path. */
  s: number;
  speed: number;
  look: LookName;
  /** Distances where this grain likes to stop (stalls, machines). Without any it stops now and then at random. */
  stops?: number[];
  dir?: 1 | -1;
  /** Carries a box on its head while walking. */
  carry?: boolean;
  /** Rides a scooter. */
  courier?: boolean;
  /** What it does when it stops. */
  chores?: WorkStyle[];
}

interface Walk extends WalkSpec {
  id: number;
  dir: 1 | -1;
  phase: number;
  pause: number;
  style: WorkStyle;
  turn: number;
  next: number;
  idleIn: number;
  action: Action | null;
  blink: number;
  weave: number;
}

const DEFAULT_CHORES: WorkStyle[] = ['inspect', 'clipboard', 'coffee', 'news', 'gum', 'wave', 'sip'];
const sample = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };
const side = new THREE.Vector3();
const fwd = new THREE.Vector3();
const pos = new THREE.Vector3();

/**
 * Grains that live on a path (a farm track, a pit rim, a market lane) and are not tied to a station: they weave
 * gently from side to side, stop for chores, haul boxes, ride scooters, and react when clicked.
 */
export class Ambient {
  private agents: Walk[] = [];
  private nextId = 0;

  add(s: WalkSpec): void {
    this.agents.push({
      ...s,
      id: this.nextId++,
      dir: s.dir ?? 1,
      phase: Math.random() * 10,
      pause: 0,
      style: 'clipboard',
      turn: 0,
      next: 0,
      idleIn: 6 + Math.random() * 14,
      action: null,
      blink: 2 + Math.random() * 3,
      weave: Math.random() * 6,
    });
  }

  pickables(): { id: number; pos: THREE.Vector3 }[] {
    return this.agents.map((a) => {
      a.path.at(a.s, sample);
      return { id: a.id, pos: sample.pos.clone().addScaledVector(sample.up, 0.7) };
    });
  }

  poke(id: number): void {
    const a = this.agents.find((x) => x.id === id);
    if (!a || a.action) return;
    a.action = pokeAction(a.look, !!a.carry);
  }

  draw(env: Env, pools: Pools): void {
    const t = env.elapsed;
    const dt = env.dt;
    const g: GrainPose = { pos, forward: fwd, up: sample.up, look: LOOKS.rice, armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, lean: 0, roll: 0 };
    for (const a of this.agents) {
      a.blink -= dt;
      if (a.blink <= -0.14) a.blink = 2 + Math.random() * 4;
      if (a.action) {
        a.action.t += dt;
        if (a.action.t >= a.action.dur) a.action = null;
      } else if (a.pause > 0) {
        a.pause -= dt;
      } else {
        a.s = (a.s + a.dir * a.speed * dt + a.path.length) % a.path.length;
        a.idleIn -= dt;
        // Stop where it likes to stop, or now and then wherever it happens to be.
        const stop = a.stops?.[a.next];
        if (stop !== undefined && Math.abs(a.s - stop) < 0.45) {
          a.pause = 3 + Math.random() * 5;
          a.next = (a.next + 1) % a.stops!.length;
          this.chore(a);
        } else if (!a.stops?.length && a.idleIn <= 0) {
          a.idleIn = 10 + Math.random() * 20;
          a.pause = 3 + Math.random() * 6;
          this.chore(a);
        }
      }
      a.path.at(a.s, sample);
      side.crossVectors(sample.up, sample.tangent).normalize();
      const moving = a.pause <= 0 && !a.action;
      // A slow side-to-side weave stops anyone walking a ruler-straight line.
      const lateral = Math.sin(t * 0.7 + a.weave) * 0.5 * (moving ? 1 : 0.2);
      pos.copy(sample.pos).addScaledVector(side, lateral);
      fwd.copy(sample.tangent).multiplyScalar(a.dir);
      fwd.applyAxisAngle(sample.up, Math.cos(t * 0.7 + a.weave) * 0.12 + (moving ? 0 : a.turn));
      g.look = LOOKS[a.look];
      g.propR = g.propL = g.propBody = undefined;
      g.crate = 0;
      g.scooter = false;
      g.swingR = 0;
      g.bubble = 0.2;
      g.eyeOpen = a.blink < 0 && a.blink > -0.12 ? 0.1 : 1;
      let limbs;
      if (a.action) {
        limbs = actionPose(a.action, g, t);
      } else if (a.pause > 0) {
        limbs = workLimbs(a.style, t, a.phase);
        Object.assign(g, styleProps(a.style));
        if (a.style === 'gum') g.bubble = 0.2 + (((t + a.phase) % 4) / 4 < 0.6 ? ((t + a.phase) % 4) / 4 / 0.6 : 0) * 1.6;
      } else {
        limbs = walkLimbs(t * a.speed * 3.2 + a.phase, a.speed, !!a.carry);
        if (a.carry) {
          g.crate = 1;
          g.crateColor = 0xc89b5f;
        }
        if (a.courier) {
          g.scooter = true;
          limbs = { ...limbs, armL: -1.15, armR: -1.15, legL: 0, legR: 0, bob: 0, lean: 0.1 };
        }
      }
      Object.assign(g, limbs);
      pools.crowd.draw(g);
    }
  }

  private chore(a: Walk): void {
    const list = a.chores ?? DEFAULT_CHORES;
    a.style = list[Math.floor(Math.random() * list.length)];
    // Turn a little toward whatever it is looking at.
    a.turn = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8);
  }
}
