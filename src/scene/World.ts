import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { motion } from '../ui/motion';

export type Updater = (dt: number, elapsed: number) => void;

/** Renderer, isometric camera, controls and the main loop. */
export class World {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
  readonly controls: OrbitControls;
  private updaters: Updater[] = [];
  private clock = new THREE.Clock();

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // Phones get a lower pixel ratio: the scene is busy and they have the least GPU to spare.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.add(this.camera);
    const focus = new THREE.Vector3(1, 0, 3.5);
    this.camera.position.copy(focus).add(new THREE.Vector3(24, 20, 24));
    this.camera.zoom = 1;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(focus);
    this.controls.enableDamping = !motion.reduced;
    // Arrow keys pan the view, so the factory can be explored without a mouse.
    this.controls.listenToKeyEvents(window);
    this.controls.keyPanSpeed = 14;
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 3;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.45;
    this.controls.update();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  onUpdate(fn: Updater): void {
    this.updaters.push(fn);
  }

  private fit = 27;

  /** Frames the whole factory: aim at its centre and zoom out as it grows. */
  setFraming(center: { x: number; z: number }, fit: number): void {
    this.fit = fit;
    const focus = new THREE.Vector3(center.x, 0, center.z);
    this.controls.target.copy(focus);
    this.camera.position.copy(focus).add(new THREE.Vector3(24, 20, 24));
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.resize();
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const aspect = w / h;
    // Frame the factory snugly; bigger factories zoom out in proportion.
    const scale = Math.max(1, this.fit / 27);
    const halfH = Math.max(14.5 * scale, (12.5 * scale) / aspect);
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private slowFrames = 0;
  private sampled = 0;
  private quality = 2;

  /**
   * Big factories can overwhelm weaker GPUs. If the frame rate stays low, first drop to a plain pixel ratio, then
   * switch shadows off. Never steps back up, so it can't flap.
   */
  private watchFrameRate(raw: number): void {
    if (raw > 0.5 || this.quality === 0) return; // a stalled or backgrounded tab says nothing about the GPU
    this.sampled++;
    if (raw > 1 / 36) this.slowFrames++;
    if (this.sampled < 120) return;
    const slow = this.slowFrames / this.sampled > 0.6;
    this.sampled = 0;
    this.slowFrames = 0;
    if (!slow) return;
    this.quality--;
    if (this.quality === 1) {
      this.renderer.setPixelRatio(1);
      this.resize();
    } else {
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const raw = this.clock.getDelta();
      this.watchFrameRate(raw);
      const dt = Math.min(raw, 0.1);
      const elapsed = this.clock.elapsedTime;
      for (const u of this.updaters) u(dt, elapsed);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
}
