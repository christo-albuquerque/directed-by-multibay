import type { JobInfo, NormalizedRun } from '../sim/runs';

const API = 'https://api.github.com';

export interface PollerMeta {
  remaining: number | null;
  limit: number | null;
  /** Epoch ms when the rate limit window resets. */
  resetAt: number | null;
  lastOkAt: number | null;
  error: string | null;
  /** When the next poll is due (epoch ms). */
  nextAt: number;
  authed: boolean;
}

export interface PollerOptions {
  repos: () => string[];
  token: () => string | null;
  /** True while the factory is busy, so the poller can speed up. */
  isBusy: () => boolean;
  onRuns: (runs: NormalizedRun[]) => void;
  onMeta: (meta: PollerMeta) => void;
}

interface RawRun {
  id: number;
  run_number: number;
  name: string | null;
  display_title: string | null;
  head_branch: string | null;
  head_sha: string;
  event: string;
  status: string | null;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  run_started_at: string | null;
  updated_at: string;
  actor?: { login: string } | null;
}

interface RawJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps?: { name: string; number: number; status: string; conclusion: string | null }[];
}

const ms = (s: string | null): number | null => (s ? Date.parse(s) : null);

export function normalizeRun(raw: RawRun, repo: string): NormalizedRun {
  const status = raw.status === 'completed' ? 'completed' : raw.status === 'in_progress' ? 'in_progress' : 'queued';
  return {
    key: `${repo}#${raw.id}`,
    repo,
    id: raw.id,
    runNumber: raw.run_number,
    workflow: raw.name ?? 'workflow',
    title: (raw.display_title ?? '').split('\n')[0],
    branch: raw.head_branch ?? '',
    sha: raw.head_sha,
    event: raw.event,
    actor: raw.actor?.login ?? 'unknown',
    status,
    conclusion: raw.conclusion,
    url: raw.html_url,
    createdAt: Date.parse(raw.created_at),
    startedAt: ms(raw.run_started_at),
    updatedAt: Date.parse(raw.updated_at),
    jobs: null,
  };
}

export function normalizeJob(raw: RawJob): JobInfo {
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    conclusion: raw.conclusion,
    startedAt: ms(raw.started_at),
    completedAt: ms(raw.completed_at),
    steps: (raw.steps ?? []).map((s) => ({ name: s.name, number: s.number, status: s.status, conclusion: s.conclusion })),
  };
}

/**
 * Polls GitHub Actions for one or more repos. Unauthenticated access is limited to 60 requests an hour,
 * so the interval adapts to the remaining budget, uses ETags, and only fetches jobs for runs that matter.
 */
export class GitHubPoller {
  private timer: number | undefined;
  private running = false;
  private etags = new Map<string, string>();
  private runCache = new Map<string, NormalizedRun[]>();
  private jobCache = new Map<number, { updatedAt: number; jobs: JobInfo[] }>();
  private errors = 0;
  private requests = 0;
  private cycleNo = 0;
  private meta: PollerMeta = { remaining: null, limit: null, resetAt: null, lastOkAt: null, error: null, nextAt: 0, authed: false };

  constructor(private opts: PollerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.cycle();
  }

  stop(): void {
    this.running = false;
    window.clearTimeout(this.timer);
  }

  /** Poll again right away (e.g. after a token or repo change). */
  refresh(): void {
    if (!this.running) return;
    window.clearTimeout(this.timer);
    this.etags.clear();
    void this.cycle();
  }

  private async cycle(): Promise<void> {
    if (!this.running) return;
    this.requests = 0;
    const token = this.opts.token();
    this.meta.authed = !!token;
    let fatal: number | null = null;
    const all: NormalizedRun[] = [];

    this.cycleNo++;
    for (const repo of this.opts.repos()) {
      try {
        // While a run is in flight only its jobs change quickly, so refresh the (rate-limited) run list
        // every third cycle, or as soon as every job of an active run has finished.
        const cached = this.runCache.get(repo);
        const active = cached?.filter((r) => r.status !== 'completed') ?? [];
        const jobsFinished = active.length > 0 && active.every((r) => (this.jobCache.get(r.id)?.jobs ?? []).length > 0 && (this.jobCache.get(r.id)?.jobs ?? []).every((j) => j.status === 'completed'));
        const skipRuns = !!cached && active.length > 0 && !jobsFinished && this.cycleNo % 3 !== 0;
        const runs = skipRuns ? cached : await this.fetchRuns(repo, token);
        await this.attachJobs(repo, runs, token);
        all.push(...runs.map((r) => ({ ...r, jobs: this.jobCache.get(r.id)?.jobs ?? null })));
        this.meta.error = null;
        this.meta.lastOkAt = Date.now();
        this.errors = 0;
      } catch (e) {
        this.errors++;
        const err = e as { status?: number; message?: string };
        this.meta.error = this.describe(repo, err);
        if (err.status === 403 || err.status === 429) fatal = err.status;
        // Serve whatever we have cached so the factory keeps its picture.
        all.push(...(this.runCache.get(repo) ?? []).map((r) => ({ ...r, jobs: this.jobCache.get(r.id)?.jobs ?? null })));
      }
    }

    this.opts.onRuns(all);
    const delay = this.nextDelay(all, fatal !== null);
    this.meta.nextAt = Date.now() + delay;
    this.opts.onMeta({ ...this.meta });
    if (this.running) this.timer = window.setTimeout(() => void this.cycle(), delay);
  }

