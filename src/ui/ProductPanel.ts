import type { Product } from '../sim/factory';
import { STAGES } from '../sim/stages';
import { progressOf, stageOf, type NormalizedRun } from '../sim/runs';
import { clear, el, formatDuration, safeGithubUrl } from './dom';
import './live.css';

const NOISE = /^(set up job|complete job|post .*|initialize containers|stop containers)$/i;

function icon(status: string, conclusion: string | null): [string, string] {
  if (status === 'completed') {
    if (conclusion === 'success' || conclusion === 'neutral') return ['✓', 'success'];
    if (conclusion === 'skipped') return ['↷', 'skipped'];
    if (conclusion === 'cancelled') return ['⊘', 'cancelled'];
    return ['✗', 'failure'];
  }
  if (status === 'in_progress') return ['●', 'in_progress'];
  return ['○', 'pending'];
}

/** Details for the selected product/run: where it is, what it is, and every step. */
export class ProductPanel {
  private root = el('div', 'product-panel');
  private lastKey = '';
  private lastBuilt = 0;

  constructor(parent: HTMLElement, private onClose: () => void) {
    this.root.style.display = 'none';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Selected run details');
    parent.appendChild(this.root);
  }

  hide(): void {
    this.root.style.display = 'none';
    this.lastKey = '';
  }

  /** Redraws at most twice a second, or immediately when the selection or run state changes. */
  update(key: string | null, product: Product | null, run: NormalizedRun | null, now: number): void {
    if (!key || (!product && !run)) return this.hide();
    const sig = `${key}|${product?.status}|${run?.status}|${run?.updatedAt}|${Math.round((product?.u ?? 0) * 10)}`;
    if (sig === this.lastKey && now - this.lastBuilt < 500) return;
    this.lastKey = sig;
    this.lastBuilt = now;
    this.root.style.display = 'block';
    clear(this.root);

    const status = product?.status ?? (run?.status === 'completed' ? (run.conclusion === 'success' ? 'success' : run.conclusion === 'cancelled' ? 'cancelled' : 'failure') : run?.status ?? 'unknown');
    const head = el('div', 'pp-head');
    const close = el('button', 'pp-close', '✕');
    close.setAttribute('aria-label', 'Close run details');
    close.addEventListener('click', () => this.onClose());
    head.append(el('span', 'pp-title', product?.label ?? `${run?.repo.split('/')[1]} #${run?.runNumber}`), el('span', `pp-chip ${status}`, status.replace('_', ' ')), close);
    this.root.appendChild(head);

    if (!run) {
      this.root.append(el('div', 'pp-sub', 'Demo run'), this.row('Stage', STAGES[Math.min(4, Math.floor(product?.u ?? 0))] ?? 'launchpad'));
      this.root.appendChild(this.track(product?.u ?? 0));
      this.root.appendChild(el('div', 'pp-note', 'Simulated from the Demo Panel. Real runs show their GitHub details here.'));
      return;
    }

    this.root.appendChild(el('div', 'pp-sub', `${run.repo} · ${run.workflow}`));
    this.root.append(this.row('Commit', run.title || run.sha.slice(0, 7)), this.row('Branch', run.branch), this.row('By', run.actor), this.row('Trigger', run.event));
    const started = run.startedAt ?? run.createdAt;
    const end = run.status === 'completed' ? run.updatedAt : now;
    this.root.appendChild(this.row('Elapsed', formatDuration(end - started)));

    const u = product?.u ?? progressOf(run).u;
    this.root.appendChild(this.track(u));

    if (run.jobs?.length) {
      const list = el('ul', 'pp-steps');
      for (const job of run.jobs) {
        const [ji, jc] = icon(job.status, job.conclusion);
        const jl = el('li', 'pp-job');
        jl.append(el('span', `ic ${jc}`, ji + ' '), document.createTextNode(job.name));
        list.appendChild(jl);
        for (const s of job.steps.filter((x) => !NOISE.test(x.name))) {
          const [si, sc] = icon(s.status, s.conclusion);
          const li = el('li', `pp-step ${sc}`);
          const st = stageOf(s.name);
          li.append(el('span', 'ic', si), el('span', 'nm', st === null ? s.name : `${s.name}  → ${STAGES[st]}`));
          list.appendChild(li);
        }
      }
      this.root.appendChild(list);
    } else {
      this.root.appendChild(el('div', 'pp-note', run.status === 'completed' ? 'Step details are only fetched for fresh runs.' : 'Loading steps…'));
    }

    const href = safeGithubUrl(run.url);
    if (href) {
      const a = el('a', '', 'Open run on GitHub ↗');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const wrap = el('div', 'pp-note');
      wrap.appendChild(a);
      this.root.appendChild(wrap);
    }
  }

  private row(label: string, value: string): HTMLElement {
    const r = el('div', 'pp-row');
    r.append(el('b', '', label), el('span', '', value));
    return r;
  }

  private track(u: number): HTMLElement {
    const t = el('div', 'pp-track');
    STAGES.forEach((name, i) => {
      const pip = el('div', `pp-pip${Math.floor(Math.min(u, 4.999)) === i ? ' current' : ''}`);
      const fill = el('i');
      fill.style.transform = `scaleX(${Math.min(1, Math.max(0, u - i))})`;
      pip.append(fill, el('em', '', name));
      t.appendChild(pip);
    });
    return t;
  }
}
