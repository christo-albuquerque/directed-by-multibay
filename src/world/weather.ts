import * as THREE from 'three';
import type { GlobeWorld } from '../globe/GlobeWorld';
import { R } from '../globe/surface';
import { sfx } from '../ui/sfx';
import { motion } from '../ui/motion';

import type { WeatherKind, WeatherMode } from './weatherModes';
export { WEATHER_MODES } from './weatherModes';
export type { WeatherKind, WeatherMode } from './weatherModes';
const TARGET: Record<WeatherKind, number> = { drizzle: 0.4, rain: 0.75, storm: 1, snow: 0.7, overcast: 0.6 };
const DROPS = 1800;

/**
 * Weather comes and goes on its own schedule, whatever the factory is doing: a drizzle, a downpour or a thunderstorm
 * drifts over the planet every few minutes, dims the light, and rains on wherever the camera is looking.
 */
export class Weather {
  /** 0 = clear sky, 1 = full storm (smoothed). */
  level = 0;
  kind: WeatherKind | null = null;
  mode: WeatherMode = 'dynamic';
  private target = 0;
  private timer = 70 + Math.random() * 120;
  private streaks: THREE.LineSegments;
  private pos = new Float32Array(DROPS * 6);
  private local = new Float32Array(DROPS * 3);
  private mat: THREE.LineBasicMaterial;
  private flash = 0;
  private nextFlash = 5;
  private thunder = -1;
  private sound = false;
  private up = new THREE.Vector3();
  private right = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private base = new THREE.Vector3();

  constructor(private world: GlobeWorld) {
    for (let i = 0; i < DROPS; i++) this.local.set([(Math.random() * 2 - 1), Math.random(), (Math.random() * 2 - 1)], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ color: 0xb4ccff, transparent: true, opacity: 0, depthWrite: false });
    this.streaks = new THREE.LineSegments(geo, this.mat);
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    world.scene.add(this.streaks);
  }

  /** Picks what the sky does: its own random schedule, or one held state. */
  setMode(mode: WeatherMode): void {
    this.mode = mode;
    if (mode === 'dynamic') {
      this.kind = null;
      this.target = 0;
      this.timer = 20 + Math.random() * 40;
    } else if (mode === 'clear' || mode === 'off') {
      this.kind = null;
      this.target = 0;
    } else {
      this.kind = mode;
      this.target = TARGET[mode];
      this.timer = Infinity;
    }
  }

  /** Starts a spell of weather now (also used for testing). */
  begin(kind: WeatherKind, seconds = 60 + Math.random() * 50): void {
    this.kind = kind;
    this.target = TARGET[kind];
    this.timer = seconds;
  }

  update(dt: number, elapsed: number): void {
    if (this.mode === 'dynamic') this.timer -= dt;
    if (this.mode === 'dynamic' && this.timer <= 0) {
      // Every kind of sky is equally likely: clear, rain (a drizzle, a downpour or a storm), snow or overcast.
      const options = ['clear', 'rain', 'snow', 'overcast'] as const;
      const pick = options[Math.floor(Math.random() * options.length)];
      if (pick === 'clear') {
        this.kind = null;
        this.target = 0;
        this.timer = 60 + Math.random() * 90;
      } else if (pick === 'rain') {
        const kinds = ['drizzle', 'rain', 'storm'] as const;
        this.begin(kinds[Math.floor(Math.random() * kinds.length)], 60 + Math.random() * 80);
      } else {
        this.begin(pick, 60 + Math.random() * 80);
      }
    }
    this.level += (this.target - this.level) * (1 - Math.exp(-dt * 0.35));
    if (Math.abs(this.target - this.level) < 0.003) this.level = this.target;

    const lv = this.level;
    const w = this.world;
    // Dim the day: the clouds take most of the sun.
    const heavy = this.kind === 'overcast' ? 0.75 : 0.6;
    w.sun.intensity *= 1 - heavy * lv;
    w.hemi.intensity *= 1 - 0.3 * lv;

    if (this.kind === 'storm' && lv > 0.6) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flash = 0.34;
        this.nextFlash = 4 + Math.random() * 8;
        this.thunder = 0.5 + Math.random() * 1.2;
      }
    }
    if (this.thunder > 0) {
      this.thunder -= dt;
      if (this.thunder <= 0) sfx.rumble(2.6);
    }
    if (this.flash > 0) {
      this.flash -= dt;
      // Two quick blinks.
      const f = this.flash;
      const on = (f > 0.24 && f < 0.34) || (f > 0.06 && f < 0.16);
      if (on && !motion.reduced) w.hemi.intensity += 4.5;
    }

    const snowing = this.kind === 'snow';
    const falling = this.kind !== null && this.kind !== 'overcast';
    const wet = lv > 0.06 && falling && !snowing;
    if (wet !== this.sound) {
      this.sound = wet;
      sfx.rainOn(wet);
    }
    const camDist = w.controls.view.dist;
    this.streaks.visible = lv > 0.06 && falling && camDist < 320;
    if (!this.streaks.visible) return;
    this.mat.color.setHex(snowing ? 0xffffff : 0xb4ccff);
    this.mat.opacity = (snowing ? 0.85 : 0.5) * Math.min(1, lv * 1.4);

    // Rain falls around the point the camera looks at, in that place's own "down".
    const focus = w.controls.focus;
    this.up.copy(focus).normalize();
    this.right.set(0, 1, 0).cross(this.up);
    if (this.right.lengthSq() < 0.01) this.right.set(1, 0, 0);
    this.right.normalize();
    this.fwd.crossVectors(this.right, this.up).normalize();
    this.base.copy(this.up).multiplyScalar(R);
    const radius = THREE.MathUtils.clamp(camDist * 0.9, 30, 90);
    const height = 45;
    const fall = snowing ? 7 : 55;
    const len = snowing ? 0.35 : 1.8;
    const count = Math.floor(DROPS * Math.min(1, 0.25 + lv));
    for (let i = 0; i < DROPS; i++) {
      const o = i * 3;
      if (i >= count) {
        this.pos.fill(0, i * 6, i * 6 + 6);
        continue;
      }
      let y = this.local[o + 1] - (fall * dt) / height;
      if (y < 0) y += 1;
      this.local[o + 1] = y;
      // Snowflakes drift sideways as they fall.
      const sway = snowing ? Math.sin(elapsed * 0.9 + i) * 1.4 : 0;
      const x = this.local[o] * radius + sway;
      const z = this.local[o + 2] * radius + (snowing ? Math.cos(elapsed * 0.7 + i * 1.3) * 1.2 : 0);
      const h = y * height;
      const k = i * 6;
      const px = this.base.x + this.right.x * x + this.up.x * h + this.fwd.x * z;
      const py = this.base.y + this.right.y * x + this.up.y * h + this.fwd.y * z;
      const pz = this.base.z + this.right.z * x + this.up.z * h + this.fwd.z * z;
      this.pos[k] = px;
      this.pos[k + 1] = py;
      this.pos[k + 2] = pz;
      this.pos[k + 3] = px - this.up.x * len;
      this.pos[k + 4] = py - this.up.y * len;
      this.pos[k + 5] = pz - this.up.z * len;
    }
    (this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    void elapsed;
  }
}
