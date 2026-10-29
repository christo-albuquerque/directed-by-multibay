import * as THREE from 'three';
import { PATH_X, TRUCK_PAD_X } from './layout';
import { sfx } from '../ui/sfx';
import { glowMaterial } from './glow';
import type { Emitter } from './Particles';
import { box, cyl, makeLabel, mat, shadowAll } from './util';

/** Seconds of countdown before liftoff, measured from the start of the launching status. */
const COUNTDOWN = 3.5;

// Loading crane: pivots on the gantry tower and swings the box from the truck into the rocket.
const PIVOT = new THREE.Vector3(-1.35, 2.9, -1.2);
const PAD_X = PATH_X[5] + 1.5;
const TRUCK_VEC = new THREE.Vector2(TRUCK_PAD_X - PAD_X - PIVOT.x, -PIVOT.z);
const ROCKET_VEC = new THREE.Vector2(-PIVOT.x, -PIVOT.z);
const TRUCK_ANGLE = Math.atan2(TRUCK_VEC.y, TRUCK_VEC.x);
const ROCKET_ANGLE = Math.atan2(ROCKET_VEC.y, ROCKET_VEC.x);
/** Pull-request builds go out on a courier drone parked beside the rocket. */
const DRONE_POS = new THREE.Vector2(1.9, 1.5);
const DRONE_VEC = new THREE.Vector2(DRONE_POS.x - PIVOT.x, DRONE_POS.y - PIVOT.z);
const DRONE_ANGLE = Math.atan2(DRONE_VEC.y, DRONE_VEC.x);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));
const ease = (t: number): number => t * t * (3 - 2 * t);

