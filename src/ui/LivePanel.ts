import type { PollerMeta } from '../data/github';
import type { NormalizedRun } from '../sim/runs';
import { clear, el } from './dom';
import './live.css';

export interface LiveHandlers {
  onSelect: (key: string) => void;
  onToggle: () => boolean;
  onToken: () => void;
}

function runState(r: NormalizedRun): string {
  if (r.status !== 'completed') return r.status;
  return r.conclusion === 'success' ? 'success' : r.conclusion === 'cancelled' ? 'cancelled' : 'failure';
}

/** Top-left status strip: live connection, API budget and the most recent runs. */
export class LivePanel {
  private root = el('div', 'live-panel');
  private status = el('div', 'live-status');
  private meter = el('div', 'live-meter');
  private error = el('div', 'live-error');
  private list = el('ul', 'live-runs');
  private lastKey = '';

  constructor(parent: HTMLElement, repos: string[], private handlers: LiveHandlers, live: boolean) {
    const head = el('div', 'live-head');
    head.append(el('span', 'live-dot'), el('strong', '', 'LIVE'), el('span', 'live-repos', repos.join(', ')));
    const buttons = el('div', 'live-buttons');
    const toggle = el('button', '', live ? 'Pause' : 'Resume');
    toggle.addEventListener('click', () => (toggle.textContent = handlers.onToggle() ? 'Pause' : 'Resume'));
    const token = el('button', '', '🔑 Token');
    token.title = 'Optional read-only GitHub token (kept in this browser only) for a higher API limit';
    token.addEventListener('click', () => handlers.onToken());
    buttons.append(toggle, token);
    this.root.append(head, this.status, this.meter, this.error, buttons, this.list);
    this.root.classList.toggle('paused', !live);
    parent.appendChild(this.root);
  }

  setPaused(paused: boolean): void {
    this.root.classList.toggle('paused', paused);
  }

  update(meta: PollerMeta | null, runs: NormalizedRun[], selectedKey: string | null, now: number): void {
    const active = runs.filter((r) => r.status !== 'completed').length;
    this.status.textContent = meta?.lastOkAt ? `${active} active · ${runs.length} recent runs` : 'connecting…';

    if (meta && meta.remaining !== null && meta.limit !== null) {
      const secs = Math.max(0, Math.round((meta.nextAt - now) / 1000));
      this.meter.textContent = `API ${meta.remaining}/${meta.limit} left · next check in ${secs}s${meta.authed ? ' · token' : ''}`;
    } else {
      this.meter.textContent = '';
    }
    this.error.textContent = meta?.error ?? '';
    this.error.style.display = meta?.error ? 'block' : 'none';

    const top = [...runs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    const key = top.map((r) => `${r.key}:${runState(r)}:${r.key === selectedKey}`).join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    clear(this.list);
    for (const r of top) {
      const li = el('li', `run ${runState(r)}${r.key === selectedKey ? ' selected' : ''}`);
      li.append(el('span', 'dot'), el('span', 'num', `#${r.runNumber}`), el('span', 'title', `${r.branch} · ${r.title}`));
      li.addEventListener('click', () => this.handlers.onSelect(r.key));
      this.list.appendChild(li);
    }
  }
}
