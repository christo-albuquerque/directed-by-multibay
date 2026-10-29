import { el } from './dom';
import './nav.css';

export interface NavTarget {
  id: string;
  label: string;
  icon: string;
}

/** A row of "fly to" buttons for the planet's districts. */
export class NavPanel {
  private root = el('nav', 'nav-panel');
  private buttons = new Map<string, HTMLButtonElement>();

  constructor(parent: HTMLElement, targets: NavTarget[], onGo: (id: string) => void) {
    this.root.setAttribute('aria-label', 'Fly to a district');
    for (const t of targets) {
      const b = el('button', '', t.icon);
      b.setAttribute('aria-label', t.label);
      b.addEventListener('click', () => onGo(t.id));
      this.buttons.set(t.id, b);
      this.root.appendChild(b);
    }
    parent.appendChild(this.root);
  }

  setLabel(id: string, label: string): void {
    const b = this.buttons.get(id);
    if (b && b.dataset.label !== label) {
      b.dataset.label = label;
      b.textContent = label;
    }
  }
}