/** Central launchpad: gantry, LED scoreboard and a rocket that lifts off. Placeholder art for milestone 1. */
export class Launchpad {
  readonly group = new THREE.Group();
  private rocket = new THREE.Group();
  private flame: THREE.Mesh;
  private board: THREE.Mesh;
  private boardCtx: CanvasRenderingContext2D;
  private boardTex: THREE.CanvasTexture;
  private boardText = '';
  private respawn = 1;
  private arm: THREE.Group;
  private armBar: THREE.Mesh;
  private cargo: THREE.Mesh;
  private cable: THREE.Mesh;
  private drone = new THREE.Group();
  private droneCargo: THREE.Mesh;
  private rotors: THREE.Mesh[] = [];
  private droneAway = false;
  private droneRespawn = 1;
  private lastBeep = -1;
  private lifted = false;
  private steamAcc = 0;
  private fireAcc = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor() {
    this.group.position.set(PAD_X, 0, 0);

    // Crane arm (telescoping bar), hanging cable and the box it carries.
    this.arm = new THREE.Group();
    this.arm.position.copy(PIVOT);
    this.armBar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 0.2), mat(0xf4c542));
    this.armBar.geometry.translate(0.5, 0, 0);
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), mat(0x1f2937));
    this.cargo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat(0xc89b5f));
    this.arm.add(this.armBar, this.cable, this.cargo);
    this.group.add(this.arm);

    const pad = cyl(3.2, 3.4, 0.35, 0x8d8a85, 0, 0.1, 0, 28);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 6, 36), glowMaterial(0xf4c542, 0.1, 1.4));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    this.group.add(pad, ring);

    // Gantry tower beside the rocket.
    const tower = new THREE.Group();
    tower.position.set(-1.9, 0, -1.2);
    tower.add(box(0.35, 7, 0.35, 0xdc5a2b, 0, 0.4), box(0.35, 7, 0.35, 0xdc5a2b, 1.1, 0.4), box(1.45, 0.25, 0.25, 0xdc5a2b, 0.55, 2.4), box(1.45, 0.25, 0.25, 0xdc5a2b, 0.55, 4.6), box(1.45, 0.25, 0.25, 0xdc5a2b, 0.55, 6.6));
    this.group.add(tower);

    // Rocket: generic body, nose, fins and a flame we only show during liftoff.
    this.rocket.position.y = 0.5;
    const body = cyl(0.7, 0.8, 4.2, 0xf1ede4, 0, 0.1, 0, 16);
    const stripe = cyl(0.72, 0.72, 0.5, 0xdc2626, 0, 1.6, 0, 16);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 16), mat(0xdc2626));
    nose.position.y = 4.3 + 0.7;
    const window_ = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(0x7dd3fc, { emissive: 0x1d6fa5, emissiveIntensity: 0.6 }));
    window_.position.set(0, 3.3, 0.68);
    this.rocket.add(body, stripe, nose, window_);
    for (let i = 0; i < 3; i++) {
      const fin = box(0.12, 1.3, 0.9, 0xdc2626, 0, 0, 0);
      const a = (i / 3) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 0.9, 0.7, Math.sin(a) * 0.9);
      fin.rotation.y = -a;
      this.rocket.add(fin);
    }
    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 2.4, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.95 }),
    );
    this.flame.rotation.x = Math.PI;
    this.flame.position.y = -1.0;
    this.flame.visible = false;
    this.rocket.add(this.flame);
    this.group.add(this.rocket);

    // Courier drone: four rotors, skids and a cargo box that appears once loaded.
    this.drone.position.set(DRONE_POS.x, 0.5, DRONE_POS.y);
    this.drone.add(box(0.7, 0.26, 0.7, 0x475569, 0, 0.3), box(0.74, 0.07, 0.74, 0x35e0ff, 0, 0.45));
    for (const s of [-1, 1]) {
      this.drone.add(box(0.08, 0.06, 1.0, 0x1f2937, s * 0.28, 0.05));
      for (const t of [-1, 1]) {
        const arm = box(0.9, 0.06, 0.08, 0x334155, s * 0.45, 0.42, t * 0.45);
        arm.rotation.y = t * s * 0.7;
        this.drone.add(arm);
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 14), new THREE.MeshBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.45 }));
        rotor.position.set(s * 0.78, 0.55, t * 0.78);
        this.rotors.push(rotor);
        this.drone.add(rotor);
      }
    }
    this.droneCargo = box(0.42, 0.42, 0.42, 0xc89b5f, 0, -0.18);
    this.droneCargo.visible = false;
    this.drone.add(this.droneCargo);
    this.group.add(this.drone);

    // LED scoreboard.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    this.boardCtx = canvas.getContext('2d')!;
    this.boardTex = new THREE.CanvasTexture(canvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.975), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }));
    this.board.position.set(-1.0, 3.2, -3.1);
    this.group.add(box(2.8, 1.1, 0.2, 0x1b1d24, -1.0, 2.65, -3.2), this.board);
    this.drawBoard('STANDBY');

    const label = makeLabel('LAUNCHPAD', { fontPx: 30 });
    label.position.set(0, 8.6, 0);
    this.group.add(label);
    shadowAll(this.group);
    this.flame.castShadow = false;
    this.board.castShadow = false;
  }

  /** `launchAge` = seconds since a product began launching, or null when nothing is launching. */
  update(dt: number, elapsed: number, launchAge: number | null, fx: Emitter, kind: 'rocket' | 'drone' = 'rocket'): void {
    const droneAge = kind === 'drone' ? launchAge : null;
    this.updateCrane(launchAge, kind);
    this.updateDrone(dt, droneAge, fx);
    if (droneAge !== null) {
      // The rocket waits on the pad while the courier drone takes this one.
      this.drawBoard(droneAge < 2.2 ? 'LOADING' : 'DRONE AWAY');
      return;
    }
    if (launchAge === null) {
      this.lifted = false;
      this.lastBeep = -1;
      // Roll a fresh rocket onto the pad after liftoff.
      if (this.rocket.position.y > 1) {
        this.rocket.visible = false;
        this.rocket.position.y = 0.5;
        this.respawn = 0;
      }
      this.respawn = Math.min(1, this.respawn + dt * 0.8);
      this.rocket.visible = true;
      this.rocket.scale.setScalar(Math.max(0.01, this.respawn));
      this.flame.visible = false;
      this.drawBoard('STANDBY');
      return;
    }
    this.rocket.scale.setScalar(1);
    if (launchAge < COUNTDOWN) {
      const left = Math.ceil(COUNTDOWN - launchAge);
      this.drawBoard(launchAge < 2.2 ? 'LOADING' : `T-${left}`);
      if (launchAge >= 2.2 && left !== this.lastBeep) {
        this.lastBeep = left;
        sfx.beep(left === 1 ? 1320 : 880);
      }
      this.lifted = false;
      this.rocket.position.x = Math.sin(elapsed * 60) * 0.02 * (launchAge / COUNTDOWN);
      // Venting steam around the pad as ignition nears.
      if (launchAge > 2.2) {
        this.steamAcc += dt * 14;
        while (this.steamAcc >= 1) {
          this.steamAcc -= 1;
          const side = Math.random() < 0.5 ? -1 : 1;
          this.tmp.set(this.group.position.x + side * 0.9, 0.6, (Math.random() - 0.5) * 1.6);
          fx.emit(this.tmp, this.tmp2.set(side * (1 + Math.random()), 0.3, (Math.random() - 0.5) * 1.5), { color: 0xeef2f7, size0: 0.3, size1: 1.4, life: 1.3, alpha: 0.55, drag: 1.2 });
        }
      }
    } else {
      const t = launchAge - COUNTDOWN;
      this.drawBoard('LIFTOFF!');
      this.rocket.position.x = 0;
      if (!this.lifted) {
        this.lifted = true;
        sfx.rumble(5);
      }
      this.rocket.position.y = 0.5 + t * t * 2.2;
      this.flame.visible = true;
      this.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);

      // Exhaust: hot flecks plus a long smoke trail.
      const base = this.tmp.set(this.group.position.x, this.rocket.position.y - 0.4, 0);
      this.fireAcc += dt * 70;
      while (this.fireAcc >= 1) {
        this.fireAcc -= 1;
        fx.emit(base, this.tmp2.set((Math.random() - 0.5) * 1.2, -2 - Math.random() * 2, (Math.random() - 0.5) * 1.2), { color: Math.random() < 0.5 ? 0xffb02e : 0xff6a1a, size0: 0.6, size1: 0.15, life: 0.35, alpha: 0.95, drag: 0.5 });
        if (Math.random() < 0.6) fx.emit(base, this.tmp2.set((Math.random() - 0.5) * 2.4, -0.6 - Math.random(), (Math.random() - 0.5) * 2.4), { color: 0xc9ced6, size0: 0.5, size1: 2.2, life: 2.2, alpha: 0.5, drag: 0.8 });
      }
    }
  }

  /** The drone spins up, takes the box and flies off over the horizon. Reset (and pop back in) when idle. */
  private updateDrone(dt: number, age: number | null, fx: Emitter): void {
    const g = this.drone;
    if (age === null) {
      if (this.droneAway) {
        this.droneAway = false;
        g.position.set(DRONE_POS.x, 0.5, DRONE_POS.y);
        g.rotation.set(0, 0, 0);
        this.droneRespawn = 0;
      }
      this.droneRespawn = Math.min(1, this.droneRespawn + dt * 0.8);
      g.scale.setScalar(Math.max(0.01, this.droneRespawn));
      this.droneCargo.visible = false;
      for (const r of this.rotors) r.rotation.y += dt * 2;
      return;
    }
    const spin = age > 1.6 ? 45 : 3;
    for (const r of this.rotors) r.rotation.y += dt * spin;
    this.droneCargo.visible = age >= 2.4;
    const t = age - 2.6;
    if (t <= 0) return;
    this.droneAway = true;
    const lift = ease(Math.min(1, t / 1.2)) * 1.8;
    const fly = Math.max(0, t - 1.0);
    g.position.set(DRONE_POS.x + fly * fly * 1.6 + fly * 0.8, 0.5 + lift + fly * 1.2, DRONE_POS.y - fly * fly * 2.0 - fly * 0.9);
    g.rotation.z = -Math.min(0.4, fly * 0.5);
    g.rotation.y = Math.min(0.8, fly * 0.4);
    if (lift < 1.7 && Math.random() < dt * 40) {
      fx.emit(this.tmp.set(this.group.position.x + g.position.x + (Math.random() - 0.5) * 1.2, 0.5, g.position.z + (Math.random() - 0.5) * 1.2), this.tmp2.set((Math.random() - 0.5) * 2, 0.3, (Math.random() - 0.5) * 2), { color: 0xcfc7b8, size0: 0.25, size1: 0.9, life: 0.9, alpha: 0.45, drag: 1.2 });
    }
  }

  /** Swings the box from the truck bed into the rocket (or onto the drone) during the countdown. */
  private updateCrane(age: number | null, kind: 'rocket' | 'drone'): void {
    const a = age ?? 99;
    const destAngle = kind === 'drone' ? DRONE_ANGLE : ROCKET_ANGLE;
    const destLen = (kind === 'drone' ? DRONE_VEC : ROCKET_VEC).length();
    let angle = TRUCK_ANGLE;
    let len = TRUCK_VEC.length();
    let boxY = 1.0;
    if (a < 0.8) {
      boxY = 1.0;
    } else if (a < 1.4) {
      boxY = lerp(1.0, 2.3, ease((a - 0.8) / 0.6));
    } else if (a < 2.4) {
      const t = ease((a - 1.4) / 1.0);
      angle = lerp(TRUCK_ANGLE, destAngle, t);
      len = lerp(TRUCK_VEC.length(), destLen, t);
      boxY = kind === 'drone' ? lerp(2.3, 0.9, ease((a - 1.4) / 1.0)) : 2.3;
    } else {
      // Box is inside the rocket (or on the drone); the arm returns to the truck side.
      const t = ease((a - 2.8) / 0.8);
      angle = lerp(destAngle, TRUCK_ANGLE, t);
      len = lerp(destLen, TRUCK_VEC.length(), t);
      boxY = kind === 'drone' ? 0.9 : 2.3;
    }
    this.arm.rotation.y = -angle;
    this.armBar.scale.x = len;
    const hang = PIVOT.y - boxY - 0.45;
    this.cable.scale.y = Math.max(0.05, hang);
    this.cable.position.set(len, -hang / 2, 0);
    this.cargo.position.set(len, -(PIVOT.y - boxY), 0);
    this.cargo.visible = age !== null && a < 2.4;
    this.cable.visible = this.cargo.visible;
  }

  private drawBoard(text: string): void {
    if (text === this.boardText) return;
    this.boardText = text;
    const c = this.boardCtx;
    c.fillStyle = '#05070c';
    c.fillRect(0, 0, 256, 96);
    c.fillStyle = text === 'STANDBY' ? '#64748b' : '#ff4d3d';
    c.font = '800 54px ui-monospace, Consolas, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 128, 50);
    this.boardTex.needsUpdate = true;
  }
}
