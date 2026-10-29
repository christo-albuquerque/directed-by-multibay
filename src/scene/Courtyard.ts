import * as THREE from 'three';
import { glowMaterial } from './glow';
import { PLAZA_R, type Spot } from './layoutPlan';
import type { Particles } from './Particles';
import { box, cyl, shadowAll } from './util';

export type BreakRole = 'ramen' | 'coffee' | 'news' | 'gum' | 'nap';

export interface Seat {
  pos: THREE.Vector3;
  /** Heading the worker settles into. */
  face: number;
  kind: BreakRole;
  /** Height of whatever they sit, lie or stand on. */
  surfaceY: number;
}

export const PLAZA_RADIUS = PLAZA_R;
export const PLAZA_TOP = 0.06;

const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

interface Part {
  group: THREE.Group;
  delay: number;
  wait: number;
  p: number;
}

interface Steam {
  pot: THREE.Vector3;
  cart: THREE.Vector3;
  stall: Part;
}

function stripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#f5f0e6' : '#d6342a';
    ctx.fillRect(i * 8, 0, 8, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function neonSign(text: string, color: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 80;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#120a14';
  ctx.fillRect(0, 0, 256, 80);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 68);
  ctx.fillStyle = color;
  ctx.font = '900 46px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = glowMaterial(0xffffff, 0.35, 1.6, { map: tex, emissiveMap: tex });
  return new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.72), m);
}

/**
 * Break plazas (one per bay): each has a ramen stall, coffee cart, tables, hammocks and string lights that
 * unfold when workers go on break and pack away when everyone is busy.
 */
export class Courtyard {
  readonly group = new THREE.Group();
  readonly seats: Seat[] = [];
  private parts: Part[] = [];
  private steams: Steam[] = [];
  private steamAcc = 0;
  private tmp = new THREE.Vector3();

  constructor(plazas: Spot[]) {
    for (const c of plazas) this.buildPlaza(c);
    shadowAll(this.group);
  }

  private buildPlaza(c: Spot): void {
    const ground = cyl(PLAZA_RADIUS, PLAZA_RADIUS + 0.1, PLAZA_TOP, 0x8a8478, c.x, 0, c.z, 48);
    const inner = cyl(PLAZA_RADIUS - 0.9, PLAZA_RADIUS - 0.9, PLAZA_TOP + 0.01, 0x9a9488, c.x, 0, c.z, 48);
    this.group.add(ground, inner);

    const stall = this.addPart(this.buildStall(c), 0);
    const cart = this.buildCart(c);
    this.addPart(cart.group, 0.15);
    this.addPart(this.buildTables(c), 0.3);
    this.addPart(this.buildHammocks(c), 0.45);
    this.addPart(this.buildLights(c), 0.6);
    this.addStandingSeats(c);
    this.steams.push({ pot: new THREE.Vector3(c.x - 2.2 + 0.9, 1.7, c.z - 4.2 - 0.05), cart: cart.top, stall });
  }

  private addPart(group: THREE.Group, delay: number): Part {
    group.scale.setScalar(0.001);
    group.visible = false;
    const part = { group, delay, wait: 0, p: 0 };
    this.parts.push(part);
    this.group.add(group);
    return part;
  }