  private describe(repo: string, e: { status?: number; message?: string }): string {
    if (e.status === 404) return `${repo}: not found, or private (add a token)`;
    if (e.status === 403 || e.status === 429) return 'rate limited by GitHub; waiting for the window to reset';
    if (e.status === 401) return 'token rejected by GitHub';
    return e.message ?? 'network error';
  }

  private nextDelay(runs: NormalizedRun[], rateLimited: boolean): number {
    const authed = this.meta.authed;
    const busy = this.opts.isBusy() || runs.some((r) => r.status !== 'completed');
    let base = authed ? (busy ? 5_000 : 30_000) : busy ? 20_000 : 90_000;
    if (document.hidden) base *= 4;
    const { remaining, resetAt } = this.meta;
    if (remaining !== null && resetAt !== null) {
      const secs = Math.max(1, (resetAt - Date.now()) / 1000);
      // Spread what's left of the budget over the time left, per request this cycle.
      base = Math.max(base, (secs / Math.max(1, remaining - 3)) * Math.max(1, this.requests) * 1000);
      if (remaining <= 3 || rateLimited) base = Math.max(base, resetAt - Date.now() + 1_000);
    }
    if (this.errors > 0) base = Math.max(base, Math.min(300_000, 5_000 * 2 ** this.errors));
    return Math.min(base, 3_600_000);
  }

  private async get(url: string, token: string | null, etag?: string): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (etag) headers['If-None-Match'] = etag;
    this.requests++;
    // GitHub sends `max-age=60`, which would otherwise make the browser serve stale data for a minute.
    const res = await fetch(url, { headers, cache: 'no-store' });
    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');
    const reset = res.headers.get('x-ratelimit-reset');
    if (remaining !== null) this.meta.remaining = Number(remaining);
    if (limit !== null) this.meta.limit = Number(limit);
    if (reset !== null) this.meta.resetAt = Number(reset) * 1000;
    return res;
  }

  private async fetchRuns(repo: string, token: string | null): Promise<NormalizedRun[]> {
    const res = await this.get(`${API}/repos/${repo}/actions/runs?per_page=15`, token, this.etags.get(repo));
    if (res.status === 304) return this.runCache.get(repo) ?? [];
    if (!res.ok) throw Object.assign(new Error(`GitHub returned ${res.status}`), { status: res.status });
    const etag = res.headers.get('etag');
    if (etag) this.etags.set(repo, etag);
    const body = (await res.json()) as { workflow_runs: RawRun[] };
    const runs = body.workflow_runs.map((r) => normalizeRun(r, repo));
    this.runCache.set(repo, runs);
    return runs;
  }

  /** Fetches jobs for runs that are active (or just finished), at most a few per cycle. */
  private async attachJobs(repo: string, runs: NormalizedRun[], token: string | null): Promise<void> {
    const now = Date.now();
    const wanted = runs
      .filter((r) => r.status !== 'completed' || now - r.updatedAt < 180_000)
      // Active runs are always refreshed (steps change without the run's own timestamp moving).
      .filter((r) => r.status !== 'completed' || this.jobCache.get(r.id)?.updatedAt !== r.updatedAt)
      .sort((a, b) => Number(b.status !== 'completed') - Number(a.status !== 'completed'))
      .slice(0, 4);
    for (const r of wanted) {
      const res = await this.get(`${API}/repos/${repo}/actions/runs/${r.id}/jobs?per_page=30`, token);
      if (!res.ok) throw Object.assign(new Error(`GitHub returned ${res.status}`), { status: res.status });
      const body = (await res.json()) as { jobs: RawJob[] };
      this.jobCache.set(r.id, { updatedAt: r.updatedAt, jobs: body.jobs.map(normalizeJob) });
    }
  }
}
