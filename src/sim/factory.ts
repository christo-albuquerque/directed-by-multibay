export const STAGES = ['depot', 'lint', 'build', 'test', 'dispatch'] as const;
export type StageName = (typeof STAGES)[number];

/** Path position at which a product reaches the launchpad. */
export const LAUNCHPAD_U = STAGES.length;

export type ProductStatus = 'moving' | 'failed' | 'cancelled' | 'launching' | 'launched';
export type FactoryMode = 'idle' | 'running' | 'failure' | 'release';

export interface Product {
  id: number;
  label: string;
  /** Continuous position along the pipeline: integer part = stage index, 5 = launchpad. */
  u: number;
  status: ProductStatus;
  /** Stage index at which this product is doomed to fail, or null. */
  failAt: number | null;
  /** Seconds spent in the current terminal-ish status. */
  age: number;
}

export interface SpawnOptions {
  failAt?: StageName | null;
  label?: string;
}

export interface FactoryStats {
  succeeded: number;
  failed: number;
  cancelled: number;
}

/** Pure, render-free pipeline simulation. Mode is derived from the products present. */
export class FactoryState {
  products: Product[] = [];
  stats: FactoryStats = { succeeded: 0, failed: 0, cancelled: 0 };
  /** Stages travelled per second. */
  speed = 0.35;
  /** How long wreckage stays on screen. */
  lingerSeconds = 6;
  launchSeconds = 7;
  private nextId = 1;

  spawn(opts: SpawnOptions = {}): Product {
    const failAt = opts.failAt ? STAGES.indexOf(opts.failAt) : null;
    const product: Product = {
      id: this.nextId++,
      label: opts.label ?? `run-${this.nextId - 1}`,
      u: 0,
      status: 'moving',
      failAt,
      age: 0,
    };
    this.products.push(product);
    return product;
  }

  cancelAll(): void {
    for (const p of this.products) {
      if (p.status === 'moving') {
        p.status = 'cancelled';
        p.age = 0;
        this.stats.cancelled++;
      }
    }
  }

  update(dt: number): void {
    for (const p of this.products) {
      if (p.status === 'moving') {
        p.u += this.speed * dt;
        if (p.failAt !== null && p.u >= p.failAt + 0.5) {
          p.u = p.failAt + 0.5;
          p.status = 'failed';
          p.age = 0;
          this.stats.failed++;
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
        }
      }
    }
    this.products = this.products.filter(
      (p) => p.status !== 'launched' && !((p.status === 'failed' || p.status === 'cancelled') && p.age >= this.lingerSeconds),
    );
  }

  get mode(): FactoryMode {
    if (this.products.some((p) => p.status === 'failed')) return 'failure';
    if (this.products.some((p) => p.status === 'launching')) return 'release';
    if (this.products.some((p) => p.status === 'moving')) return 'running';
    return 'idle';
  }

  /** Age of the oldest product currently launching, or null. */
  get launchAge(): number | null {
    const launching = this.products.filter((p) => p.status === 'launching');
    return launching.length ? Math.max(...launching.map((p) => p.age)) : null;
  }
}
