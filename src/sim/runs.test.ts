import { describe, expect, it } from 'vitest';
import { progressOf, stageOf, type JobInfo, type NormalizedRun } from './runs';

function step(name: string, status: string, conclusion: string | null = null, number = 1) {
  return { name, status, conclusion, number };
}

function run(partial: Partial<NormalizedRun>, jobs: JobInfo[] | null): NormalizedRun {
  return {
    key: 'o/r#1',
    repo: 'o/r',
    id: 1,
    runNumber: 1,
    workflow: 'CI',
    title: 'Fix things',
    branch: 'main',
    sha: 'abcdef0',
    event: 'push',
    actor: 'octo',
    status: 'in_progress',
    conclusion: null,
    url: 'https://github.com/o/r/actions/runs/1',
    createdAt: 0,
    startedAt: 0,
    updatedAt: 0,
    jobs,
    ...partial,
  };
}

function job(steps: ReturnType<typeof step>[], over: Partial<JobInfo> = {}): JobInfo {
  return { id: 1, name: 'ci', status: 'in_progress', conclusion: null, startedAt: 0, completedAt: null, steps, ...over };
}

describe('stageOf', () => {
  it('maps typical step names', () => {
    expect(stageOf('Run actions/checkout@v4')).toBe(0);
    expect(stageOf('Run npm ci')).toBe(0);
    expect(stageOf('Run npm run lint')).toBe(1);
    expect(stageOf('Run npm run build')).toBe(2);
    expect(stageOf('Run npm test')).toBe(3);
    expect(stageOf('Deploy to GitHub Pages')).toBe(4);
    expect(stageOf('Something unrelated')).toBeNull();
  });
});

describe('progressOf', () => {
  it('waits at the depot while queued', () => {
    const p = progressOf(run({ status: 'queued' }, null));
    expect(p.u).toBe(0);
    expect(p.outcome).toBe('running');
  });

  it('sits in the build stage while a build step runs', () => {
    const p = progressOf(
      run({}, [
        job([
          step('Run actions/checkout@v4', 'completed', 'success'),
          step('Run npm ci', 'completed', 'success'),
          step('Run npm run lint', 'completed', 'success'),
          step('Run npm run build', 'in_progress'),
          step('Run npm test', 'pending'),
        ]),
      ]),
    );
    expect(p.stage).toBe(2);
    expect(p.u).toBeGreaterThan(2);
    expect(p.u).toBeLessThan(3);
    expect(p.outcome).toBe('running');
  });

  it('fails at the stage of the failed step, even before the run completes', () => {
    const p = progressOf(
      run({}, [
        job([
          step('Run npm ci', 'completed', 'success'),
          step('Run npm run build', 'completed', 'success'),
          step('Run npm test', 'completed', 'failure'),
        ]),
      ]),
    );
    expect(p.outcome).toBe('failure');
    expect(p.failAt).toBe(3);
    expect(p.u).toBeCloseTo(3.5);
  });

  it('reaches the launchpad on success and stands down on cancel', () => {
    const done = job([step('Run npm ci', 'completed', 'success')], { status: 'completed', conclusion: 'success' });
    expect(progressOf(run({ status: 'completed', conclusion: 'success' }, [done])).u).toBe(5);
    expect(progressOf(run({ status: 'completed', conclusion: 'cancelled' }, [done])).outcome).toBe('cancelled');
  });

  it('ignores job setup noise and falls back to job names', () => {
    const p = progressOf(run({}, [job([step('Set up job', 'completed', 'success')], { name: 'build' })]));
    expect(p.outcome).toBe('running');
    expect(p.stage).toBeGreaterThanOrEqual(0);
  });
});
