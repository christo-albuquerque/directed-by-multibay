import { describe, expect, it } from 'vitest';
import { normalizeJob, normalizeRun } from './github';

describe('normalizeRun', () => {
  const raw = {
    id: 42,
    run_number: 7,
    name: 'CI',
    display_title: 'Fix the thing\n\nLonger body',
    head_branch: 'main',
    head_sha: 'abcdef1234567',
    event: 'push',
    status: 'in_progress',
    conclusion: null,
    html_url: 'https://github.com/o/r/actions/runs/42',
    created_at: '2026-10-29T10:00:00Z',
    run_started_at: '2026-10-29T10:00:05Z',
    updated_at: '2026-10-29T10:01:00Z',
    actor: { login: 'octo' },
  };

  it('normalises a run and keeps only the first line of the title', () => {
    const r = normalizeRun(raw, 'o/r');
    expect(r.key).toBe('o/r#42');
    expect(r.title).toBe('Fix the thing');
    expect(r.status).toBe('in_progress');
    expect(r.actor).toBe('octo');
    expect(r.createdAt).toBe(Date.parse('2026-10-29T10:00:00Z'));
    expect(r.jobs).toBeNull();
  });

  it('treats waiting/pending/requested as queued and tolerates missing fields', () => {
    const r = normalizeRun({ ...raw, status: 'waiting', actor: null, display_title: null, head_branch: null, name: null }, 'o/r');
    expect(r.status).toBe('queued');
    expect(r.actor).toBe('unknown');
    expect(r.title).toBe('');
    expect(r.workflow).toBe('workflow');
  });
});

describe('normalizeJob', () => {
  it('copies steps and tolerates jobs with none', () => {
    const j = normalizeJob({ id: 1, name: 'build', status: 'completed', conclusion: 'success', started_at: '2026-10-29T10:00:00Z', completed_at: null, steps: [{ name: 'Run npm ci', number: 1, status: 'completed', conclusion: 'success' }] });
    expect(j.steps).toHaveLength(1);
    expect(j.startedAt).toBe(Date.parse('2026-10-29T10:00:00Z'));
    expect(j.completedAt).toBeNull();
    expect(normalizeJob({ id: 2, name: 'x', status: 'queued', conclusion: null, started_at: null, completed_at: null }).steps).toEqual([]);
  });
});
