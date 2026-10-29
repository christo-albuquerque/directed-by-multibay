import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.add(this.camera);
    const focus = new THREE.Vector3(1, 0, 3.5);
    this.camera.position.copy(focus).add(new THREE.Vector3(24, 20, 24));
    this.camera.zoom = 1;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(focus);
    this.controls.enableDamping = true;
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

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const aspect = w / h;
    // Frame the bay snugly: ~10 world units of half-height on wide screens, widening on narrow ones.
    const halfH = Math.max(14.5, 17 / aspect);
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.elapsedTime;
      for (const u of this.updaters) u(dt, elapsed);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
}
