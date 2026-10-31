import * as THREE from 'three';
import { basisAt, R } from './surface';

export const MIN_DIST = 26;
export const MAX_DIST = 560;

/** The most a single pointer event may move the view (px), and the fastest the glide after a flick may be (px/frame). */
const MAX_STEP = 90;
const MAX_FLING = 28;

export interface View {
  /** Unit direction of the surface point the camera looks at. */
  dir: THREE.Vector3;
  dist: number;
  heading: number;
  tilt: number;
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const tmpQ = new THREE.Quaternion();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/**
 * Camera controls for a planet: drag to turn the globe, wheel/pinch to zoom, right-drag or two fingers to
 * turn and tilt, arrow keys to pan. Zoomed far out you see the whole sphere; zoomed in you look across a district.
 *
 * The camera's orientation is a tangent vector that is carried along as the focus moves over the sphere (parallel
 * transport), never measured against a fixed "north". A heading measured from north is undefined at the poles, which
 * used to make the view snap and spin when dragged across one.
 */
export class GlobeControls {
  readonly focus = new THREE.Vector3(0, 0, R);
  private dir = new THREE.Vector3(0, 0.2, 1).normalize();
  /** Unit tangent at the focus that points toward the viewer ("south" on screen); carried along as the focus moves. */
  private fwd = new THREE.Vector3();
  private dist = 380;
  private heading = 0;
  private tilt = 0.7;
  private vel = new THREE.Vector2();
  private fly: { from: View; to: View; t: number; dur: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private lastPinch = 0;
  private lastAngle = 0;
  private lastMidY = 0;
  private lastMove = 0;
  private keys = new Set<string>();
  /** A glowing line through the planet (with a ring round it) showing what the globe is being rotated about. */
  readonly axisGuide = new THREE.Group();
  private axisMats: THREE.Material[] = [];
  private axisVec = new THREE.Vector3(0, 1, 0);
  private axisAlpha = 0;
  /** Set false (reduced motion) to stop inertia. */
  inertia = true;
  /** While set, the camera keeps this world position in the middle of the screen (until it returns null or the user drags). */
  private followFn: (() => THREE.Vector3 | null) | null = null;
  private followDist = 0;
  /** Called when following ends (the target left the world, or the user took over). */
  onFollowEnd: (() => void) | null = null;
  /** Called when the user takes over from a fly-to. */
  onUserInput: (() => void) | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private el: HTMLElement,
  ) {
    this.fromHeading(this.heading);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0, depthTest: false });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0, depthTest: false });
    this.axisMats = [lineMat, ringMat];
    const half = R + 90;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -half, 0), new THREE.Vector3(0, half, 0)]), lineMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 4, 0.35, 6, 96), ringMat);
    ring.rotation.x = Math.PI / 2;
    for (const o of [line, ring]) {
      o.renderOrder = 50;
      o.frustumCulled = false;
    }
    this.axisGuide.add(line, ring);
    this.axisGuide.visible = false;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('lostpointercapture', (e) => this.up(e));
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    // A tab that loses focus mid-drag must not leave a key or finger "held".
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointers.clear();
      this.vel.set(0, 0);
    });
    this.apply();
  }

  get view(): View {
    return { dir: this.dir.clone(), dist: this.dist, heading: this.heading, tilt: this.tilt };
  }

  set(view: Partial<View>): void {
    if (view.dir) {
      const next = view.dir.clone().normalize();
      this.carry(this.dir, next);
      this.dir.copy(next);
    }
    if (view.heading !== undefined) this.fromHeading(view.heading);
    if (view.dist !== undefined) this.dist = view.dist;
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

  /** Follows a moving thing: the camera glides after it and settles at dist from the surface. */
  follow(target: () => THREE.Vector3 | null, dist = 45): void {
    this.fly = null;
    this.followFn = target;
    this.followDist = dist;
    this.vel.set(0, 0);
  }

  get following(): boolean {
    return this.followFn !== null;
  }

  stopFollow(): void {
    if (!this.followFn) return;
    this.followFn = null;
    this.onFollowEnd?.();
  }

  private followStep(dt: number): void {
    const p = this.followFn ? this.followFn() : null;
    if (!p) {
      this.stopFollow();
      return;
    }
    const next = tmpB.copy(p).normalize();
    const old = this.dir.clone();
    this.dir.lerp(next, 1 - Math.exp(-dt * 5)).normalize();
    this.carry(old, this.dir);
    if (this.followDist > 0) this.dist += (this.followDist - this.dist) * (1 - Math.exp(-dt * 1.5));
  }

  private cancelFly(): void {
    if (this.fly) {
      this.fly = null;
      this.onUserInput?.();
    }
  }

  /** Sets the camera's facing from a heading measured against north at the current focus. */
  private fromHeading(h: number): void {
    const b = basisAt(this.dir);
    this.fwd.copy(b.right).multiplyScalar(Math.sin(h)).addScaledVector(b.forward, Math.cos(h)).normalize();
  }

  /** Rotates the facing along with a move of the focus from one direction to another. */
  private carry(from: THREE.Vector3, to: THREE.Vector3): void {
    if (from.dot(to) < 0.9999999) {
      tmpQ.setFromUnitVectors(from, to);
      this.fwd.applyQuaternion(tmpQ);
    }
    this.fwd.addScaledVector(to, -this.fwd.dot(to));
    if (this.fwd.lengthSq() < 1e-8) this.fromHeading(this.heading);
    this.fwd.normalize();
  }

  private pxToAngle(): number {
    // World units per screen pixel at the focus distance, converted to an angle on the sphere.
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const h = this.el.clientHeight || 1;
    return ((2 * this.dist * Math.tan(fov / 2)) / h) / R;
  }

  private panBy(dx: number, dy: number): void {
    // Dragging moves the surface under the cursor, so the focus moves the other way. On screen "up" is away
    // from the viewer (toward -fwd), so dragging down brings the focus toward -fwd.
    const k = this.pxToAngle();
    const right = tmpA.crossVectors(this.dir, this.fwd).normalize(); // up x fwd
    const next = tmpB.copy(this.dir).addScaledVector(right, -dx * k).addScaledVector(this.fwd, -dy * k);
    if (!Number.isFinite(next.x + next.y + next.z) || next.lengthSq() < 1e-6) return;
    next.normalize();
    const old = this.dir.clone();
    this.dir.copy(next);
    this.carry(old, next);
  }

  /** Lights up the rotation guide about an axis (smoothed, so a jittery drag does not make it flicker). */
  private showAxis(axis: THREE.Vector3): void {
    if (!Number.isFinite(axis.x + axis.y + axis.z) || axis.lengthSq() < 1e-6) return;
    // Axes are lines: flip to the side nearest the last one so it never swings through the opposite direction.
    if (axis.dot(this.axisVec) < 0) axis.negate();
    this.axisVec.lerp(axis, this.axisAlpha > 0.05 ? 0.25 : 1).normalize();
    this.axisAlpha = 1;
  }

  private updateAxis(dt: number): void {
    if (this.pointers.size === 0) this.axisAlpha = Math.max(0, this.axisAlpha - dt / 0.5);
    this.axisGuide.visible = this.axisAlpha > 0.01;
    if (!this.axisGuide.visible) return;
    this.axisGuide.quaternion.setFromUnitVectors(tmpA.set(0, 1, 0), this.axisVec);
    for (const m of this.axisMats) (m as THREE.Material & { opacity: number }).opacity = 0.75 * this.axisAlpha;
  }

  /** Turns the camera about the focus. */
  private turn(dh: number): void {
    this.fwd.applyAxisAngle(this.dir, dh);
  }

  private down(e: PointerEvent): void {
    try {
      this.el.setPointerCapture?.(e.pointerId);
    } catch {
      // Capture is only a convenience (it keeps the drag when the pointer leaves the canvas).
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.vel.set(0, 0);
    this.stopFollow();
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
    const dx = THREE.MathUtils.clamp(e.clientX - p.x, -MAX_STEP, MAX_STEP);
    const dy = THREE.MathUtils.clamp(e.clientY - p.y, -MAX_STEP, MAX_STEP);
    p.x = e.clientX;
    p.y = e.clientY;
    this.lastMove = performance.now();
    if (this.pointers.size === 1) {
      if (e.buttons & 2 || e.shiftKey) {
        this.showAxis(this.dir.clone());
        this.turn(-dx * 0.005);
        this.tilt = THREE.MathUtils.clamp(this.tilt - dy * 0.004, 0, 1.25);
      } else {
        if (dx !== 0 || dy !== 0) {
          // The globe turns about the axis perpendicular to both the focus direction and the direction it is dragged.
          const right = tmpA.crossVectors(this.dir, this.fwd);
          const move = tmpB.copy(right).multiplyScalar(-dx).addScaledVector(this.fwd, -dy).normalize();
          this.showAxis(new THREE.Vector3().crossVectors(this.dir, move).normalize());
        }
        this.panBy(dx, dy);
        // Smooth the flick so one jittery event cannot launch the globe.
        this.vel.lerp(tmpA.set(dx, dy), 0.5);
        if (this.vel.length() > MAX_FLING) this.vel.setLength(MAX_FLING);
      }
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const midY = (a.y + b.y) / 2;
      if (this.lastPinch > 0 && d > 1) this.dist = THREE.MathUtils.clamp(this.dist * THREE.MathUtils.clamp(this.lastPinch / d, 0.8, 1.25), MIN_DIST, MAX_DIST);
      this.showAxis(this.dir.clone());
      this.turn(-Math.atan2(Math.sin(ang - this.lastAngle), Math.cos(ang - this.lastAngle)));
      this.tilt = THREE.MathUtils.clamp(this.tilt - (midY - this.lastMidY) * 0.004, 0, 1.25);
      this.lastPinch = d;
      this.lastAngle = ang;
      this.lastMidY = midY;
      this.vel.set(0, 0);
    }
  }

  private up(e: PointerEvent): void {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size === 1) {
      this.resetPinch();
      this.vel.set(0, 0);
    }
    // Only a finger that was still moving when it lifted may glide on.
    if (this.pointers.size === 0 && (!this.inertia || performance.now() - this.lastMove > 90)) this.vel.set(0, 0);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    this.stopFollow();
    this.cancelFly();
    this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(THREE.MathUtils.clamp(e.deltaY, -300, 300) * 0.0011), MIN_DIST, MAX_DIST);
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
      this.dir.copy(f.from.dir).lerp(f.to.dir, t);
      if (this.dir.lengthSq() < 1e-6) this.dir.copy(f.to.dir);
      this.dir.normalize();
      // Pull back mid-flight so long trips read as a journey over the globe.
      const arc = Math.sin(Math.min(1, f.t) * Math.PI) * Math.min(1, f.from.dir.angleTo(f.to.dir) * 1.1) * 140;
      this.dist = THREE.MathUtils.lerp(f.from.dist, f.to.dist, t) + arc;
      this.fromHeading(THREE.MathUtils.lerp(f.from.heading, f.to.heading, t));
      this.tilt = THREE.MathUtils.lerp(f.from.tilt, f.to.tilt, t);
      if (f.t >= 1) this.fly = null;
    } else {
      const sp = 260 * Math.min(dt, 0.05);
      if (this.keys.has('arrowleft') || this.keys.has('a')) this.panBy(sp, 0);
      if (this.keys.has('arrowright') || this.keys.has('d')) this.panBy(-sp, 0);
      if (this.keys.has('arrowup') || this.keys.has('w')) this.panBy(0, sp);
      if (this.keys.has('arrowdown') || this.keys.has('s')) this.panBy(0, -sp);
      if (this.keys.has('q')) this.turn(dt * 1.2);
      if (this.keys.has('e')) this.turn(-dt * 1.2);
      if (this.keys.has('+') || this.keys.has('=')) this.dist = Math.max(MIN_DIST, this.dist * Math.exp(-dt * 1.4));
      if (this.keys.has('-') || this.keys.has('_')) this.dist = Math.min(MAX_DIST, this.dist * Math.exp(dt * 1.4));
      if (this.followFn && this.pointers.size === 0) this.followStep(dt);
      if (this.pointers.size === 0 && this.inertia && this.vel.lengthSq() > 0.01) {
        // Glide scaled to frame time, so a slow frame cannot throw the globe.
        this.panBy(this.vel.x * Math.min(dt * 60, 2), this.vel.y * Math.min(dt * 60, 2));
        this.vel.multiplyScalar(Math.exp(-dt * 5));
      }
    }
    this.tilt = Math.min(this.tilt, this.maxTilt());
    this.apply();
    this.updateAxis(dt);
  }

  private apply(): void {
    // Keep the facing exactly tangent and unit length however many small moves have been carried.
    this.fwd.addScaledVector(this.dir, -this.fwd.dot(this.dir));
    if (this.fwd.lengthSq() < 1e-8) this.fromHeading(this.heading);
    this.fwd.normalize();
    // Heading as seen from north, for presets and fly-to (it is only a read-out; the pole makes it undefined there).
    const b = basisAt(this.dir);
    this.heading = Math.atan2(this.fwd.dot(b.right), this.fwd.dot(b.forward));
    this.focus.copy(this.dir).multiplyScalar(R);
    // The camera sits "south" of the focus (toward the viewer), lifted by the tilt.
    const horiz = Math.sin(this.tilt) * this.dist;
    const vert = Math.cos(this.tilt) * this.dist;
    this.camera.position.copy(this.focus).addScaledVector(this.dir, vert).addScaledVector(this.fwd, horiz);
    // Screen-up is built from the carried frame, in the plane of the view: straight down it is "away from the viewer",
    // looking across it is the surface normal. Using the surface normal as "up" (as before) is parallel to the view
    // when the tilt reaches 0, and lookAt then picks a random roll, which spun the globe wildly on the next drag.
    const ct = Math.cos(this.tilt);
    const st = Math.sin(this.tilt);
    this.camera.up.copy(this.dir).multiplyScalar(st).addScaledVector(this.fwd, -ct).normalize();
    this.camera.lookAt(this.focus);
  }
}
