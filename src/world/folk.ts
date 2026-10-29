import * as THREE from 'three';
import type { Chart } from '../globe/surface';
import { sfx } from '../ui/sfx';
import { LOOKS, styleProps, walkLimbs, workLimbs, type GrainPose, type LookName, type WorkStyle } from './crowd';
import type { Env, Pools } from './types';

export interface Pt {
  x: number;
  z: number;
}

/** A place a grain can go and something to do there. */
export interface Poi extends Pt {
  face: number;
  style: WorkStyle;
  /** Seconds spent here (min, max). */
  dur: [number, number];
  /** Extra height of whatever they sit or lie on. */
  lift?: number;
  kind: 'post' | 'rest' | 'maint' | 'haul';
  /** Pick-up and drop-off of a box: this POI is a stock pile. */
  pile?: boolean;
  /** Seat bookkeeping for rest spots. */
  taken?: boolean;
}

/** A small walkway graph: grains stick to it between places, so they walk round machines instead of through them. */
export class Net {
  private nodes: Pt[] = [];
  private edges: number[][] = [];

  node(x: number, z: number): number {
    this.nodes.push({ x, z });
    this.edges.push([]);
    return this.nodes.length - 1;
  }

  link(a: number, b: number): void {
    this.edges[a].push(b);
    this.edges[b].push(a);
  }

