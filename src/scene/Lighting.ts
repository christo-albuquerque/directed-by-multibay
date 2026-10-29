import * as THREE from 'three';
import type { FactoryMode } from '../sim/factory';

const DAY = { sky: new THREE.Color(0x2a3f66), sun: new THREE.Color(0xfff1d6), hemiSky: new THREE.Color(0xcfe3ff), sunI: 2.1, hemiI: 1.2 };
const NIGHT = { sky: new THREE.Color(0x0d1430), sun: new THREE.Color(0x8fa0ff), hemiSky: new THREE.Color(0x7083c8), sunI: 0.9, hemiI: 1.0 };
const ALERT = new THREE.Color(0xff5a4a);

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

  update(dt: number, mode: FactoryMode): void {
    const targetNight = mode === 'idle' ? 1 : 0;
    const targetAlert = mode === 'failure' ? 1 : 0;
    const k = 1 - Math.exp(-dt * 1.8);
    this.night += (targetNight - this.night) * k;
    this.alert += (targetAlert - this.alert) * k;

    const n = this.night;
    (this.scene.background as THREE.Color).copy(DAY.sky).lerp(NIGHT.sky, n);
    this.sun.color.copy(DAY.sun).lerp(NIGHT.sun, n).lerp(ALERT, this.alert * 0.35);
    this.sun.intensity = THREE.MathUtils.lerp(DAY.sunI, NIGHT.sunI, n);
    this.hemi.color.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, n);
    this.hemi.intensity = THREE.MathUtils.lerp(DAY.hemiI, NIGHT.hemiI, n);
  }
}
