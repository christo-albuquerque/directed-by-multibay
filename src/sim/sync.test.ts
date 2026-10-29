import { describe, expect, it } from 'vitest';
import { FactoryState } from './factory';
import type { JobInfo, NormalizedRun } from './runs';

const NOW = 1_000_000_000;

function makeRun(id: number, over: Partial<NormalizedRun> = {}, jobs: JobInfo[] | null = null): NormalizedRun {
  return {
    key: `o/r#${id}`,
    repo: 'o/r',
    id,
    runNumber: id,
    workflow: 'CI',
    title: 't',
    branch: 'main',
    sha: 'abc',
    event: 'push',
    actor: 'octo',
    status: 'in_progress',
    conclusion: null,
    url: '',
    createdAt: NOW - 5000,
    startedAt: NOW - 4000,
    updatedAt: NOW - 1000,
    jobs,
    ...over,
  };
}

function job(steps: [string, string, string | null][], over: Partial<JobInfo> = {}): JobInfo {
  return { id: 1, name: 'ci', status: 'in_progress', conclusion: null, startedAt: 0, completedAt: null, steps: steps.map(([name, status, conclusion], i) => ({ name, number: i, status, conclusion })), ...over };
}

function run(s: FactoryState, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) s.update(0.1);
}

describe('FactoryState.syncRuns', () => {
  it('does not replay runs that were already finished when first seen', () => {
    const s = new FactoryState();
    s.syncRuns([makeRun(1, { status: 'completed', conclusion: 'success', updatedAt: NOW - 10_000 })], NOW);
    expect(s.products).toHaveLength(0);
  });

  it('puts an active run on the belt and holds it where the real run has got to', () => {
    const s = new FactoryState();
    const jobs = [job([['Run npm ci', 'completed', 'success'], ['Run npm run build', 'in_progress', null], ['Run npm test', 'pending', null]])];
    s.syncRuns([makeRun(2, {}, jobs)], NOW);
    expect(s.products).toHaveLength(1);
    expect(s.mode).toBe('running');
    run(s, 30);
    const p = s.products[0];
    expect(p.u).toBeGreaterThan(2);
    expect(p.u).toBeLessThan(3);
    expect(p.status).toBe('moving');
  });

  it('launches when the real run succeeds, and fails at the stage of the failed step', () => {
    const s = new FactoryState();
    s.syncRuns([makeRun(3), makeRun(4)], NOW);
    const ok = makeRun(3, { status: 'completed', conclusion: 'success' }, [job([['Run npm ci', 'completed', 'success']], { status: 'completed', conclusion: 'success' })]);
    const bad = makeRun(4, {}, [job([['Run npm ci', 'completed', 'success'], ['Run npm test', 'completed', 'failure']])]);
    s.syncRuns([ok, bad], NOW + 1000);
    run(s, 9);
    expect(s.products.find((p) => p.run?.id === 4)?.status).toBe('failed');
    expect(s.products.find((p) => p.run?.id === 4)?.u).toBeCloseTo(3.5);
    expect(s.products.find((p) => p.run?.id === 3)?.status).toBe('launching');
  });

  it('animates the ending of a run that finishes shortly after we first see it', () => {
    const s = new FactoryState();
    s.syncRuns([], NOW);
    s.syncRuns([makeRun(5, { status: 'completed', conclusion: 'success', updatedAt: NOW - 500 })], NOW);
    expect(s.products).toHaveLength(1);
  });

  it('only demo runs are cancelled by cancelAll', () => {
    const s = new FactoryState();
    s.syncRuns([makeRun(6)], NOW);
    s.spawn();
    s.cancelAll();
    expect(s.products.filter((p) => p.status === 'cancelled')).toHaveLength(1);
  });
});
