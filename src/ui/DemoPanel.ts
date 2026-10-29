import type { FactoryMode, FactoryStats } from '../sim/factory';
import './panel.css';

export interface DemoAction {
  label: string;
  /** May return a new label, for toggle buttons. */
  run: () => void | string;
  wide?: boolean;
}

/** Floating control panel for forcing every factory state without GitHub. */
export class DemoPanel {
  private modeEl: HTMLElement;
  private statsEl: HTMLElement;
  private targetEl: HTMLSelectElement;
  private lastKey = '';

  /** Index of the bay the demo buttons act on. */
  get target(): number {
    return Math.max(0, this.targetEl.selectedIndex);
  }

  /** Lists the bays in the "Demo bay" dropdown (hidden when there is only one). */
  setTargets(labels: string[]): void {
    const keep = this.target;
    this.targetEl.textContent = '';
    labels.forEach((l, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = l;
      this.targetEl.appendChild(o);
    });
    this.targetEl.selectedIndex = Math.min(keep, labels.length - 1);
    this.targetEl.parentElement!.style.display = labels.length > 1 ? 'flex' : 'none';
  }

  constructor(parent: HTMLElement, actions: DemoAction[]) {
    const root = document.createElement('div');
    root.className = 'demo-panel';
    root.innerHTML = `<header><strong>DEMO PANEL</strong><span class="mode" data-mode="idle">idle</span></header><label class="target" style="display:none">Demo bay <select></select></label><div class="grid"></div><div class="stats"></div>`;
    this.targetEl = root.querySelector('select') as HTMLSelectElement;
    const header = root.querySelector('header') as HTMLElement;
    header.addEventListener('click', () => root.classList.toggle('collapsed'));
    this.modeEl = root.querySelector('.mode') as HTMLElement;
    this.statsEl = root.querySelector('.stats') as HTMLElement;

    const grid = root.querySelector('.grid') as HTMLElement;
    for (const a of actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (a.wide) b.className = 'wide';
      b.addEventListener('click', () => {
        const label = a.run();
        if (typeof label === 'string') b.textContent = label;
      });
      grid.appendChild(b);
    }
    parent.appendChild(root);
  }

  update(mode: FactoryMode, stats: FactoryStats): void {
    const key = `${mode}|${stats.succeeded}|${stats.failed}|${stats.cancelled}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.modeEl.textContent = mode === 'idle' ? 'idle · ramen' : mode;
    this.modeEl.dataset.mode = mode;
    this.statsEl.textContent = `launched ${stats.succeeded} · failed ${stats.failed} · cancelled ${stats.cancelled}`;
  }
}