  private nearest(p: Pt): number {
    let best = 0;
    let bd = Infinity;
    this.nodes.forEach((n, i) => {
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** Waypoints from a to b along the graph (Dijkstra; the graph is tiny). */
  route(a: Pt, b: Pt): Pt[] {
    const s = this.nearest(a);
    const e = this.nearest(b);
    const dist = this.nodes.map(() => Infinity);
    const prev = this.nodes.map(() => -1);
    const open = new Set(this.nodes.map((_, i) => i));
    dist[s] = 0;
    while (open.size) {
      let u = -1;
      for (const i of open) if (u < 0 || dist[i] < dist[u]) u = i;
      open.delete(u);
      if (u === e || dist[u] === Infinity) break;
      for (const v of this.edges[u]) {
        const d = dist[u] + Math.hypot(this.nodes[u].x - this.nodes[v].x, this.nodes[u].z - this.nodes[v].z);
        if (d < dist[v]) {
          dist[v] = d;
          prev[v] = u;
        }
      }
    }
    const out: Pt[] = [];
    for (let i = e; i >= 0; i = prev[i]) out.unshift(this.nodes[i]);
    // Skip the first node when it lies behind us (we are already past it toward the next one).
    if (out.length > 1) {
      const [n0, n1] = out;
      if ((n1.x - n0.x) * (a.x - n0.x) + (n1.z - n0.z) * (a.z - n0.z) > 0) out.shift();
    }
    out.push(b);
    return out;
  }
}

type ActionKind = 'hop' | 'flip' | 'wave' | 'stumble' | 'gasp';
interface Action {
  kind: ActionKind;
  t: number;
  dur: number;
}

const PITCH: Record<string, number> = { rice: 1, corn: 0.8, wheat: 1.1, quinoa: 1.5, millet: 1.7, basmati: 0.9, medic: 1.1, hazmat: 0.85, punk: 1.2, neon: 1.3 };
const SPEED: Record<string, number> = { rice: 1.5, corn: 1.3, wheat: 1.7, quinoa: 3.6, millet: 3, basmati: 1.4, medic: 2.8, hazmat: 2.6, punk: 1.6, neon: 1.6 };
const TAU = Math.PI * 2;
const angleDelta = (from: number, to: number): number => ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;

export interface AgentSpec {
  look: LookName;
  post: Poi;
  /** Where this grain may wander off to when its post is quiet. */
  errands: Poi[];
  /** Testers react first to a failure. */
  tester?: boolean;
  /** Couriers ride a scooter along their haul routes. */
  courier?: boolean;
  /** Share of idle time spent on breaks rather than chores (0..1). */
  lazy?: number;
}

interface Agent extends AgentSpec {
  id: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  phase: number;
  rank: number;
  mode: 'work' | 'walk' | 'do' | 'wait';
  poi: Poi;
  /** Where the grain is walking to after the current walk (a POI) */
  goal: Poi;
  way: Pt[];
  timer: number;
  carry: boolean;
  /** A box that is being taken from one pile to another. */
  haulTo: Poi | null;
  action: Action | null;
  blink: number;
  rush: number;
  spray: number;
  walkPhase: number;
  jitter: number;
}

export interface FolkEnv {
  /** 0..1 how busy this place is. */
  activity: number;
  /** World position of the current failure, or null. */
  incident: THREE.Vector3 | null;
  /** Which station index is broken (for gasping testers), or -1. */
  incidentStation: number;
}

const tmpM = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpFwd = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpAim = new THREE.Vector3();

/**
 * The living crowd of one district. Every grain has a post, some chores and a habit of wandering off: they walk
 * curved paths along the walkway graph, haul boxes between piles, repair and sweep, queue for ramen, and run
 * back to their stations when the alarm sounds. Click one and it reacts.
 */
export class Folk {
  private agents: Agent[] = [];
  private nextId = 0;
  private hopZones: { x0: number; x1: number; z: number }[] = [];
  private alarmLeft = 0;
  private cheerLeft = 0;
  private lastActivity = 0;
  readonly key: string;

  constructor(
    private chart: Chart,
    private ground: number,
    private net: Net,
    key: string,
  ) {
    this.key = key;
  }

  /** Belts the grains hop across: rows at constant z over an x range. */
  addBelt(x0: number, x1: number, z: number): void {
    this.hopZones.push({ x0, x1, z });
  }

  add(spec: AgentSpec): void {
    const poi = spec.post;
    this.agents.push({
      ...spec,
      id: this.nextId++,
      x: poi.x,
      z: poi.z,
      yaw: poi.face,
      speed: SPEED[spec.look] * (0.9 + Math.random() * 0.25),
      phase: Math.random() * 10,
      rank: Math.random(),
      mode: 'work',
      poi,
      goal: poi,
      way: [],
      timer: Math.random() * 6,
      carry: false,
      haulTo: null,
      action: null,
      blink: 2 + Math.random() * 3,
      rush: 0,
      spray: 0,
      walkPhase: Math.random() * 6,
      jitter: Math.random() * 6,
    });
  }

  get size(): number {
    return this.agents.length;
  }

  /** A new commit arrived: everyone off duty sprints back to their post. */
  alarm(seconds = 5): void {
    this.alarmLeft = seconds;
    for (const a of this.agents) {
      if (a.mode === 'do' || a.mode === 'walk') {
        a.rush = seconds;
        this.send(a, a.post);
        a.carry = false;
        a.haulTo = null;
      }
    }
  }

  /** Everyone nearby cheers (a rocket just left). */
  cheer(seconds = 7): void {
    this.cheerLeft = seconds;
  }

  poke(id: number): void {
    const a = this.agents.find((x) => x.id === id);
    if (!a || a.action) return;
    sfx.squeak(PITCH[a.look] ?? 1);
    if (a.carry) {
      a.action = { kind: 'stumble', t: 0, dur: 1.7 };
      return;
    }
    const p = Math.random();
    a.action = p < 0.34 ? { kind: 'hop', t: 0, dur: 0.6 } : p < 0.67 ? { kind: 'flip', t: 0, dur: 0.85 } : { kind: 'wave', t: 0, dur: 1.9 };
  }

  /** Screen picking: grains near the pointer. */
  pickables(): { id: number; pos: THREE.Vector3 }[] {
    return this.agents.map((a) => ({ id: a.id, pos: this.chart.point(a.x, a.z, this.ground + 0.7) }));
  }

  private send(a: Agent, poi: Poi): void {
    a.goal = poi;
    a.way = this.net.route({ x: a.x, z: a.z }, poi);
    a.mode = 'walk';
  }

  private pickErrand(a: Agent, act: number): Poi | null {
    if (!a.errands.length) return null;
    // Quiet stations send people on chores and breaks; busy ones keep them at their posts.
    const free = a.errands.filter((p) => !(p.kind === 'rest' && p.taken));
    if (!free.length) return null;
    const wantRest = Math.random() < (a.lazy ?? 0.4) * (1.2 - act);
    const pool = free.filter((p) => (wantRest ? p.kind === 'rest' : p.kind !== 'rest'));
    const list = pool.length ? pool : free;
    return list[Math.floor(Math.random() * list.length)];
  }

  update(env: Env, fe: FolkEnv): void {
    const dt = env.dt;
    const act = fe.activity;
    // Rising activity (a new run) sounds the alarm.
    if (act > 0.5 && this.lastActivity <= 0.5) this.alarm(5);
    this.lastActivity = act;
    if (this.alarmLeft > 0) this.alarmLeft -= dt;
    if (this.cheerLeft > 0) this.cheerLeft -= dt;
    for (const a of this.agents) {
      if (a.rush > 0) a.rush -= dt;
      if (a.spray > 0) a.spray -= dt;
      a.blink -= dt;
      if (a.blink <= -0.14) a.blink = 2 + Math.random() * 4;

      // A failure: testers gasp, then fight the fire.
      if (fe.incident && a.tester && a.spray <= 0 && !a.action && a.mode === 'work' && a.rank < 0.7) {
        a.action = { kind: 'gasp', t: 0, dur: 1.4 };
        a.spray = 9 + Math.random() * 3;
      }

      if (a.action) {
        a.action.t += dt;
        if (a.action.t >= a.action.dur) a.action = null;
        continue;
      }

      switch (a.mode) {
        case 'work': {
          a.timer -= dt;
          // Drift gently toward the post's face direction.
          a.yaw += angleDelta(a.yaw, a.poi.face) * (1 - Math.exp(-dt * 6));
          if (a.timer <= 0 && !fe.incident && this.cheerLeft <= 0) {
            const e = this.pickErrand(a, act);
            // Busy lines keep most people on their posts.
            const regular = a.post.lift !== undefined;
            if (e && Math.random() < (regular ? 0.07 : a.courier ? 0.95 : 0.42 - act * 0.3)) {
              this.send(a, e);
              if (e.pile) a.haulTo = this.otherPile(a, e);
            }
            a.timer = a.courier ? 1 : 8 + Math.random() * 14;
          }
          break;
        }
        case 'walk': {
          const speed = a.speed * (a.rush > 0 ? 2.2 : 1) * (a.courier ? 1.4 : 1);
          const next = a.way[0];
          if (!next) {
            this.arrive(a);
            break;
          }
          const dx = next.x - a.x;
          const dz = next.z - a.z;
          const d = Math.hypot(dx, dz);
          const last = a.way.length === 1;
          if (d < (last ? 0.12 : 0.9)) {
            a.way.shift();
            break;
          }
          // Steer toward the waypoint with a lazy sideways weave so no one marches in a ruler-straight line.
          const wobble = Math.sin(env.elapsed * 0.9 + a.jitter) * Math.min(0.55, d * 0.08);
          const want = Math.atan2(dx, dz) + wobble;
          const turn = angleDelta(a.yaw, want);
          a.yaw += Math.sign(turn) * Math.min(Math.abs(turn), dt * 4.2);
          const step = Math.min(d, speed * dt);
          a.x += Math.sin(a.yaw) * step;
          a.z += Math.cos(a.yaw) * step;
          if (last && d < 1.5) {
            // Home in exactly on the spot.
            a.x += (next.x - a.x) * Math.min(1, dt * 6);
            a.z += (next.z - a.z) * Math.min(1, dt * 6);
          }
          a.walkPhase += dt * speed * 5.2;
          break;
        }
        case 'do': {
          a.timer -= dt;
          a.yaw += angleDelta(a.yaw, a.poi.face) * (1 - Math.exp(-dt * 6));
          if (a.timer <= 0) this.finish(a);
          break;
        }
        case 'wait':
          break;
      }
    }
  }

  private otherPile(a: Agent, from: Poi): Poi | null {
    const piles = a.errands.filter((p) => p.pile && p !== from);
    return piles.length ? piles[Math.floor(Math.random() * piles.length)] : null;
  }

  private arrive(a: Agent): void {
    const g = a.goal;
    if (g === a.post) {
      a.mode = 'work';
      a.poi = g;
      a.timer = 3 + Math.random() * 6;
      a.carry = false;
      return;
    }
    if (a.poi.kind === 'rest') a.poi.taken = false;
    a.poi = g;
    if (g.kind === 'rest') g.taken = true;
    a.mode = 'do';
    a.timer = g.dur[0] + Math.random() * (g.dur[1] - g.dur[0]);
    if (g.pile) {
      // Pick a box up at one pile; the next leg takes it to another.
      a.carry = !!a.haulTo;
      a.timer = 0.6;
    }
  }

  private finish(a: Agent): void {
    if (a.poi.pile && a.haulTo) {
      const dest = a.haulTo;
      a.haulTo = null;
      a.carry = true;
      this.send(a, dest);
      return;
    }
    a.carry = false;
    // Sometimes go on to a second errand, otherwise head home.
    const more = this.alarmLeft <= 0 && Math.random() < 0.4 ? this.pickErrand(a, this.lastActivity) : null;
    if (more && more !== a.poi) {
      this.send(a, more);
      if (more.pile) a.haulTo = this.otherPile(a, more);
    } else {
      this.send(a, a.post);
    }
  }

  // --- drawing ----------------------------------------------------------------

  private hopHeight(a: Agent): number {
    for (const h of this.hopZones) {
      const dz = Math.abs(a.z - h.z);
      if (dz < 1.1 && a.x > h.x0 && a.x < h.x1) return 0.55 * Math.cos((dz / 1.1) * (Math.PI / 2));
    }
    return 0;
  }

  draw(env: Env, pools: Pools, fe: FolkEnv): void {
    const t = env.elapsed;
    const g: GrainPose = { pos: tmpPos, forward: tmpFwd, up: tmpUp, look: LOOKS.rice, armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, lean: 0, roll: 0 };
    for (const a of this.agents) {
      this.chart.matrix(a.x, a.z, this.ground, a.yaw, tmpM);
      tmpPos.setFromMatrixPosition(tmpM);
      tmpUp.setFromMatrixColumn(tmpM, 1).normalize();
      tmpFwd.setFromMatrixColumn(tmpM, 2).normalize();
      g.look = LOOKS[a.look];
      g.propR = g.propL = g.propBody = undefined;
      g.crate = 0;
      g.scooter = false;
      g.eyeOpen = a.blink < 0 && a.blink > -0.12 ? 0.1 : 1;
      g.swingR = 0;
      g.roll = 0;
      g.lean = 0;
      g.bob = 0;
      g.bubble = 0.2;

      let limbs;
      let style: WorkStyle | null = null;
      if (a.action) {
        limbs = this.actionPose(a, g, t);
      } else if (a.mode === 'walk') {
        const rushing = a.rush > 0;
        const hop = this.hopHeight(a);
        limbs = walkLimbs(a.walkPhase, a.speed, a.carry);
        if (a.courier) {
          g.scooter = true;
          limbs = { ...limbs, armL: -1.15, armR: -1.15, legL: 0, legR: 0, bob: 0, lean: 0.1, roll: 0 };
        } else if (rushing && !a.carry) {
          limbs = { ...limbs, armL: -2.4 + Math.sin(a.walkPhase * 2) * 0.5, armR: -2.4 - Math.sin(a.walkPhase * 2) * 0.5 };
        }
        if (hop > 0.02) limbs = { ...limbs, bob: limbs.bob + hop, legL: -0.6, legR: 0.4 };
        if (a.carry) {
          g.crate = 1;
          g.crateColor = a.look === 'millet' ? 0xe9c46a : 0xc89b5f;
        }
      } else {
        const resting = a.mode === 'do';
        const act = fe.activity;
        if (a.mode === 'work') {
          // Quiet lines only half-staff their stations.
          const engaged = this.cheerLeft > 0 || a.post.lift !== undefined || a.rank < 0.35 + 0.65 * Math.max(act, 0.25);
          style = this.cheerLeft > 0 ? 'cheer' : fe.incident && a.tester && a.spray > 0 ? 'spray' : engaged ? a.poi.style : null;
        } else if (resting) {
          style = a.poi.style;
        }
        limbs = style ? workLimbs(style, t, a.phase) : workLimbs('clipboard', t * 0.3, a.phase);
        if (!style) limbs = { armL: Math.sin(t * 1.5 + a.phase) * 0.06, armR: -Math.sin(t * 1.5 + a.phase) * 0.06, legL: 0, legR: 0, bob: 0, lean: 0, roll: 0 };
        if (style) Object.assign(g, styleProps(style));
        if (style === 'gum') g.bubble = Math.max(0.01, 0.2 + (((t + a.phase) % 4) / 4 < 0.6 ? ((t + a.phase) % 4) / 4 / 0.6 : 0) * 1.6);
        if (style === 'nap') g.eyeOpen = 0.1;
        if (style === 'sweep' && a.poi.kind === 'maint') g.propR = 'broom';
        if (style === 'spray' && fe.incident) this.foam(env, a, fe.incident);
        if (a.mode === 'do' && a.poi.pile && !a.carry) g.crate = 2;
        if (a.mode === 'do' && a.poi.pile && a.haulTo) g.crate = 2;
        g.bob = limbs.bob ?? 0;
        // Seated or lying folk sit on whatever is under them.
        if (style === 'ramen' || style === 'nap') g.bob = (a.poi.lift ?? 0) + (style === 'ramen' ? -0.2 : 0.05);
        void resting;
      }
      Object.assign(g, limbs);
      pools.crowd.draw(g);
    }
  }

  private actionPose(a: Agent, g: GrainPose, t: number): ReturnType<typeof workLimbs> {
    const act = a.action!;
    const u = Math.min(act.t / act.dur, 1);
    const base = { armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, lean: 0, roll: 0 };
    switch (act.kind) {
      case 'hop':
        return { ...base, bob: Math.sin(u * Math.PI) * 0.8, armL: -2.8, armR: -2.8 };
      case 'flip':
        return { ...base, bob: Math.sin(u * Math.PI) * 1.0, lean: -u * TAU, armL: -1.6, armR: -1.6 };
      case 'wave':
        return { ...base, armR: -2.7, swingR: Math.sin(t * 13) * 0.45 };
      case 'stumble':
        g.crate = u > 0.1 && u < 0.78 ? 2 : u <= 0.1 ? 1 : 1;
        g.crateColor = 0xc89b5f;
        return { ...base, roll: Math.sin(u * Math.PI * 5) * 0.4 * (1 - u), armL: -2.2 + Math.sin(u * 20) * 0.6, armR: -2.2 - Math.sin(u * 20) * 0.6 };
      case 'gasp':
        g.eyeOpen = 1.5;
        return { ...base, bob: Math.abs(Math.sin(u * Math.PI * 3)) * 0.15, armL: -2.7, armR: -2.7 };
    }
  }

  private foam(env: Env, a: Agent, target: THREE.Vector3): void {
    if (env.camDist > 200 || Math.random() > env.dt * 55) return;
    tmpAim.copy(target).sub(tmpPos);
    const d = tmpAim.length() || 1;
    tmpAim.multiplyScalar(5 / d);
    tmpAim.x += (Math.random() - 0.5) * 0.9;
    tmpAim.y += (Math.random() - 0.3) * 0.9;
    tmpAim.z += (Math.random() - 0.5) * 0.9;
    const hand = tmpPos.clone().addScaledVector(tmpUp, 0.8).addScaledVector(tmpFwd, 0.4);
    env.fx.emit(hand, tmpAim, { color: 0xffffff, size0: 0.15, size1: 0.6, life: 0.6, alpha: 0.85, drag: 0.3 });
    void a;
  }
}
