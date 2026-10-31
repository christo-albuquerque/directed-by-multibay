import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { motion } from '../ui/motion';
import { GlobeControls } from './GlobeControls';
import { Sky } from './sky';
import { R } from './surface';
import { buildTerrain } from './terrain';

export type Updater = (dt: number, elapsed: number) => void;

/** Seconds for the planet to turn once relative to its sun. */
const DAY_SECONDS = 900;

/**
 * Renderer, camera, bloom, sun and sky for the whole planet. Quality only ever steps down, in this order:
 * bloom, then pixel ratio, then shadows.
 */
export class GlobeWorld {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(42, 1, 1, 7000);
  readonly controls: GlobeControls;
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  readonly hemi = new THREE.HemisphereLight(0x8fa8ff, 0x2c2236, 1.0);
  /** Unit vector from the planet toward the sun. */
  readonly sunDir = new THREE.Vector3(1, 0.2, 0.3).normalize();
  quality = 3;

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private updaters: Updater[] = [];
  private last = performance.now();
  private elapsed = 0;
  /** Cool light from the dark side of the sky so neon has something to glow against at night. */
  readonly moon = new THREE.DirectionalLight(0x7f9cff, 0.55);
  private slowFrames = 0;
  private sampled = 0;
  private dayPhase = 0.35;
  /** Holds the sun still (for screenshots). */
  frozen = false;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x03040a);
    this.scene.add(this.camera, this.sky.group, buildTerrain(), this.sun, this.sun.target, this.hemi, this.moon);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.8;
    const sc = this.sun.shadow.camera;
    sc.left = -90;
    sc.right = 90;
    sc.top = 90;
    sc.bottom = -90;
    sc.near = 10;
    sc.far = 700;

    this.controls = new GlobeControls(this.camera, this.renderer.domElement);
    // Shown while dragging: the axis the world is being turned about.
    this.scene.add(this.controls.axisGuide);
    this.controls.inertia = !motion.reduced;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.55, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  onUpdate(fn: Updater): void {
    this.updaters.push(fn);
  }

  /** How dark it is at a surface direction: 0 in full sun, 1 in full night. */
  nightAt(dir: THREE.Vector3): number {
    return THREE.MathUtils.smoothstep(-this.sunDir.dot(dir), -0.12, 0.22);
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  private updateSun(dt: number): void {
    // The planet always turns, even when idle: the world should never hold still.
    if (!this.frozen) this.dayPhase += (dt * Math.PI * 2) / DAY_SECONDS;
    this.sunDir.set(Math.sin(this.dayPhase) * 0.95, 0.28 * Math.cos(this.dayPhase * 0.5), Math.cos(this.dayPhase) * 0.95).normalize();
    // Shadows only cover the neighbourhood of what the camera is looking at.
    const f = this.controls.focus;
    this.sun.position.copy(f).addScaledVector(this.sunDir, 320);
    this.sun.target.position.copy(f);
    this.sun.target.updateMatrixWorld();
    // The lit side is bright, the dark side keeps a cool glow so neon has something to stand out against.
    const focusNight = this.nightAt(f.clone().normalize());
    this.sun.intensity = 2.6 * (1 - focusNight * 0.96);
    const ext = THREE.MathUtils.clamp(this.controls.view.dist * 0.5, 40, 130);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - ext) > 2) {
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext;
      sc.bottom = -ext;
      sc.updateProjectionMatrix();
    }
    this.sun.castShadow = this.quality >= 1 && this.controls.view.dist < 300;
    this.moon.position.copy(f).addScaledVector(this.sunDir, -200).add(new THREE.Vector3(0, 120, 0));
    this.moon.target.position.copy(f);
    this.moon.intensity = 0.3 + 0.9 * focusNight;
    this.sky.update(dt, this.sunDir, this.controls.view.dist);
  }

  /** Renders one frame at a custom size and returns it as a JPEG data URL (for README screenshots). */
  capture(width: number, height: number): string {
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
    const aspect = this.camera.aspect;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.quality >= 3) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/jpeg', 0.9);
    this.camera.aspect = aspect;
    this.renderer.setPixelRatio(pr);
    this.resize();
    return url;
  }

  /** For screenshots and testing: jump the sun to a given phase (0 = noon over the default view). */
  setDayPhase(phase: number): void {
    this.dayPhase = phase;
  }

  /** If the frame rate stays low, shed the most expensive effects, one step at a time. */
  private watchFrameRate(raw: number): void {
    if (raw > 0.5 || this.quality === 0) return;
    this.sampled++;
    if (raw > 1 / 34) this.slowFrames++;
    if (this.sampled < 150) return;
    const slow = this.slowFrames / this.sampled > 0.6;
    this.sampled = 0;
    this.slowFrames = 0;
    if (!slow) return;
    this.quality--;
    if (this.quality === 1) {
      this.renderer.setPixelRatio(1);
      this.resize();
    } else if (this.quality === 0) {
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
      const now = performance.now();
      const raw = (now - this.last) / 1000;
      this.last = now;
      this.watchFrameRate(raw);
      const dt = Math.min(raw, 0.1);
      this.elapsed += dt;
      const elapsed = this.elapsed;
      this.controls.update(dt);
      // Keep the near plane tight when zoomed in, so close-ups don't flicker and the far globe still fits.
      const near = THREE.MathUtils.clamp(this.controls.view.dist * 0.03, 0.4, 8);
      if (Math.abs(near - this.camera.near) > 0.05) {
        this.camera.near = near;
        this.camera.updateProjectionMatrix();
      }
      this.updateSun(dt);
      for (const u of this.updaters) u(dt, elapsed);
      if (this.quality >= 3) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    });
  }
}

export { R };
