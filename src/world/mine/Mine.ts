import * as THREE from 'three';
import { SurfacePath } from '../../globe/path';
import { Chart, R } from '../../globe/surface';
import { pitDepthAt } from '../../globe/terrain';
import { ZONES, zoneChart, type Zone } from '../../globe/zones';
import { ribbonMesh } from '../belts';
import { Ambient } from '../ambient';
import type { LookName } from '../crowd';
import { Dyn } from '../dyn';

import { M, Prefab, StaticBatch, glowMat, setGlow } from '../kit';
import { hood, lamp, tank } from '../line/prefabs';
import { InstancePool, LitPool, surfaceMatrix } from '../pools';
import type { Env, Pools } from '../types';
import { dumpTruck, dumpTruckLights, mineCart, oreHeap } from '../vehicles';

const ease = (t: number): number => t * t * (3 - 2 * t);
const m4 = new THREE.Matrix4();
const m5 = new THREE.Matrix4();
const v3 = new THREE.Vector3();
const sample = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3() };

/** Point on the planet at chart (x, z) and height h (which may be below ground, in the pit). */
function pt(chart: Chart, x: number, z: number, h: number): THREE.Vector3 {
  return chart.dir(x, z).multiplyScalar(R + h);
}

/**
 * An open-pit mine and a rail mine. Dump trucks haul ore up a spiral ramp and tip it into the crusher; mine carts
 * ride out of a tunnel full and back in empty; an excavator digs at the bottom. Nothing is created or destroyed in view:
 * loads grow under the bucket and shrink into the hopper, carts vanish only behind the tunnel portal.
 */
export class Mine {
  readonly group = new THREE.Group();
  private zone: Zone;
  private chart: Chart;
  private ramp: SurfacePath;
  private rail: SurfacePath;
  private railOut: SurfacePath;
  private railBack: SurfacePath;
  private trucks = new LitPool(dumpTruck(), dumpTruckLights(), 4, false);
  private carts = new InstancePool(mineCart(), 12, false);
  private loads = new InstancePool(oreHeap(1.7), 24, false, false);
  private boom: Dyn;
  private stick: Dyn;
  private bucket: Dyn;
  private turret: Dyn;
  private exBase = new THREE.Matrix4();
  private t = 0;
  private walkers: { path: SurfacePath; s: number; look: LookName; speed: number; phase: number }[] = [];
  ambient?: Ambient;
  private dustAcc = 0;

