import * as THREE from 'three';
import type { FactoryState, Product, ProductStatus } from '../sim/factory';
import { testPose } from './choreography';
import { pathPosition } from './layout';
import type { Particles } from './Particles';
import { sfx } from '../ui/sfx';
import { box, makeLabel, shadowAll } from './util';

const BOX_COLOR: Record<ProductStatus, number> = {
  moving: 0xffffff,
  launching: 0xbfe8b4,
  launched: 0xbfe8b4,
  failed: 0xff6a5e,
  cancelled: 0x9aa0a8,
};

/** u at which the crate has been through the press and comes out as a sealed box. */
const SEALED_AT = 2.25;
/** u at which the box has passed testing and gets its green seal. */
const TESTED_AT = 4.0;

let crateTex: THREE.CanvasTexture | null = null;
function crateTexture(): THREE.CanvasTexture {
  if (crateTex) return crateTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#b98a52';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#8a6236';
  for (const y of [4, 28, 52]) ctx.fillRect(0, y, 64, 8);
  ctx.fillRect(0, 0, 8, 64);
  ctx.fillRect(56, 0, 8, 64);
  crateTex = new THREE.CanvasTexture(c);
  crateTex.colorSpace = THREE.SRGBColorSpace;
  return crateTex;
}

let sealTex: THREE.CanvasTexture | null = null;
function sealTexture(): THREE.CanvasTexture {
  if (sealTex) return sealTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(18, 33);
  ctx.lineTo(28, 43);
  ctx.lineTo(46, 22);
  ctx.stroke();
  sealTex = new THREE.CanvasTexture(c);
  sealTex.colorSpace = THREE.SRGBColorSpace;
  return sealTex;
}

let cancelTex: THREE.CanvasTexture | null = null;
function cancelTexture(): THREE.CanvasTexture {
  if (cancelTex) return cancelTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#c62828';
  ctx.fillStyle = '#c62828';
  ctx.lineWidth = 5;
  ctx.strokeRect(4, 10, 120, 44);
  ctx.font = '900 21px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CANCELLED', 64, 33);
  cancelTex = new THREE.CanvasTexture(c);
  cancelTex.colorSpace = THREE.SRGBColorSpace;
  return cancelTex;
}

interface View {
  group: THREE.Group;
  crate: THREE.Mesh;
  sealedBox: THREE.Group;
  seals: THREE.Mesh[];
  boxMats: THREE.MeshStandardMaterial[];
  crateMat: THREE.MeshStandardMaterial;
  sealed: boolean;
  /** Giant "CANCELLED" rubber stamp, its imprints and the trapdoor under the belt. */
  stamp: THREE.Group;
  imprints: THREE.Mesh[];
  flapL: THREE.Group;
  flapR: THREE.Group;
  /** Everything that falls through the trapdoor when cancelled. */
  drop: THREE.Group;
  stampHit: boolean;
  trapOpened: boolean;
}

const STAMP_HI = 2.6;
const STAMP_LO = 0.94;

function makeView(p: Product): View {
  const group = new THREE.Group();

  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9 });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), crateMat);
  crate.position.y = 0.45;
  group.add(crate);

  const sealedBox = new THREE.Group();
  const body = box(0.9, 0.9, 0.9, 0xc89b5f);
  const tape = box(0.2, 0.02, 0.92, 0xe8dcc0, 0, 0.9);
  const tapeSide = box(0.2, 0.92, 0.02, 0xe8dcc0, 0, 0, 0.46);
  sealedBox.add(body, tape, tapeSide);
  const boxMats = [body, tape, tapeSide].map((m) => m.material as THREE.MeshStandardMaterial);
  const seals: THREE.Mesh[] = [];
  for (const [x, z, ry] of [[0, 0.462, 0], [0.462, 0, Math.PI / 2]] as const) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: sealTexture(), transparent: true }));
    s.position.set(x, 0.45, z);
    s.rotation.y = ry;
    s.visible = false;
    seals.push(s);
    sealedBox.add(s);
  }
  sealedBox.visible = false;
  group.add(sealedBox);

  const label = makeLabel(p.label, { fontPx: 26 });
  label.position.y = 1.9;
  group.add(label);

  // Cancel props: stamp above, imprints on the box, trapdoor flaps on the belt.
  const stamp = new THREE.Group();
  stamp.add(box(0.8, 0.18, 0.8, 0xc62828), box(0.16, 0.5, 0.16, 0x7a1b1b, 0, 0.18), box(0.4, 0.14, 0.14, 0x7a1b1b, 0, 0.68));
  stamp.visible = false;
  group.add(stamp);
  const imprints: THREE.Mesh[] = [];
  const imprintMat = new THREE.MeshBasicMaterial({ map: cancelTexture(), transparent: true, depthWrite: false });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), imprintMat);
  top.rotation.x = -Math.PI / 2;
  top.position.set(0, 0.92, 0);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), imprintMat);
  front.position.set(0, 0.45, 0.47);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), imprintMat);
  side.position.set(0.47, 0.45, 0);
  side.rotation.y = Math.PI / 2;
  for (const m of [top, front, side]) {
    m.visible = false;
    imprints.push(m);
  }
  const flapMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, flatShading: true });
  const makeFlap = (hingeX: number, dir: number): THREE.Group => {
    const f = new THREE.Group();
    f.position.set(hingeX, 0.04, 0);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.95), flapMat);
    slab.position.x = dir * 0.25;
    f.add(slab);
    f.visible = false;
    group.add(f);
    return f;
  };
  const flapL = makeFlap(-0.5, 1);
  const flapR = makeFlap(0.5, -1);

  const drop = new THREE.Group();
  drop.add(crate, sealedBox, label, ...imprints);
  group.add(drop);
  shadowAll(group);
  return { group, crate, sealedBox, seals, boxMats, crateMat, sealed: false, stamp, imprints, flapL, flapR, drop, stampHit: false, trapOpened: false };
}

