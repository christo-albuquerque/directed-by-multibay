import { isRepoName } from '../config';
import type { PollerMeta } from '../data/github';
import { MAX_BAYS } from '../scene/layoutPlan';
import type { NormalizedRun } from '../sim/runs';
import { clear, el } from './dom';
import './live.css';

export interface LiveHandlers {
  onSelect: (key: string) => void;
  onToggle: () => boolean;
  onToken: () => void;
  /** Called with the new full list whenever the user adds or removes a repo. */
  onRepos: (repos: string[]) => void;
}

function runState(r: NormalizedRun): string {
  if (r.status !== 'completed') return r.status;
  return r.conclusion === 'success' ? 'success' : r.conclusion === 'cancelled' ? 'cancelled' : 'failure';
}

/** Top-left status strip: live connection, API budget, the repos feeding the factory and recent runs. */
export class LivePanel {
  private root = el('div', 'live-panel');
  private repoLine = el('span', 'live-repos');
  private status = el('div', 'live-status');
  private meter = el('div', 'live-meter');
  private error = el('div', 'live-error');
  private editor = el('div', 'live-editor');
  private repoList = el('ul', 'live-repolist');
  private editorError = el('div', 'live-error');
  private list = el('ul', 'live-runs');
  private lastKey = '';
  private repos: string[];

  constructor(parent: HTMLElement, repos: string[], private handlers: LiveHandlers, live: boolean) {
    this.repos = repos;
    const head = el('div', 'live-head');
    head.append(el('span', 'live-dot'), el('strong', '', 'LIVE'), this.repoLine);
    const buttons = el('div', 'live-buttons');
    const toggle = el('button', '', live ? 'Pause' : 'Resume');
    toggle.addEventListener('click', () => (toggle.textContent = handlers.onToggle() ? 'Pause' : 'Resume'));
    const reposBtn = el('button', '', '📂 Repos');
    reposBtn.title = 'Choose which GitHub repos feed the factory (one bay each)';
    reposBtn.addEventListener('click', () => this.editor.classList.toggle('open'));
    const token = el('button', '', '🔑 Token');
    token.title = 'Optional read-only GitHub token (kept in this browser only) for a higher API limit';
    token.addEventListener('click', () => handlers.onToken());
    buttons.append(toggle, reposBtn, token);

    this.buildEditor();
    this.root.append(head, this.status, this.meter, this.error, buttons, this.editor, this.list);
    this.root.classList.toggle('paused', !live);
    this.renderRepos();
    parent.appendChild(this.root);
  }

  private buildEditor(): void {
    const form = el('form', 'live-add');
    const input = el('input');
    input.type = 'text';
    input.placeholder = 'owner/repo';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 100;
    const add = el('button', '', 'Add');
    add.type = 'submit';
    form.append(input, add);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '');
      const err = !isRepoName(name)
        ? 'Use the form owner/repo'
        : this.repos.some((r) => r.toLowerCase() === name.toLowerCase())
          ? 'Already added'
          : this.repos.length >= MAX_BAYS
            ? `At most ${MAX_BAYS} repos`
            : '';
      this.showEditorError(err);
      if (err) return;
      input.value = '';
      this.handlers.onRepos([...this.repos, name]);
    });
    this.editor.append(el('div', 'live-hint', `Each repo gets its own bay (up to ${MAX_BAYS}). Public repos work without a token.`), this.repoList, form, this.editorError);
  }

  private showEditorError(msg: string): void {
    this.editorError.textContent = msg;
    this.editorError.style.display = msg ? 'block' : 'none';
  }

  private renderRepos(): void {
    this.repoLine.textContent = this.repos.join(', ');
    clear(this.repoList);
    for (const r of this.repos) {
      const li = el('li', 'live-repo');
      li.append(el('span', '', r));
      const rm = el('button', 'rm', '✕');
      rm.title = this.repos.length > 1 ? 'Remove this repo' : 'At least one repo is needed';
      rm.disabled = this.repos.length <= 1;
      rm.addEventListener('click', () => this.handlers.onRepos(this.repos.filter((x) => x !== r)));
      li.appendChild(rm);
      this.repoList.appendChild(li);
    }
  }

  setRepos(repos: string[]): void {
    this.repos = repos;
    this.lastKey = '';
    this.showEditorError('');
    this.renderRepos();
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

    const multi = new Set(runs.map((r) => r.repo)).size > 1;
    const top = [...runs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    const key = top.map((r) => `${r.key}:${runState(r)}:${r.key === selectedKey}`).join('|') + multi;
    if (key === this.lastKey) return;
    this.lastKey = key;
    clear(this.list);
    for (const r of top) {
      const li = el('li', `run ${runState(r)}${r.key === selectedKey ? ' selected' : ''}`);
      const where = multi ? `${r.repo.split('/')[1]} · ` : '';
      li.append(el('span', 'dot'), el('span', 'num', `#${r.runNumber}`), el('span', 'title', `${where}${r.branch} · ${r.title}`));
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-pressed', String(r.key === selectedKey));
      li.addEventListener('click', () => this.handlers.onSelect(r.key));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handlers.onSelect(r.key);
        }
      });
      this.list.appendChild(li);
    }
  }
}
