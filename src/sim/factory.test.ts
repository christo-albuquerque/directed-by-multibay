import { describe, expect, it } from 'vitest';
import { FactoryState, LAUNCHPAD_U } from './factory';

function run(state: FactoryState, seconds: number, step = 0.1): void {
  for (let t = 0; t < seconds; t += step) state.update(step);
}

describe('FactoryState', () => {
  it('is idle with no products', () => {
    expect(new FactoryState().mode).toBe('idle');
  });

  it('runs a product to the launchpad and counts a success', () => {
    const s = new FactoryState();
    s.spawn();
    expect(s.mode).toBe('running');
    run(s, LAUNCHPAD_U / s.speed + 0.5);
    expect(s.mode).toBe('release');
    expect(s.launchAge).not.toBeNull();
    run(s, s.launchSeconds + 0.5);
    expect(s.mode).toBe('idle');
    expect(s.stats.succeeded).toBe(1);
  });

  it('fails at the requested stage and clears the wreckage', () => {
    const s = new FactoryState();
    const p = s.spawn({ failAt: 'test' });
    run(s, 3.5 / s.speed + 0.5);
    expect(p.status).toBe('failed');
    expect(p.u).toBeCloseTo(3.5);
    expect(s.mode).toBe('failure');
    run(s, s.lingerSeconds + 0.5);
    expect(s.mode).toBe('idle');
    expect(s.stats.failed).toBe(1);
  });

  it('counts consecutive failures and resets them on a launch', () => {
    const s = new FactoryState();
    s.speed = 2;
    for (let i = 0; i < 3; i++) s.spawn({ failAt: 'lint' });
    run(s, 2);
    expect(s.consecutiveFailures).toBe(3);
    s.spawn();
    run(s, LAUNCHPAD_U / s.speed + s.launchSeconds + 1);
    expect(s.consecutiveFailures).toBe(0);
  });

  it('cancels moving products only', () => {
    const s = new FactoryState();
    s.spawn();
    s.update(1);
    s.cancelAll();
    expect(s.products[0].status).toBe('cancelled');
    expect(s.stats.cancelled).toBe(1);
    run(s, s.lingerSeconds + 0.5);
    expect(s.products).toHaveLength(0);
  });
});
