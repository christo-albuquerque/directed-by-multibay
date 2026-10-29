import * as THREE from 'three';
import { basisAt, R } from './surface';

export const MIN_DIST = 26;
export const MAX_DIST = 560;

export interface View {
  /** Unit direction of the surface point the camera looks at. */
  dir: THREE.Vector3;
  dist: number;
  heading: number;
  tilt: number;
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Camera controls for a planet: drag to turn the globe, wheel/pinch to zoom, right-drag or two fingers to
 * turn and tilt, arrow keys to pan. Zoomed far out you see the whole sphere; zoomed in you look across a district.
 */
export class GlobeControls {
  readonly focus = new THREE.Vector3(0, 0, R);
  private dir = new THREE.Vector3(0, 0.2, 1).normalize();
  private dist = 380;
  private heading = 0;
  private tilt = 0.7;
  private vel = new THREE.Vector2();
  private fly: { from: View; to: View; t: number; dur: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private lastPinch = 0;
  private lastAngle = 0;
  private lastMidY = 0;
  private keys = new Set<string>();
  /** Set false (reduced motion) to stop inertia. */
  inertia = true;
  /** Called when the user takes over from a fly-to. */
  onUserInput: (() => void) | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private el: HTMLElement,
  ) {
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    this.apply();
  }

  get view(): View {
    return { dir: this.dir.clone(), dist: this.dist, heading: this.heading, tilt: this.tilt };
  }

  set(view: Partial<View>): void {
    if (view.dir) this.dir.copy(view.dir).normalize();
    if (view.dist !== undefined) this.dist = view.dist;
    if (view.heading !== undefined) this.heading = view.heading;
    if (view.tilt !== undefined) this.tilt = view.tilt;
    this.apply();
  }

  /** Smoothly travels to a view. */
  flyTo(to: Partial<View>, seconds = 2.2): void {
    const from = this.view;
    const target: View = { dir: (to.dir ?? from.dir).clone().normalize(), dist: to.dist ?? from.dist, heading: to.heading ?? from.heading, tilt: to.tilt ?? from.tilt };
    // Take the short way round in heading.
    target.heading = from.heading + Math.atan2(Math.sin(target.heading - from.heading), Math.cos(target.heading - from.heading));
    this.fly = { from, to: target, t: 0, dur: Math.max(0.01, seconds) };
    this.vel.set(0, 0);
  }

  private cancelFly(): void {
    if (this.fly) {
      this.fly = null;
      this.onUserInput?.();
    }
  }

  private pxToAngle(): number {
    // World units per screen pixel at the focus distance, converted to an angle on the sphere.
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const h = this.el.clientHeight || 1;
    return ((2 * this.dist * Math.tan(fov / 2)) / h) / R;
  }

  private panBy(dx: number, dy: number): void {
    const b = basisAt(this.dir);
    // Heading turns the tangent frame about the local up.
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const right = b.right.clone().multiplyScalar(c).addScaledVector(b.forward, -s);
    const fwd = b.right.clone().multiplyScalar(s).addScaledVector(b.forward, c);
    // Dragging moves the surface under the cursor, so the focus moves the other way. On screen "up" is away
    // from the viewer (toward -fwd), so dragging down brings the focus toward -fwd.
    const k = this.pxToAngle();
    this.dir.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k).normalize();
  }

  private down(e: PointerEvent): void {
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.cancelFly();
    if (this.pointers.size === 2) this.resetPinch();
  }

