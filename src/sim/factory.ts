import { progressOf, type NormalizedRun, type RunProgress } from './runs';
import { LAUNCHPAD_U, STAGES, type StageName } from './stages';

export { LAUNCHPAD_U, STAGES, type StageName };

export type ProductStatus = 'moving' | 'failed' | 'cancelled' | 'launching' | 'launched';
export type FactoryMode = 'idle' | 'running' | 'failure' | 'release';

export interface Product {
  id: number;
  /** Stable identity: `demo-<id>` for demo runs, the run key for live ones. */
  key: string;
  label: string;
  /** Continuous position along the pipeline: integer part = stage index, 5 = launchpad. */
  u: number;
  status: ProductStatus;
  /** Stage index at which this product is doomed to fail, or null. */
  failAt: number | null;
  /** Seconds spent in the current terminal-ish status. */
  age: number;
  /** For live products: how far the real run has got. The product travels there and waits. */
  target?: number;
  /** Pull-request style build: goes out on a courier drone instead of a rocket. Demo runs set this directly. */
  pr?: boolean;
  /** Latest snapshot of the real GitHub run behind this product. */
  run?: NormalizedRun;
  progress?: RunProgress;
}

export interface SpawnOptions {
  failAt?: StageName | null;
  label?: string;
  /** Launch on a courier drone (a pull-request build) rather than a rocket. */
  pr?: boolean;
}

export interface FactoryStats {
  succeeded: number;
  failed: number;
  cancelled: number;
}

/** A run that finished within this window of its first sighting still gets its ending animated. */
const REPLAY_WINDOW_MS = 120_000;

/** Pure, render-free pipeline simulation. Mode is derived from the products present. */
export class FactoryState {
  products: Product[] = [];
  stats: FactoryStats = { succeeded: 0, failed: 0, cancelled: 0 };
  /** Stages travelled per second. */
  speed = 0.35;
  /** Failures since the last successful launch; drives the storm clouds. */
  consecutiveFailures = 0;
  /** How long wreckage stays on screen (long enough for the rescue crew to arrive and work). */
  lingerSeconds = 9;
  launchSeconds = 7;
  /** Live runs started in the last ten minutes. */
  recentRuns = 0;
  private nextId = 1;
  private tracked = new Map<string, Product>();
  private known = new Set<string>();
  private baselined = false;

  spawn(opts: SpawnOptions = {}): Product {
    const failAt = opts.failAt ? STAGES.indexOf(opts.failAt) : null;
    const id = this.nextId++;
    const product: Product = {
      id,
      key: `demo-${id}`,
      label: opts.label ?? `run-${id}`,
      u: 0,
      status: 'moving',
      failAt,
      age: 0,
      pr: opts.pr,
    };
    this.products.push(product);
    return product;
  }

  /** Cancels demo runs; live runs are cancelled by GitHub, not by the panel. */
  cancelAll(): void {
    for (const p of this.products) if (!p.run) this.cancel(p);
  }

  private cancel(p: Product): void {
    if (p.status !== 'moving') return;
    p.status = 'cancelled';
    p.age = 0;
    this.stats.cancelled++;
  }

  /**
   * Reconciles real workflow runs with the factory. Runs already finished when we first look are not
   * replayed; active runs appear on the belt, move as far as the real run has got, and finish for real.
   */
  syncRuns(runs: NormalizedRun[], nowMs: number): void {
    const ordered = [...runs].sort((a, b) => a.createdAt - b.createdAt);
    for (const run of ordered) {
      let p = this.tracked.get(run.key);
      if (!p) {
        if (this.known.has(run.key)) continue;
        const finished = run.status === 'completed';
        if (finished && (!this.baselined || nowMs - run.updatedAt > REPLAY_WINDOW_MS)) {
          this.known.add(run.key);
          continue;
        }
        p = this.spawnRun(run);
      }
      this.applyRun(p, run);
    }
    this.baselined = true;
    this.recentRuns = runs.filter((r) => nowMs - r.createdAt < 600_000).length;
  }

  private spawnRun(run: NormalizedRun): Product {
    const id = this.nextId++;
    const p: Product = { id, key: run.key, label: `${run.repo.split('/')[1] ?? run.repo} #${run.runNumber}`, u: 0, status: 'moving', failAt: null, age: 0, target: 0, run };
    this.products.push(p);
    this.tracked.set(run.key, p);
    return p;
  }

  private applyRun(p: Product, run: NormalizedRun): void {
    p.run = run;
    if (p.status !== 'moving') return;
    const progress = progressOf(run);
    p.progress = progress;
    if (progress.outcome === 'cancelled') {
      this.cancel(p);
    } else if (progress.outcome === 'failure') {
      p.failAt = progress.failAt;
      p.target = progress.u;
    } else {
      p.target = Math.max(p.target ?? 0, progress.u);
    }
    if (p.target !== undefined && p.u > p.target) p.u = p.target;
  }

  update(dt: number): void {
    for (const p of this.products) {
      if (p.status === 'moving') {
        if (p.target === undefined) {
          p.u += this.speed * dt;
        } else {
          // Live product: head for where the real run is, catching up faster when far behind.
          const goal = p.failAt !== null ? Math.min(p.target, p.failAt + 0.5) : p.target;
          const gap = goal - p.u;
          if (gap > 0) p.u += Math.min(gap, Math.max(this.speed, gap * 0.8) * dt);
        }
        if (p.failAt !== null && p.u >= p.failAt + 0.5) {
          p.u = p.failAt + 0.5;
          p.status = 'failed';
          p.age = 0;
          this.stats.failed++;
          this.consecutiveFailures++;
        } else if (p.u >= LAUNCHPAD_U) {
          p.u = LAUNCHPAD_U;
          p.status = 'launching';
          p.age = 0;
        }
      } else {
        p.age += dt;
        if (p.status === 'launching' && p.age >= this.launchSeconds) {
          p.status = 'launched';
          this.stats.succeeded++;
          this.consecutiveFailures = 0;
        }
      }
    }
    this.products = this.products.filter((p) => {
      const gone = p.status === 'launched' || ((p.status === 'failed' || p.status === 'cancelled') && p.age >= this.lingerSeconds);
      if (gone && p.run) {
        this.tracked.delete(p.key);
        this.known.add(p.key);
      }
      return !gone;
    });
  }

  get mode(): FactoryMode {
    if (this.products.some((p) => p.status === 'failed')) return 'failure';
    if (this.products.some((p) => p.status === 'launching')) return 'release';
    if (this.products.some((p) => p.status === 'moving')) return 'running';
    return 'idle';
  }

  /** 0..1: how busy the factory should look, from active runs and recent history. */
  get activity(): number {
    // Demo runs count for more so a single button press already looks lively.
    let load = 0.04 * this.recentRuns;
    for (const p of this.products) if (p.status === 'moving' || p.status === 'launching') load += p.run ? 0.3 : 0.55;
    return Math.min(1, load);
  }

  /** What leaves the pad: main/tag builds go by rocket, pull-request builds by courier drone. */
  get launchKind(): 'rocket' | 'drone' {
    const p = this.products.find((x) => x.status === 'launching');
    return p && (p.pr || p.run?.event === 'pull_request') ? 'drone' : 'rocket';
  }

  /** Age of the oldest product currently launching, or null. */
  get launchAge(): number | null {
    const launching = this.products.filter((p) => p.status === 'launching');
    return launching.length ? Math.max(...launching.map((p) => p.age)) : null;
  }
}
