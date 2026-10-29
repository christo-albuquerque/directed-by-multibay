import * as THREE from 'three';
import { sfx } from '../ui/sfx';
import { rng } from './util';

const DROPS = 900;
const TOP = 11;
const FALL = 22;

/** Storm clouds that drift in over Kepler-22b, with falling rain. */
export class Weather {
  readonly group = new THREE.Group();
  /** 0..1 storm intensity. */
  amount = 0;
  private clouds: THREE.Group[] = [];
  private cloudMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, flatShading: true, roughness: 1 });
  private pos = new Float32Array(DROPS * 6);
  private rain: THREE.LineSegments;
  private rainMat = new THREE.LineBasicMaterial({ color: 0xaecbff, transparent: true, opacity: 0 });
  private on = false;
  private base = new THREE.Color(0xdfe6ee);
  private dark = new THREE.Color(0x6a7589);
  private x0 = -17;
  private x1 = 19;
  private z0 = -9;
  private z1 = 18;

  /** Makes the storm cover the whole factory, however many bays it has. */
  setBounds(b: { x0: number; x1: number; z0: number; z1: number }): void {
    this.x0 = b.x0 - 2;
    this.x1 = b.x1 + 2;
    this.z0 = b.z0 - 2;
    this.z1 = b.z1 + 2;
    const rand = rng(33);
    this.clouds.forEach((c, i) => {
      c.position.set(this.x0 + (i / this.clouds.length) * (this.x1 - this.x0), 12 + rand() * 1.5, this.z0 - 4 + rand() * 9);
    });
    this.setBoundsRain();
  }

  /** Scatters the initial raindrops through the current bounds. */
  private setBoundsRain(): void {
    const rand = rng(34);
    for (let i = 0; i < DROPS; i++) {
      const x = this.x0 + rand() * (this.x1 - this.x0);
      const z = this.z0 + rand() * (this.z1 - this.z0);
      const y = rand() * TOP;
      this.pos.set([x, y, z, x + 0.12, y + 0.7, z], i * 6);
    }
  }

  constructor() {
    const rand = rng(33);
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const r = 1 + rand() * 1.2;
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), this.cloudMat);
        puff.position.set((k - 1.5) * 1.5, rand() * 0.6, (rand() - 0.5) * 1.5);
        puff.scale.y = 0.65;
        c.add(puff);
      }
      c.position.set(-18 + i * 7, 12 + rand() * 1.5, -13 + rand() * 9);
      c.userData.speed = 0.25 + rand() * 0.3;
      this.clouds.push(c);
      this.group.add(c);
    }

    this.setBoundsRain();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.rain = new THREE.LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    this.group.visible = false;
  }

  update(dt: number, storm: boolean): void {
    if (storm !== this.on) {
      this.on = storm;
      sfx.rainOn(storm);
    }
    this.amount += ((storm ? 1 : 0) - this.amount) * (1 - Math.exp(-dt * 1.2));
    if (!storm && this.amount < 0.01) this.amount = 0;
    this.group.visible = this.amount > 0.01;
    if (!this.group.visible) return;

    this.cloudMat.color.copy(this.base).lerp(this.dark, this.amount);
    for (const c of this.clouds) {
      c.scale.setScalar(Math.max(0.01, this.amount * 0.85));
      c.position.x += dt * (c.userData.speed as number);
      if (c.position.x > 22) c.position.x = -22;
    }

    this.rainMat.opacity = 0.55 * this.amount;
    const n = Math.floor(DROPS * this.amount);
    for (let i = 0; i < DROPS; i++) {
      const o = i * 6;
      const dy = FALL * dt;
      this.pos[o + 1] -= dy;
      this.pos[o + 4] -= dy;
      this.pos[o] += 2.2 * dt;
      this.pos[o + 3] += 2.2 * dt;
      if (this.pos[o + 1] < 0) {
        const x = this.x0 + Math.random() * (this.x1 - this.x0);
        const z = this.z0 + Math.random() * (this.z1 - this.z0);
        this.pos[o] = x;
        this.pos[o + 3] = x + 0.12;
        this.pos[o + 2] = z;
        this.pos[o + 5] = z;
        this.pos[o + 1] = TOP;
        this.pos[o + 4] = TOP + 0.7;
      }
    }
    this.rain.geometry.setDrawRange(0, n * 2);
    (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