/** Keeps one 3D product per sim Product: a raw crate that is pressed into a sealed box, tested, loaded and launched. */
export class ProductView {
  readonly group = new THREE.Group();
  private views = new Map<number, View>();
  private tmp = new THREE.Vector3();

  update(state: FactoryState, elapsed: number, fx: Particles): void {
    const live = new Set<number>();
    for (const p of state.products) {
      live.add(p.id);
      let v = this.views.get(p.id);
      if (!v) {
        v = makeView(p);
        this.views.set(p.id, v);
        this.group.add(v.group);
      }
      this.pose(v, p, elapsed, fx);
    }
    for (const [id, v] of this.views) {
      if (!live.has(id)) {
        this.group.remove(v.group);
        this.views.delete(id);
      }
    }
  }

  /** Stamp slams down, then a trapdoor opens and the box drops out of the factory. */
  private cancelPose(v: View, p: Product, pos: THREE.Vector3, fx: Particles): void {
    const a = p.age;
    v.stamp.visible = a < 0.95;
    const hit = a >= 0.35;
    if (a < 0.35) v.stamp.position.y = THREE.MathUtils.lerp(STAMP_HI, STAMP_LO, (a / 0.35) ** 2);
    else v.stamp.position.y = THREE.MathUtils.lerp(STAMP_LO, STAMP_HI, Math.min(1, (a - 0.45) / 0.45));
    for (const m of v.imprints) m.visible = hit;
    if (hit && !v.stampHit) {
      v.stampHit = true;
      sfx.stamp();
      fx.burst(pos.clone().setY(pos.y + 1), 14, 2.4, 2, new THREE.Vector3(0, 0.4, 0), { color: 0xe05a4a, size0: 0.2, size1: 0.6, life: 0.6, alpha: 0.9 });
    }

    // Trapdoor: opens at 1.0s, closes at 2.4s; the box falls through.
    const open = a < 1.0 ? 0 : a < 1.4 ? (a - 1.0) / 0.4 : a < 2.4 ? 1 : Math.max(0, 1 - (a - 2.4) / 0.5);
    v.flapL.visible = v.flapR.visible = open > 0.001 || (a >= 1.0 && a < 3);
    v.flapL.rotation.z = -open * 1.4;
    v.flapR.rotation.z = open * 1.4;
    if (open > 0 && !v.trapOpened) {
      v.trapOpened = true;
      sfx.thud();
      fx.burst(pos.clone().setY(pos.y + 0.1), 10, 1.4, 2, new THREE.Vector3(0, 0.2, 0), { color: 0x9a948a, size0: 0.25, size1: 0.9, life: 0.9, alpha: 0.6 });
    }
    const fall = Math.max(0, a - 1.2);
    v.drop.position.y = -(fall * fall) * 7;
    v.drop.visible = a < 2.0;
    v.group.visible = a < 3.0;
  }

  private pose(v: View, p: Product, elapsed: number, fx: Particles): void {
    const pos = pathPosition(p.u, this.tmp);
    let scaleY = 1;
    let shake = 0;

    // Dropped in from the depot funnel.
    if (p.u < 0.3) {
      const t = 1 - p.u / 0.3;
      pos.y += t * t * 2.3;
    }
    // Squashed a little by the press.
    if (p.u > 2.05 && p.u < 2.25) scaleY = 1 - 0.18 * Math.sin(((p.u - 2.05) / 0.2) * Math.PI);

    // Test sequence.
    if (p.u >= 3 && p.u <= 4) {
      const pose = testPose(p.u - 3);
      pos.y += pose.dy;
      pos.z += pose.dz;
      scaleY *= pose.scaleY;
      shake = pose.shake;
    }

    if (p.status === 'launching') pos.y = -50; // loaded into the rocket by the crane
    if (p.status === 'failed') shake = 0.06;
    if (p.status === 'cancelled') this.cancelPose(v, p, pos, fx);

    v.group.position.copy(pos);
    v.group.position.x += Math.sin(elapsed * 90) * shake;
    v.group.scale.set(1, scaleY, 1);
    v.group.rotation.z = p.status === 'failed' ? Math.sin(elapsed * 30) * 0.08 : 0;

    const sealedNow = p.u >= SEALED_AT;
    if (sealedNow !== v.sealed) {
      v.sealed = sealedNow;
      v.crate.visible = !sealedNow;
      v.sealedBox.visible = sealedNow;
      if (sealedNow) fx.burst(pos.clone().setY(pos.y + 0.5), 10, 1.4, 2, new THREE.Vector3(0, 0.5, 0), { color: 0xf1e7cf, size0: 0.2, size1: 0.7, life: 0.7, alpha: 0.8 });
    }
    const tested = p.u >= TESTED_AT && p.status !== 'failed';
    for (const s of v.seals) s.visible = tested;

    const tint = new THREE.Color(BOX_COLOR[p.status]);
    v.crateMat.color.copy(tint);
    for (const m of v.boxMats) m.emissive.setHex(p.status === 'failed' ? 0x550000 : 0x000000);
    v.boxMats[0].color.setHex(p.status === 'moving' ? 0xc89b5f : BOX_COLOR[p.status]);
  }
}
