import * as THREE from 'three';
import { assignBreakSeats, setGroundLayout } from '../agents/Crowd';
import type { Product, FactoryMode, FactoryStats } from '../sim/factory';
import { BayUnit } from './BayUnit';
import { Courtyard } from './Courtyard';
import { updateGlow } from './glow';
import { planLayout, type Layout } from './layoutPlan';
import { Lighting } from './Lighting';
import type { Particles } from './Particles';
import { buildPlanet } from './Planet';
import { Weather } from './Weather';
import type { World } from './World';

export interface RepoSpec {
  repo: string;
  label: string;
}

/** The whole factory: one bay unit per repo, a shared planet, break plazas, weather and lighting. */
export class FactoryWorld {
  units: BayUnit[] = [];
  layout: Layout = planLayout(1);
  private root = new THREE.Group();
  private courtyard: Courtyard | null = null;
  private weather = new Weather();
  /** Forced storm from the Demo Panel. */
  forceStorm = false;

  constructor(
    private world: World,
    private lighting: Lighting,
    private fx: Particles,
  ) {
    world.scene.add(this.root, this.weather.group);
  }

  /** Throws away the current factory and builds one bay per repo. Live runs reappear on the next poll. */
  rebuild(repos: RepoSpec[]): void {
    this.world.scene.remove(this.root);
    this.root = new THREE.Group();
    this.world.scene.add(this.root);

    this.layout = planLayout(repos.length);
    setGroundLayout(this.layout);
    this.courtyard = new Courtyard(this.layout.plazas);
    this.units = repos.slice(0, this.layout.bayZ.length).map((r, i) => new BayUnit(r.repo, `BAY ${i + 1} · ${r.label}`, this.layout.bayZ[i], this.fx));
    assignBreakSeats(this.units.map((u) => u.crowd), this.courtyard.seats);

    this.root.add(buildPlanet(this.layout), this.courtyard.group);
    for (const u of this.units) this.root.add(u.group, u.crowd.group);

    this.world.setFraming(this.layout.center, this.layout.fit);
    this.lighting.setExtent(this.layout.center, this.layout.radius);
    this.weather.setBounds(this.layout.bounds);
  }

  /** Overall mood: failure beats release beats running beats idle. */
  get mode(): FactoryMode {
    const modes = this.units.map((u) => u.state.mode);
    for (const m of ['failure', 'release', 'running'] as const) if (modes.includes(m)) return m;
    return 'idle';
  }

  get anyIdle(): boolean {
    return this.units.some((u) => u.state.mode === 'idle');
  }

  get stats(): FactoryStats {
    const total = { succeeded: 0, failed: 0, cancelled: 0 };
    for (const u of this.units) {
      total.succeeded += u.state.stats.succeeded;
      total.failed += u.state.stats.failed;
      total.cancelled += u.state.stats.cancelled;
    }
    return total;
  }

  get storm(): boolean {
    return this.forceStorm || this.units.some((u) => u.state.consecutiveFailures >= 3);
  }

  findProduct(key: string | null): { product: Product; unit: BayUnit } | null {
    if (!key) return null;
    for (const unit of this.units) {
      const product = unit.state.products.find((p) => p.key === key);
      if (product) return { product, unit };
    }
    return null;
  }

  setSelected(key: string | null): void {
    for (const u of this.units) u.products.setSelected(key);
  }

  pickProduct(ndc: THREE.Vector2, camera: THREE.Camera): string | null {
    for (const u of this.units) {
      const key = u.products.pick(ndc, camera);
      if (key) return key;
    }
    return null;
  }

  pickWorker(ndc: THREE.Vector2, camera: THREE.Camera): ReturnType<BayUnit['crowd']['pick']> {
    for (const u of this.units) {
      const w = u.crowd.pick(ndc, camera);
      if (w) return w;
    }
    return null;
  }

  update(dt: number, elapsed: number): void {
    this.weather.update(dt, this.storm);
    this.lighting.update(dt, this.mode, this.weather.amount);
    updateGlow(this.lighting.night);
    this.courtyard?.update(dt, this.anyIdle, this.fx);
    for (const u of this.units) u.update(dt, elapsed, this.fx, this.lighting.night);
  }
}
