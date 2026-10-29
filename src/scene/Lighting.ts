import * as THREE from 'three';
import type { FactoryMode } from '../sim/factory';

const DAY = { sky: new THREE.Color(0x2a3f66), sun: new THREE.Color(0xfff1d6), hemiSky: new THREE.Color(0xcfe3ff), sunI: 2.1, hemiI: 1.2 };
const NIGHT = { sky: new THREE.Color(0x0d1430), sun: new THREE.Color(0x8fa0ff), hemiSky: new THREE.Color(0x7083c8), sunI: 0.9, hemiI: 1.0 };
const ALERT = new THREE.Color(0xff5a4a);
const STORM_SKY = new THREE.Color(0x1a2233);

/** Day when busy, neon twilight when quiet, red tint during failures. */
export class Lighting {
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0xcfe3ff, 0x3a2a24, 1.2);
  /** 0 = day, 1 = night. */
  night = 0;
  private alert = 0;

  constructor(private scene: THREE.Scene) {
    this.sun.position.set(14, 24, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -26;
    c.right = 26;
    c.top = 26;
    c.bottom = -26;
    c.near = 1;
    c.far = 80;
    this.sun.shadow.bias = -0.0005;
    scene.add(this.sun, this.hemi);
    scene.background = DAY.sky.clone();
  }

  /** Aims the sun and its shadow map at the whole factory, however many bays it has grown. */
  setExtent(center: { x: number; z: number }, radius: number): void {
    this.sun.position.set(center.x + 14 * (radius / 22), 24 * (radius / 22), center.z + 10 * (radius / 22));
    this.sun.target.position.set(center.x, 0, center.z);
    this.scene.add(this.sun.target);
    const r = radius * 1.1;
    const c = this.sun.shadow.camera;
    c.left = -r;
    c.right = r;
    c.top = r;
    c.bottom = -r;
    c.far = 80 + radius * 2;
    c.updateProjectionMatrix();
    const size = radius > 30 ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** `rain` is 0..1 storm intensity; it greys and dims the day. */
  update(dt: number, mode: FactoryMode, rain = 0): void {
    const targetNight = mode === 'idle' ? 1 : 0;
    const targetAlert = mode === 'failure' ? 1 : 0;
    const k = 1 - Math.exp(-dt * 1.8);
    this.night += (targetNight - this.night) * k;
    this.alert += (targetAlert - this.alert) * k;

    const n = this.night;
    (this.scene.background as THREE.Color).copy(DAY.sky).lerp(NIGHT.sky, n).lerp(STORM_SKY, rain * 0.7 * (1 - n));
    this.sun.color.copy(DAY.sun).lerp(NIGHT.sun, n).lerp(ALERT, this.alert * 0.35);
    this.sun.intensity = THREE.MathUtils.lerp(DAY.sunI, NIGHT.sunI, n) * (1 - 0.45 * rain);
    this.hemi.color.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, n);
    this.hemi.intensity = THREE.MathUtils.lerp(DAY.hemiI, NIGHT.hemiI, n) * (1 - 0.25 * rain);
  }
}
