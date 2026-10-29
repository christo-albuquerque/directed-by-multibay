import type { FactoryMode, FactoryStats } from '../sim/factory';
import './panel.css';

export interface DemoAction {
  label: string;
  run: () => void;
  wide?: boolean;
}

/** Floating control panel for forcing every factory state without GitHub. */
export class DemoPanel {
  private modeEl: HTMLElement;
  private statsEl: HTMLElement;
  private lastKey = '';

  constructor(parent: HTMLElement, actions: DemoAction[]) {
    const root = document.createElement('div');
    root.className = 'demo-panel';
    root.innerHTML = `<header><strong>DEMO PANEL</strong><span class="mode" data-mode="idle">idle</span></header><div class="grid"></div><div class="stats"></div>`;
    const header = root.querySelector('header') as HTMLElement;
    header.addEventListener('click', () => root.classList.toggle('collapsed'));
    this.modeEl = root.querySelector('.mode') as HTMLElement;
    this.statsEl = root.querySelector('.stats') as HTMLElement;

    const grid = root.querySelector('.grid') as HTMLElement;
    for (const a of actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (a.wide) b.className = 'wide';
      b.addEventListener('click', a.run);
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
