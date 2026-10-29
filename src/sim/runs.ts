import { STAGES, type StageName } from './stages';

/** A workflow job step, as reported by the GitHub Actions API. */
export interface StepInfo {
  name: string;
  number: number;
  status: string;
  conclusion: string | null;
}

export interface JobInfo {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: number | null;
  completedAt: number | null;
  steps: StepInfo[];
}

/** One workflow run, normalised so the factory never touches raw API shapes. */
export interface NormalizedRun {
  /** `owner/repo#runId`, unique across repos. */
  key: string;
  repo: string;
  id: number;
  runNumber: number;
  workflow: string;
  title: string;
  branch: string;
  sha: string;
  event: string;
  actor: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  url: string;
  createdAt: number;
  startedAt: number | null;
  updatedAt: number;
  /** null until the jobs have been fetched. */
  jobs: JobInfo[] | null;
}

export interface StageRule {
  stage: StageName;
  pattern: RegExp;
}

/** First match wins, so more specific stages come first. */
export const DEFAULT_RULES: StageRule[] = [
  { stage: 'dispatch', pattern: /release|deploy|publish|ship|upload|tag\b/i },
  { stage: 'test', pattern: /test|e2e|spec|jest|vitest|pytest|coverage|integration/i },
  { stage: 'lint', pattern: /lint|format|prettier|eslint|style|typecheck|type-check/i },
  { stage: 'build', pattern: /build|compile|bundle|package|assemble|webpack|vite|tsc/i },
  { stage: 'depot', pattern: /checkout|install|setup|set up|cache|restore|depend|download|fetch|clone|npm ci|yarn|pnpm|pip|bundler/i },
];

export function stageOf(name: string, rules: StageRule[] = DEFAULT_RULES): number | null {
  for (const r of rules) if (r.pattern.test(name)) return STAGES.indexOf(r.stage);
  return null;
}

export type Outcome = 'running' | 'success' | 'failure' | 'cancelled';

export interface RunProgress {
  /** Where the product should be on the pipeline (0..5). */
  u: number;
  outcome: Outcome;
  /** Stage index of the failure, when there is one. */
  failAt: number | null;
  /** Stage index the run is currently in. */
  stage: number;
}

type UnitState = 'done' | 'running' | 'pending' | 'failed';
interface Unit {
  stage: number;
  state: UnitState;
}

const NOISE = /^(set up job|complete job|post .*|initialize containers|stop containers)$/i;

function stepState(s: StepInfo): UnitState {
  if (s.status === 'completed') return s.conclusion === 'failure' || s.conclusion === 'timed_out' ? 'failed' : 'done';
  if (s.status === 'in_progress') return 'running';
  return 'pending';
}

function jobState(j: JobInfo): UnitState {
  if (j.status === 'completed') return j.conclusion === 'failure' || j.conclusion === 'timed_out' ? 'failed' : 'done';
  if (j.status === 'in_progress') return 'running';
  return 'pending';
}

/** Turns a run (and its jobs/steps) into a position on the pipeline plus an outcome. */
export function progressOf(run: NormalizedRun, rules: StageRule[] = DEFAULT_RULES): RunProgress {
  const units: Unit[] = [];
  let last = 0;
  for (const job of run.jobs ?? []) {
    const jobStage = stageOf(job.name, rules);
    const steps = job.steps.filter((s) => !NOISE.test(s.name));
    if (!steps.length) {
      const stage = jobStage ?? last;
      units.push({ stage, state: jobState(job) });
      last = stage;
      continue;
    }
    for (const s of steps) {
      const stage = stageOf(s.name, rules) ?? jobStage ?? last;
      units.push({ stage, state: stepState(s) });
      last = stage;
    }
  }

  const failedUnit = units.find((u) => u.state === 'failed');
  const started = units.filter((u) => u.state !== 'pending');
  const lastStarted = started.length ? started[started.length - 1].stage : 0;
  const conc = run.conclusion;
  const finished = run.status === 'completed';

  let outcome: Outcome = 'running';
  if (finished) {
    if (conc === 'success' || conc === 'neutral') outcome = 'success';
    else if (conc === 'failure' || conc === 'timed_out' || conc === 'startup_failure') outcome = 'failure';
    else outcome = 'cancelled';
  } else if (failedUnit) {
    outcome = 'failure';
  }

  const failAt = outcome === 'failure' ? (failedUnit?.stage ?? (units.length ? lastStarted : 2)) : null;

  let u = 0;
  if (run.status === 'queued') {
    u = 0;
  } else if (!units.length) {
    u = 0.3;
  } else {
    u = 4.95;
    for (let s = 0; s < STAGES.length; s++) {
      const inStage = units.filter((x) => x.stage === s);
      if (!inStage.length) continue;
      const done = inStage.filter((x) => x.state === 'done').length;
      if (done < inStage.length) {
        const running = inStage.filter((x) => x.state === 'running').length;
        u = s + (done + 0.5 * running) / inStage.length;
        break;
      }
    }
  }

  if (outcome === 'success') u = 5;
  if (outcome === 'failure') u = (failAt ?? 2) + 0.5;
  return { u, outcome, failAt, stage: Math.min(STAGES.length - 1, Math.floor(u)) };
}
