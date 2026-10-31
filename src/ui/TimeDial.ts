import type { GlobeWorld } from '../globe/GlobeWorld';

const TAU = Math.PI * 2;

/**
 * A small dial showing where the sun is: the handle is a sun by day and a moon at night. Drag it round to set the time of
 * day yourself (the planet stops turning while you hold the time); the "Auto" button lets the days run again.
 */
export class TimeDial {
  private handle: HTMLElement;
  private label: HTMLElement;
  private dragging = false;

  constructor(parent: HTMLElement, private world: GlobeWorld) {
    const root = document.createElement('div');
    root.className = 'time-dial';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Time of day');
    root.style.cssText = 'position:fixed;left:14px;bottom:14px;width:84px;height:84px;z-index:20;user-select:none;touch-action:none;font:600 11px system-ui,sans-serif;color:#cfe8ff';
    root.innerHTML = `
      <svg viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">
        <defs><linearGradient id="td-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="0.5" stop-color="#3b5b8a"/><stop offset="1" stop-color="#0b1020"/></linearGradient></defs>
        <circle cx="42" cy="42" r="34" fill="rgba(8,12,22,.82)" stroke="url(#td-g)" stroke-width="6"/>
      </svg>
      <div class="td-handle" title="Drag to set the time of day" style="position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;font-size:20px;line-height:26px;text-align:center;cursor:grab;filter:drop-shadow(0 0 4px rgba(120,200,255,.6))"></div>
      <button class="td-auto" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:0;background:none;color:inherit;font:inherit;cursor:pointer;padding:4px">Auto</button>`;
    parent.appendChild(root);
    this.handle = root.querySelector('.td-handle') as HTMLElement;
    this.label = root.querySelector('.td-auto') as HTMLButtonElement;
    this.label.addEventListener('click', () => {
      world.frozen = false;
    });

    const toPhase = (e: PointerEvent): number => {
      const r = root.getBoundingClientRect();
      // Angle from straight up, clockwise.
      return (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) + TAU) % TAU;
    };
    this.handle.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      try {
        this.handle.setPointerCapture(e.pointerId);
      } catch {
        // Capture only keeps the drag when the pointer leaves the handle.
      }
      world.frozen = true;
      e.stopPropagation();
    });
    this.handle.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      world.setDayPhase(toPhase(e));
    });
    const end = (): void => {
      this.dragging = false;
    };
    this.handle.addEventListener('pointerup', end);
    this.handle.addEventListener('pointercancel', end);
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  update(): void {
    const phase = ((this.world.phase % TAU) + TAU) % TAU;
    const r = 34;
    this.handle.style.left = `${42 + Math.sin(phase) * r}px`;
    this.handle.style.top = `${42 - Math.cos(phase) * r}px`;
    const night = this.world.nightAt(this.world.controls.focus.clone().normalize());
    this.handle.textContent = night > 0.5 ? '🌙' : '☀️';
    this.label.textContent = this.world.frozen ? 'Locked' : 'Auto';
    this.label.title = this.world.frozen ? 'Time is held where you set it. Click for automatic days.' : 'Days pass on their own. Drag the sun or moon to set the time.';
  }
}