  private resetPinch(): void {
    const [a, b] = [...this.pointers.values()];
    this.lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
    this.lastAngle = Math.atan2(b.y - a.y, b.x - a.x);
    this.lastMidY = (a.y + b.y) / 2;
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      if (e.buttons & 2 || e.shiftKey) {
        this.heading -= dx * 0.005;
        this.tilt = THREE.MathUtils.clamp(this.tilt - dy * 0.004, 0, 1.25);
      } else {
        this.panBy(dx, dy);
        this.vel.set(dx, dy);
      }
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const midY = (a.y + b.y) / 2;
      if (this.lastPinch > 0) this.dist = THREE.MathUtils.clamp(this.dist * (this.lastPinch / d), MIN_DIST, MAX_DIST);
      this.heading -= Math.atan2(Math.sin(ang - this.lastAngle), Math.cos(ang - this.lastAngle));
      this.tilt = THREE.MathUtils.clamp(this.tilt - (midY - this.lastMidY) * 0.004, 0, 1.25);
      this.lastPinch = d;
      this.lastAngle = ang;
      this.lastMidY = midY;
    }
  }

  private up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1) this.resetPinch();
    if (this.pointers.size === 0 && !this.inertia) this.vel.set(0, 0);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    this.cancelFly();
    this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(e.deltaY * 0.0011), MIN_DIST, MAX_DIST);
  }

  /** How much tilt a given distance allows: whole-planet views look straight down at the globe. */
  private maxTilt(): number {
    return THREE.MathUtils.lerp(1.2, 0, THREE.MathUtils.smoothstep(this.dist, 200, 420));
  }

  update(dt: number): void {
    if (this.fly) {
      const f = this.fly;
      f.t += dt / f.dur;
      const t = ease(Math.min(1, f.t));
      this.dir.copy(f.from.dir).lerp(f.to.dir, t).normalize();
      // Pull back mid-flight so long trips read as a journey over the globe.
      const arc = Math.sin(Math.min(1, f.t) * Math.PI) * Math.min(1, f.from.dir.angleTo(f.to.dir) * 1.1) * 140;
      this.dist = THREE.MathUtils.lerp(f.from.dist, f.to.dist, t) + arc;
      this.heading = THREE.MathUtils.lerp(f.from.heading, f.to.heading, t);
      this.tilt = THREE.MathUtils.lerp(f.from.tilt, f.to.tilt, t);
      if (f.t >= 1) this.fly = null;
    } else {
      const sp = 260 * dt;
      if (this.keys.has('arrowleft') || this.keys.has('a')) this.panBy(sp, 0);
      if (this.keys.has('arrowright') || this.keys.has('d')) this.panBy(-sp, 0);
      if (this.keys.has('arrowup') || this.keys.has('w')) this.panBy(0, sp);
      if (this.keys.has('arrowdown') || this.keys.has('s')) this.panBy(0, -sp);
      if (this.keys.has('q')) this.heading += dt * 1.2;
      if (this.keys.has('e')) this.heading -= dt * 1.2;
      if (this.keys.has('+') || this.keys.has('=')) this.dist = Math.max(MIN_DIST, this.dist * Math.exp(-dt * 1.4));
      if (this.keys.has('-') || this.keys.has('_')) this.dist = Math.min(MAX_DIST, this.dist * Math.exp(dt * 1.4));
      if (this.pointers.size === 0 && this.inertia && this.vel.lengthSq() > 0.01) {
        this.panBy(this.vel.x, this.vel.y);
        this.vel.multiplyScalar(Math.exp(-dt * 4));
      }
    }
    this.tilt = Math.min(this.tilt, this.maxTilt());
    this.apply();
  }

  private apply(): void {
    const b = basisAt(this.dir);
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const fwd = b.right.clone().multiplyScalar(s).addScaledVector(b.forward, c);
    this.focus.copy(this.dir).multiplyScalar(R);
    // The camera sits "south" of the focus (toward the viewer), lifted by the tilt.
    const horiz = Math.sin(this.tilt) * this.dist;
    const vert = Math.cos(this.tilt) * this.dist;
    this.camera.position.copy(this.focus).addScaledVector(b.up, vert).addScaledVector(fwd, horiz);
    this.camera.up.copy(b.up);
    // Whole-planet views would otherwise lean the horizon; keep "north" up there.
    if (this.dist > 300) this.camera.up.lerp(new THREE.Vector3(0, 1, 0), THREE.MathUtils.smoothstep(this.dist, 300, 460)).normalize();
    this.camera.lookAt(this.focus);
  }
}
