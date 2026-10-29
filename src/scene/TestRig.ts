import * as THREE from 'three';
import type { Product } from '../sim/factory';
import { HEAD_UP, IMPACT_PHASE, SHOT_PHASE, testPose } from './choreography';
import { BELT_Y, PATH_X } from './layout';
import type { Particles } from './Particles';
import { box, cyl, mat, shadowAll } from './util';

const BEAM_Y = 4.7;
const HEAD_H = 0.35;
const X = PATH_X[3];
const CANNON_Z = 2.4;
const CANNON_Y = 0.75;
const BARREL_LEN = 1.3;
const BARREL_PITCH = 0.25;

const MUZZLE = new THREE.Vector3(X, CANNON_Y + Math.sin(BARREL_PITCH) * BARREL_LEN, CANNON_Z - Math.cos(BARREL_PITCH) * BARREL_LEN);

/** The test stage hardware: a crane head that lifts and squashes, and a cannon that fires at the product. */
export class TestRig {
  private head = new THREE.Group();
  private rope: THREE.Mesh;
  private barrel: THREE.Mesh;
  private ball: THREE.Mesh;
  private recoil = 0;
  private prevPhase = -1;
  private prevId = -1;
  private tmp = new THREE.Vector3();

  constructor(parent: THREE.Object3D) {
    const g = new THREE.Group();
    // Crane: post beside the belt, beam reaching over it, rope and head.
    g.add(box(0.35, BEAM_Y, 0.35, 0x64748b, X + 1.4, 0.2, -1.0));
    g.add(box(1.7, 0.3, 0.3, 0x64748b, X + 0.55, BEAM_Y, -1.0));
    g.add(box(0.3, 0.3, 1.1, 0x64748b, X, BEAM_Y, -0.55));
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), mat(0x1f2937));
    g.add(this.rope);
    this.head.add(box(1.15, HEAD_H, 1.15, 0x94a3b8), box(0.5, 0.2, 0.5, 0xf59e0b, 0, HEAD_H));
    g.add(this.head);

    // Cannon on two wheels, aimed across the belt.
    const cannon = new THREE.Group();
    cannon.position.set(X, 0, CANNON_Z);
    cannon.add(box(0.8, 0.25, 0.9, 0x475569, 0, 0.2, 0));
    for (const s of [-1, 1]) {
      const w = cyl(0.3, 0.3, 0.12, 0x1f2937, s * 0.5, 0.2, 0, 12);
      w.rotation.z = Math.PI / 2;
      w.position.y = 0.5;
      cannon.add(w);
    }
    this.barrel = cyl(0.22, 0.32, BARREL_LEN, 0x334155, 0, 0, 0, 12);
    this.barrel.rotation.x = -(Math.PI / 2 - BARREL_PITCH);
    // Place the barrel's middle so its base sits at the cannon mount.
    const dir = new THREE.Vector3(0, Math.sin(BARREL_PITCH), -Math.cos(BARREL_PITCH));
    this.barrel.position.copy(dir.clone().multiplyScalar(BARREL_LEN / 2)).add(new THREE.Vector3(0, CANNON_Y, 0));
    cannon.add(this.barrel);
    g.add(cannon);

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(0x111318));
    this.ball.visible = false;
    g.add(this.ball);

    shadowAll(g);
    parent.add(g);
    this.setHead(HEAD_UP);
  }

  private setHead(bottomY: number): void {
    this.head.position.set(X, bottomY, 0);
    const top = bottomY + HEAD_H + 0.2;
    const len = Math.max(0.05, BEAM_Y - top);
    this.rope.scale.y = len;
    this.rope.position.set(X, top + len / 2, 0);
  }

  update(dt: number, product: Product | null, fx: Particles): void {
    if (!product) {
      this.setHead(HEAD_UP);
      this.ball.visible = false;
      this.prevPhase = -1;
    } else {
      if (product.id !== this.prevId) {
        this.prevId = product.id;
        this.prevPhase = -1;
      }
      const phase = Math.min(Math.max(product.u - 3, 0), 1);
      const pose = testPose(phase);
      this.setHead(pose.headY);

      if (pose.ballT !== null) {
        const t = pose.ballT;
        const target = this.tmp.set(X, BELT_Y + 0.45 + pose.dy, 0);
        this.ball.position.lerpVectors(MUZZLE, target, t);
        this.ball.position.y += Math.sin(t * Math.PI) * 0.2;
        this.ball.visible = true;
      } else {
        this.ball.visible = false;
      }

      if (this.prevPhase < SHOT_PHASE && phase >= SHOT_PHASE) {
        this.recoil = 1;
        fx.burst(MUZZLE, 10, 1.4, 1.2, new THREE.Vector3(0, 0.3, -1), { color: 0xffb84a, size0: 0.25, size1: 0.7, life: 0.45, alpha: 0.9 });
        fx.burst(MUZZLE, 8, 0.8, 1, new THREE.Vector3(0, 0.4, -0.4), { color: 0xbfc4cc, size0: 0.3, size1: 1.1, life: 1.2, alpha: 0.5 });
      }
      if (this.prevPhase < IMPACT_PHASE && phase >= IMPACT_PHASE) {
        const p = new THREE.Vector3(X, BELT_Y + 0.5, 0.35);
        fx.burst(p, 12, 2.2, 2, new THREE.Vector3(0, 0.6, 0.4), { color: 0xe8dcc0, size0: 0.2, size1: 0.6, life: 0.6, alpha: 0.9, gravity: -4 });
        fx.burst(p, 6, 0.8, 1, new THREE.Vector3(0, 0.5, 0.2), { color: 0xa8a29a, size0: 0.3, size1: 1.0, life: 1.1, alpha: 0.5 });
      }
      this.prevPhase = phase;
    }
    this.recoil = Math.max(0, this.recoil - dt * 4);
    this.barrel.position.z = (-Math.cos(BARREL_PITCH) * BARREL_LEN) / 2 + this.recoil * 0.25;
  }
}