  private buildStall(c: Spot): THREE.Group {
    const g = new THREE.Group();
    g.position.set(c.x - 2.2, PLAZA_TOP, c.z - 4.2);
    g.add(box(3.6, 1.0, 1.1, 0x7a3b2a), box(3.9, 0.1, 1.4, 0xd9b27c, 0, 1.0, 0.05));
    for (const x of [-1.8, 1.8]) g.add(cyl(0.08, 0.08, 3.1, 0x4b2e1f, x, 0, -0.5, 8));
    const awningTex = stripeTexture();
    awningTex.repeat.set(2, 1);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.1, 2.0), new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.8 }));
    awning.position.set(0, 3.15, 0.1);
    awning.rotation.x = 0.28;
    g.add(awning);
    const sign = neonSign('RAMEN', '#ff4fa3');
    sign.position.set(0, 3.9, -0.4);
    g.add(sign);
    for (const x of [-1.5, -0.5, 0.5, 1.5]) {
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glowMaterial(0xff3b3b, 0.3, 1.8));
      lantern.position.set(x, 2.55, 0.95);
      g.add(lantern);
    }
    g.add(cyl(0.34, 0.3, 0.4, 0x2b2f3a, 0.9, 1.1, -0.05, 14), cyl(0.24, 0.24, 0.25, 0xf5f0e6, -0.9, 1.1, 0.1, 12), cyl(0.24, 0.24, 0.25, 0xf5f0e6, -0.9, 1.35, 0.1, 12));
    return g;
  }

  private buildCart(c: Spot): { group: THREE.Group; top: THREE.Vector3 } {
    const g = new THREE.Group();
    g.position.set(c.x + 3.6, PLAZA_TOP, c.z - 4.2);
    g.add(box(2.2, 0.9, 1.0, 0x2f8f83, 0, 0.25), box(2.4, 0.08, 1.2, 0xe8e2d4, 0, 1.15));
    for (const x of [-0.8, 0.8]) {
      const w = cyl(0.28, 0.28, 0.1, 0x1c1e24, x, 0, 0.55, 12);
      w.rotation.z = Math.PI / 2;
      w.position.y = 0.28;
      g.add(w);
    }
    g.add(cyl(0.05, 0.05, 2.6, 0x9aa4b2, 0, 1.2, -0.3, 6));
    const brolly = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0xf2b134, flatShading: true }));
    brolly.position.set(0, 4.05, -0.3);
    g.add(brolly);
    g.add(cyl(0.22, 0.22, 0.5, 0xb8bec9, 0.6, 1.23, 0, 10), cyl(0.08, 0.08, 0.2, 0x2b2f3a, 0.6, 1.73, 0, 8));
    return { group: g, top: new THREE.Vector3(g.position.x + 0.6, 2.1, g.position.z) };
  }

  private buildTables(c: Spot): THREE.Group {
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    const centres: [number, number][] = [[-3.2, -0.6], [0.2, 0.6], [3.4, -0.4]];
    centres.forEach(([cx, cz], ti) => {
      g.add(cyl(0.12, 0.12, 0.75, 0x8a8f9a, cx, PLAZA_TOP, cz, 8), cyl(0.78, 0.78, 0.08, 0xe6d3a8, cx, PLAZA_TOP + 0.75, cz, 16));
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2 + ti * 0.35;
        const sx = cx + Math.cos(a) * 1.15;
        const sz = cz + Math.sin(a) * 1.15;
        g.add(cyl(0.12, 0.12, 0.45, 0x8a5a2b, sx, PLAZA_TOP, sz, 8), cyl(0.26, 0.26, 0.07, 0xb9763a, sx, PLAZA_TOP + 0.45, sz, 12));
        const bx = cx + Math.cos(a) * 0.45;
        const bz = cz + Math.sin(a) * 0.45;
        g.add(cyl(0.2, 0.15, 0.12, 0xf5f0e6, bx, PLAZA_TOP + 0.83, bz, 12), cyl(0.17, 0.17, 0.02, 0xe9c46a, bx, PLAZA_TOP + 0.95, bz, 10));
        this.seats.push({ pos: new THREE.Vector3(c.x + sx, 0, c.z + sz), face: Math.atan2(cx - sx, cz - sz), kind: 'ramen', surfaceY: PLAZA_TOP + 0.52 });
      }
    });
    return g;
  }

  private buildHammocks(c: Spot): THREE.Group {
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    for (const [cx, cz] of [[-3.4, 3.4], [3.2, 3.6]] as const) {
      for (const s of [-1.6, 1.6]) g.add(cyl(0.08, 0.1, 1.7, 0x6b4a2b, cx + s, PLAZA_TOP, cz, 8));
      g.add(box(2.7, 0.06, 0.8, 0x4aa3a0, cx, PLAZA_TOP + 0.76, cz), box(0.5, 0.05, 0.7, 0xf1e7d0, cx - 0.95, PLAZA_TOP + 0.84, cz));
      this.seats.push({ pos: new THREE.Vector3(c.x + cx, 0, c.z + cz), face: 0, kind: 'nap', surfaceY: PLAZA_TOP + 0.84 });
    }
    return g;
  }

  private buildLights(c: Spot): THREE.Group {
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    const colors = [0xffd166, 0xff6b9d, 0x6bd6ff, 0xa5f26b];
    const mats = colors.map((col) => glowMaterial(col, 0.25, 2.2));
    const bulb = new THREE.SphereGeometry(0.09, 8, 6);
    for (const z0 of [-2.2, 1]) {
      const a = new THREE.Vector3(-5.6, PLAZA_TOP, z0);
      const b = new THREE.Vector3(5.6, PLAZA_TOP, z0);
      for (const p of [a, b]) g.add(cyl(0.06, 0.07, 3.6, 0x4b2e1f, p.x, PLAZA_TOP, p.z, 6));
      const pts: THREE.Vector3[] = [];
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, PLAZA_TOP + 3.5 - Math.sin(t * Math.PI) * 0.6, a.z));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1b1b1f })));
      pts.forEach((p, i) => {
        if (i % 2) {
          const m = new THREE.Mesh(bulb, mats[i % mats.length]);
          m.position.copy(p).add(new THREE.Vector3(0, -0.1, 0));
          g.add(m);
        }
      });
    }
    return g;
  }

  private addStandingSeats(c: Spot): void {
    const put = (x: number, z: number, face: number, kind: BreakRole): void => {
      this.seats.push({ pos: new THREE.Vector3(c.x + x, 0, c.z + z), face, kind, surfaceY: PLAZA_TOP });
    };
    for (const [x, z] of [[2.0, -2.9], [2.9, -2.9], [3.8, -2.9], [4.7, -2.9], [3.4, -2.2]] as const) put(x, z, Math.PI, 'coffee');
    for (const [x, z] of [[-3.6, -2.9], [-2.4, -2.9], [-1.2, -2.9], [-4.8, -2.4]] as const) put(x, z, Math.PI, 'news');
    for (const [x, z, f] of [[0, 3.2, 0.6], [-1.4, 4.6, -0.5], [1.6, 4.8, 2.5], [0.1, 5.4, 0]] as const) put(x, z, f, 'gum');
  }

  update(dt: number, idle: boolean, fx: Particles): void {
    for (const p of this.parts) {
      if (idle) {
        p.wait += dt;
        if (p.wait > p.delay) p.p = Math.min(1, p.p + dt / 0.9);
      } else {
        p.wait = 0;
        p.p = Math.max(0, p.p - dt / 0.5);
      }
      p.group.visible = p.p > 0.001;
      p.group.scale.setScalar(p.p <= 0.001 ? 0.001 : p.p >= 1 ? 1 : Math.max(0.001, easeOutBack(p.p)));
    }

    // Steam from each noodle pot and coffee machine.
    if (idle) {
      this.steamAcc += dt * 9;
      while (this.steamAcc >= 1) {
        this.steamAcc -= 1;
        for (const s of this.steams) {
          if (s.stall.p <= 0.9) continue;
          fx.emit(this.tmp.copy(s.pot), new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.7, (Math.random() - 0.5) * 0.2), { color: 0xffffff, size0: 0.25, size1: 0.9, life: 1.6, alpha: 0.35, drag: 0.5 });
          if (Math.random() < 0.5) fx.emit(this.tmp.copy(s.cart), new THREE.Vector3(0, 0.6, 0), { color: 0xffffff, size0: 0.15, size1: 0.6, life: 1.2, alpha: 0.3, drag: 0.5 });
        }
      }
    }
  }
}
