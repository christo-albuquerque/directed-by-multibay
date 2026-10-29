import * as THREE from 'three';
import { PATH_X } from './Bay';
import { box, cyl, makeLabel, mat, shadowAll } from './util';

/** Seconds of countdown before liftoff, measured from the start of the launching status. */
const COUNTDOWN = 2.5;

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

  constructor() {
    this.group.position.set(PATH_X[5] + 1.5, 0, 0);

    const pad = cyl(3.2, 3.4, 0.35, 0x8d8a85, 0, 0.1, 0, 28);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 6, 36), mat(0xf4c542));
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
  update(dt: number, elapsed: number, launchAge: number | null): void {
    if (launchAge === null) {
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
      this.drawBoard(`T-${left}`);
      this.rocket.position.x = Math.sin(elapsed * 60) * 0.02 * (launchAge / COUNTDOWN);
    } else {
      const t = launchAge - COUNTDOWN;
      this.drawBoard('LIFTOFF!');
      this.rocket.position.x = 0;
      this.rocket.position.y = 0.5 + t * t * 2.2;
      this.flame.visible = true;
      this.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    }
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