  constructor(batch: StaticBatch) {
    this.zone = ZONES.find((z) => z.kind === 'mine')!;
    this.chart = zoneChart(this.zone);
    const c = this.chart;
    const id = this.zone.id;

    // Spiral haul road down the pit wall.
    const pts: THREE.Vector3[] = [];
    for (let a = 0; a <= Math.PI * 3.1; a += 0.22) {
      const r = 29 - (29 - 9) * (a / (Math.PI * 3.1));
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pts.push(pt(c, x, z, -pitDepthAt(x, z) + 0.45));
    }
    this.ramp = SurfacePath.through3D(pts, 1);
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1, side: THREE.DoubleSide, flatShading: true });
    this.group.add(ribbonMesh(this.ramp, 3.6, asphalt, 0.05));

    // Excavator at the pit floor, next to the end of the ramp.
    const endP = pts[pts.length - 1];
    const endLocal = c.toLocal(endP.clone().normalize());
    const ex = endLocal.x + 5;
    const ez = endLocal.y + 4;
    this.exBase = c.matrix(ex, ez, -pitDepthAt(ex, ez) + 0.4, Math.PI * 0.85);
    const body = new Prefab().box(5.4, 1.3, 6.4, M(0x3f4552), 0, 0, 0).box(2.6, 1.9, 3, M(0xf2a900), -0.8, 1.3, -0.8).box(2.2, 1.1, 0.1, M(0xbfe3f2), -0.8, 2.2, 0.75).box(3, 1.2, 2, M(0x2b2f38), 0.6, 1.3, -2.4);
    this.turret = new Dyn(body, this.exBase, this.group);
    this.boom = new Dyn(new Prefab().box(1.1, 1.1, 8, M(0xf2a900), 0, 0, 0), this.exBase, this.group);
    this.stick = new Dyn(new Prefab().box(0.9, 0.9, 5.4, M(0xd99700), 0, 0, 0), this.exBase, this.group);
    this.bucket = new Dyn(new Prefab().box(2.4, 1.5, 2, M(0x6b7280), 0, 0, 0).box(2.5, 0.3, 0.4, M(0xcbd5e1), 0, -0.2, 1.1), this.exBase, this.group);

    // Ore is hauled by dump trucks and rail carts only: no belts outside factories.

    // Rail line: tunnel portal in the north-east rim, rails along the rim to the crusher.
    this.rail = SurfacePath.through(c, [[40, -30], [32, -35], [18, -38], [0, -38], [-10, -37]], 0.3, false, 0.8);
    this.railOut = this.rail.offset(1.3);
    this.railBack = this.rail.offset(-1.3);
    const railMat = M(0x9aa4b2);
    for (const lane of [this.railOut, this.railBack]) for (const k of [-0.55, 0.55]) this.group.add(ribbonMesh(lane.offset(k), 0.14, railMat, 0.25));
    const sleepers = new Prefab().box(3.6, 0.15, 0.5, M(0x5a4a3a), 0, 0, 0);
    for (let s = 3; s < this.rail.length; s += 2.2) {
      this.rail.at(s, sample);
      batch.place(sleepers, surfaceMatrix(sample.pos, sample.tangent, sample.up, new THREE.Matrix4()));
    }
    // The tunnel hood covers the start of the rails: carts load and unload inside it, unseen.
    this.rail.at(0, sample);
    batch.place(hood(14, 7.4, 6, 0x6b5a4a), surfaceMatrix(sample.pos.clone().addScaledVector(sample.tangent, 3).addScaledVector(sample.up, -0.2), sample.tangent, sample.up, new THREE.Matrix4()));

    // Crusher plant on the north rim: hopper, chimneys, glowing vents and an outstation for the ore trunk.
    const crusher = new Prefab().box(14, 9, 11, M(0x4a4f5c), 0, 0, 0).box(15, 1, 12, M(0x2f333d), 0, 9, 0).cyl(1.3, 1.5, 10, M(0x5a606c), 4, 9, 2, 10).cyl(1.3, 1.5, 8, M(0x5a606c), -4, 9, 2, 10);
    for (let i = 0; i < 5; i++) crusher.box(1.6, 0.5, 0.15, glowMat(id, 0xff7a2a, 0.15, 2.6), -5.4 + i * 2.7, 5, 5.55);
    crusher.box(8, 0.6, 5, M(0x23262d), 0, 9.5, -3).box(8.4, 2, 0.5, M(0x8a8f99), 0, 9.5, -5.6);
    batch.placeOn(crusher, c, -18, -38, 0.3, 0);

    // Decor: floodlights round the rim, tanks, pylons, a drill rig.
    for (let a = 0; a < Math.PI * 2; a += 0.55) batch.placeOn(lamp(id), c, Math.cos(a) * 34, Math.sin(a) * 34, 0.3, 0);
    for (let i = 0; i < 4; i++) batch.placeOn(tank(0x8b8f97, 2.4, 5), c, 30 + (i % 2) * 6, 10 + Math.floor(i / 2) * 6, 0.3);
    const rig = new Prefab().box(1, 12, 1, M(0xd9a441), 0, 0, 0).box(5, 0.6, 5, M(0x6b7280), 0, 0, 0).box(0.6, 12, 0.6, M(0xd9a441), 1.4, 0, 1.4).box(0.6, 12, 0.6, M(0xd9a441), -1.4, 0, 1.4);
    batch.placeOn(rig, c, -36, 20, 0.3, 0);
    batch.placeOn(rig, c, -38, 28, 0.3, 0.5);

    // Mine shafts of several kinds round the rim, in the blocky timber style: each has hanging lanterns that glow softly
    // at night, with tools, barrels and crates lying about.
    const wood = M(0x6b4a2b);
    const darkWood = M(0x4a3320);
    const lantern = glowMat(id, 0xffb45a, 0.1, 1.1);
    const tunnelDark = M(0x0d0f14);
    /** A timber-framed tunnel mouth cut into the rim, with a rail leading in. */
    const adit = new Prefab().box(5.6, 4.6, 3, M(0x5a4a3a), 0, 0, 0).box(3.2, 3.2, 0.2, tunnelDark, 0, 0, 1.45);
    for (const x of [-1.8, 1.8]) adit.box(0.5, 3.6, 0.6, wood, x, 0, 1.5);
    adit.box(4.6, 0.5, 0.6, wood, 0, 3.4, 1.5).box(0.3, 0.3, 0.3, lantern, -1.4, 2.9, 1.9).box(0.3, 0.3, 0.3, lantern, 1.4, 2.9, 1.9);
    for (const x of [-0.6, 0.6]) adit.box(0.12, 0.1, 5, M(0x9aa4b2), x, 0, 4);
    /** A wooden headframe over a vertical shaft, with a winch wheel and a bucket. */
    const headframe = new Prefab().box(4.4, 0.4, 4.4, darkWood, 0, 0, 0).box(0.5, 8, 0.5, wood, -1.7, 0.4, -1.7).box(0.5, 8, 0.5, wood, 1.7, 0.4, -1.7).box(0.5, 6, 0.5, wood, -1.7, 0.4, 1.7).box(0.5, 6, 0.5, wood, 1.7, 0.4, 1.7);
    headframe.box(4.2, 0.4, 0.4, wood, 0, 8, -1.7).box(0.4, 0.4, 3.8, wood, -1.7, 7.4, 0).box(0.4, 0.4, 3.8, wood, 1.7, 7.4, 0);
    headframe.cyl(1.1, 1.1, 0.4, M(0x8a5a2b), 0, 6.6, -1.7, 12).box(0.12, 5, 0.12, M(0x23262d), 0, 1.4, -1.7).box(1.0, 0.8, 1.0, M(0x6b7280), 0, 0.9, -1.7).box(0.3, 0.3, 0.3, lantern, -1.7, 5.6, 2.0).box(0.3, 0.3, 0.3, lantern, 1.7, 5.6, 2.0);
    /** A scaffolded ladder hatch with railings, lantern posts and a heap of supplies. */
    const hatch = new Prefab().box(3.2, 0.3, 3.2, darkWood, 0, 0, 0).box(1.4, 0.32, 1.4, tunnelDark, 0, 0, 0).box(0.14, 1.2, 0.14, wood, -1.5, 0, -1.5).box(0.14, 1.2, 0.14, wood, 1.5, 0, -1.5).box(0.14, 1.2, 0.14, wood, -1.5, 0, 1.5).box(0.14, 1.2, 0.14, wood, 1.5, 0, 1.5);
    hatch.box(3.1, 0.1, 0.1, wood, 0, 1.0, 1.5).box(3.1, 0.1, 0.1, wood, 0, 1.0, -1.5).box(0.1, 0.1, 3.1, wood, -1.5, 1.0, 0).box(0.1, 0.1, 3.1, wood, 1.5, 1.0, 0);
    hatch.box(0.25, 0.25, 0.25, lantern, -1.5, 1.3, -1.5).box(0.25, 0.25, 0.25, lantern, 1.5, 1.3, 1.5);
    /** Tools and supplies: pickaxes leaning on a post, powder kegs, a lantern crate. */
    const tools = new Prefab().box(0.2, 1.6, 0.2, wood, 0, 0, 0).box(1.0, 0.12, 0.12, M(0x9aa4b2), 0.3, 1.5, 0, 0, 0.3).cyl(0.45, 0.45, 0.9, M(0x7a4f2b), 1.4, 0, 0.5, 8).cyl(0.45, 0.45, 0.9, M(0x7a4f2b), 2.2, 0, -0.2, 8).box(0.9, 0.7, 0.9, M(0xb98a52), -1.2, 0, 0.4).box(0.3, 0.3, 0.3, lantern, -1.2, 0.7, 0.4);
    const spots: [Prefab, number, number, number][] = [
      [adit, 46, -4, -Math.PI / 2],
      [adit, -44, -10, Math.PI / 2],
      [headframe, 44, 22, 0.6],
      [headframe, -42, -2, 0],
      [hatch, 40, -26, 0.3],
      [hatch, -30, 36, 0],
      [tools, 42, -2, 0.4],
      [tools, -42, 12, 1],
      [tools, 28, 30, 2],
    ];
    for (const [pf, x, z, rot] of spots) batch.placeOn(pf, c, x, z, 0.3, rot);

    // Miners walking the rim road.
    const rim = SurfacePath.through(c, Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2) * 36, Math.sin((i / 16) * Math.PI * 2) * 36] as [number, number]).concat([[36, 0]]), 0.4, false, 1);
    const looks: LookName[] = ['corn', 'rice', 'corn', 'wheat', 'rice', 'basmati', 'millet'];
    looks.forEach((look, i) => this.walkers.push({ path: rim, s: (i / looks.length) * rim.length, look, speed: look === 'millet' ? 2.4 : 1.4, phase: i * 1.3 }));
  }

  update(env: Env, night: number): void {
    // Night lighting in the mine is kept low and warm.
    setGlow(this.zone.id, night * 0.55);
    this.trucks.setNight(night);
    this.t += env.dt;
    // Excavator digs in a steady loop.
    const T = 7;
    const u = (this.t % T) / T;
    const dig = Math.sin(u * Math.PI * 2);
    const boomPitch = -0.55 + 0.35 * dig;
    const stickAng = 0.9 - 0.9 * Math.max(0, dig) + 0.5 * Math.min(0, dig);
    const turn = Math.sin(u * Math.PI * 2 - 1.3) * 0.5;
    this.turret.set(m4.makeRotationY(turn * 0.35));
    const boomM = new THREE.Matrix4().makeRotationY(turn).multiply(m5.makeTranslation(0, 2.2, 0.5)).multiply(new THREE.Matrix4().makeRotationX(boomPitch));
    this.boom.set(boomM);
    const stickM = boomM.clone().multiply(m5.makeTranslation(0, 0, 7.6)).multiply(new THREE.Matrix4().makeRotationX(stickAng));
    this.stick.set(stickM);
    this.bucket.set(stickM.clone().multiply(m5.makeTranslation(0, 0, 5)).multiply(new THREE.Matrix4().makeRotationX(0.7 - 0.9 * Math.max(0, dig))));
    if (env.camDist < 200 && dig < -0.9 && Math.random() < env.dt * 6) {
      v3.set(0, 0, 8).applyMatrix4(this.exBase);
      env.fx.emit(v3, v3.clone().normalize().multiplyScalar(2), { color: 0x9b8468, size0: 0.6, size1: 2.4, life: 1.4, alpha: 0.5, drag: 0.6 });
    }
  }

  draw(env: Env, pools: Pools): void {
    this.trucks.begin();
    this.carts.begin();
    this.loads.begin();
    const L = this.ramp.length;
    const vDown = 6.5;
    const vUp = 4.4;
    const tDown = L / vDown;
    const tLoad = 5;
    const tUp = L / vUp;
    const tDump = 5;
    const period = tDown + tLoad + tUp + tDump;
    for (let i = 0; i < 3; i++) {
      const tau = (this.t + (i / 3) * period) % period;
      let s: number;
      let dirSign = 1;
      let load = 0;
      if (tau < tDown) {
        s = (tau / tDown) * L;
      } else if (tau < tDown + tLoad) {
        s = L;
        load = ease((tau - tDown) / tLoad);
      } else if (tau < tDown + tLoad + tUp) {
        s = L - ((tau - tDown - tLoad) / tUp) * L;
        dirSign = -1;
        load = 1;
      } else {
        s = 0;
        dirSign = -1;
        load = 1 - ease((tau - tDown - tLoad - tUp) / tDump);
      }
      this.ramp.at(s, sample);
      // Keep to the right-hand lane in each direction.
      v3.crossVectors(sample.up, sample.tangent).normalize();
      sample.pos.addScaledVector(v3, -1.5 * dirSign);
      surfaceMatrix(sample.pos, dirSign === 1 ? sample.tangent : v3.copy(sample.tangent).negate(), sample.up, m4);
      this.trucks.push(m4);
      if (load > 0.02) {
        sample.pos.addScaledVector(sample.up, 3.4);
        sample.pos.addScaledVector(dirSign === 1 ? sample.tangent : v3.copy(sample.tangent).negate(), -1.1);
        surfaceMatrix(sample.pos, sample.tangent, sample.up, m4, load);
        this.loads.push(m4);
      }
    }

    // Mine carts: out full, tip at the crusher, back empty, load unseen inside the tunnel.
    const Lr = this.rail.length;
    const out = Lr / 6;
    const tip = 4;
    const back = Lr / 6;
    const inTunnel = 7;
    const cyc = out + tip + back + inTunnel;
    for (let c = 0; c < 4; c++) {
      const tau = (this.t * 1 + 3) % cyc;
      let s: number;
      let lane = this.railOut;
      let load = 1;
      let backward = false;
      if (tau < out) {
        s = (tau / out) * Lr;
      } else if (tau < out + tip) {
        s = Lr;
        load = 1 - ease((tau - out) / tip);
      } else if (tau < out + tip + back) {
        s = Lr - ((tau - out - tip) / back) * Lr;
        lane = this.railBack;
        load = 0.05;
        backward = true;
      } else {
        s = 0;
        lane = this.railBack;
        load = ease((tau - out - tip - back) / inTunnel);
        backward = true;
      }
      const sc = backward ? s + c * 3.4 : s - c * 3.4;
      // Carts still inside the tunnel portal are hidden by it.
      if (sc < 7 || sc > Lr + 1) continue;
      lane.at(Math.min(Lr, sc), sample);
      surfaceMatrix(sample.pos, backward ? v3.copy(sample.tangent).negate() : sample.tangent, sample.up, m4);
      this.carts.push(m4);
      if (load > 0.03) {
        sample.pos.addScaledVector(sample.up, 0.95);
        surfaceMatrix(sample.pos, sample.tangent, sample.up, m4, 0.55 * load);
        this.loads.push(m4);
      }
    }
    this.trucks.end();
    this.carts.end();
    this.loads.end();

    if (!this.ambient) {
      this.ambient = new Ambient();
      this.walkers.forEach((w, i) => this.ambient!.add({ path: w.path, s: w.s, speed: w.speed, look: w.look, dir: i % 3 === 0 ? -1 : 1, carry: i % 3 === 1, courier: w.look === 'quinoa', chores: ['inspect', 'clipboard', 'repair', 'wave', 'coffee'] }));
    }
    if (env.camDist < 300) this.ambient.draw(env, pools);
    // Chimney smoke from the crusher.
    this.dustAcc += env.dt * 3;
    while (this.dustAcc >= 1 && env.camDist < 340) {
      this.dustAcc -= 1;
      const p = this.chart.point(-14, -36, 19);
      env.fx.emit(p, p.clone().normalize().multiplyScalar(2.2), { color: 0x7f838c, size0: 1.2, size1: 5, life: 3.4, alpha: 0.4, drag: 0.3 });
    }
  }

  get meshes(): THREE.Object3D[] {
    return [...this.trucks.meshes, this.carts.mesh, this.loads.mesh];
  }
}
