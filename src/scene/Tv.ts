import * as THREE from 'three';
import type { FactoryMode, FactoryStats } from '../sim/factory';
import { box } from './util';

export type TvChannel = 'metrics' | 'lab';

const W = 320;
const H = 180;

/** Wall-mounted TV drawn to a canvas texture. Shows metrics normally, the end-credits card on failure. */
export class Tv {
  readonly group = new THREE.Group();
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private screen: THREE.Mesh;
  private nextDraw = 0;
  private spark: number[] = Array.from({ length: 32 }, (_, i) => 0.5 + Math.sin(i * 0.5) * 0.25);

  constructor(private channel: TvChannel, width = 2.4) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;

    const height = width * (H / W);
    const frame = box(width + 0.2, height + 0.2, 0.18, 0x15171d);
    frame.position.y = 0;
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.screen.position.z = 0.1;
    this.group.add(frame, this.screen);
    this.draw('idle', { succeeded: 0, failed: 0, cancelled: 0 }, 0);
  }

  update(mode: FactoryMode, stats: FactoryStats, elapsed: number): void {
    // Failure card glitches fast; everything else redraws a few times a second.
    const interval = mode === 'failure' ? 0.07 : 0.4;
    if (elapsed < this.nextDraw) return;
    this.nextDraw = elapsed + interval;
    this.draw(mode, stats, elapsed);
  }

  private draw(mode: FactoryMode, stats: FactoryStats, t: number): void {
    if (mode === 'failure') {
      this.drawCredits(t);
    } else if (this.channel === 'metrics') {
      this.drawMetrics(mode, stats, t);
    } else {
      this.drawLab(mode, t);
    }
    this.tex.needsUpdate = true;
  }

  private drawCredits(t: number): void {
    const c = this.ctx;
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    const glitch = Math.sin(t * 40) > 0.85 ? (Math.random() - 0.5) * 8 : 0;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#e8e2d6';
    c.font = '600 22px system-ui, sans-serif';
    c.fillText('DIRECTED BY', W / 2 + glitch, H / 2 - 28);
    c.font = '900 52px system-ui, sans-serif';
    c.fillStyle = '#ff3b2f';
    c.fillText('MULTIBAY', W / 2 - glitch + 1.5, H / 2 + 22);
    c.fillStyle = '#f5f0e6';
    c.fillText('MULTIBAY', W / 2 - glitch, H / 2 + 20);
    if (Math.sin(t * 40) > 0.9) {
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(0, Math.random() * H, W, 6);
    }
  }

  private drawMetrics(mode: FactoryMode, stats: FactoryStats, t: number): void {
    const c = this.ctx;
    c.fillStyle = '#0b1220';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#6ee7b7';
    c.font = '700 16px ui-monospace, Consolas, monospace';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText('KEPLER-22b QA METRICS', 12, 10);
    c.fillStyle = '#cbd5e1';
    c.font = '14px ui-monospace, Consolas, monospace';
    const total = stats.succeeded + stats.failed + stats.cancelled;
    const rate = total ? Math.round((stats.succeeded / total) * 100) : 100;
    c.fillText(`PASSED   ${stats.succeeded}`, 12, 40);
    c.fillText(`FAILED   ${stats.failed}`, 12, 62);
    c.fillText(`CANCELLED ${stats.cancelled}`, 12, 84);
    c.fillText(`PASS RATE ${rate}%`, 12, 106);
    c.fillStyle = mode === 'idle' ? '#fbbf24' : '#6ee7b7';
    c.fillText(mode === 'idle' ? 'STATUS: ON BREAK' : 'STATUS: ' + mode.toUpperCase(), 12, 128);

    // Sparkline of simulated throughput.
    if (mode !== 'idle') this.spark.push(Math.min(0.95, Math.max(0.05, this.spark[this.spark.length - 1] + (Math.sin(t * 7) + (Math.random() - 0.5)) * 0.12)));
    else this.spark.push(0.1);
    if (this.spark.length > 32) this.spark.shift();
    c.strokeStyle = '#38bdf8';
    c.lineWidth = 2;
    c.beginPath();
    this.spark.forEach((v, i) => {
      const x = 12 + (i / 31) * (W - 24);
      const y = H - 12 - v * 26;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.stroke();
  }

  private drawLab(mode: FactoryMode, t: number): void {
    const c = this.ctx;
    c.fillStyle = '#07140d';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#4ade80';
    c.font = '700 14px ui-monospace, Consolas, monospace';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText('STRESS LAB', 12, 8);
    const names = ['drop_from_2m', 'cannon_volley', 'squash_test', 'shake_n_bake', 'yeet_suite'];
    names.forEach((n, i) => {
      const active = mode !== 'idle' && Math.floor(t * 1.5) % names.length === i;
      c.fillStyle = active ? '#facc15' : '#2f6b45';
      c.fillText((active ? '> ' : '  ') + n, 12, 32 + i * 18);
    });
    // Oscilloscope trace.
    c.strokeStyle = '#4ade80';
    c.lineWidth = 2;
    c.beginPath();
    const amp = mode === 'idle' ? 2 : 14;
    for (let x = 0; x <= W; x += 4) {
      const y = 140 + Math.sin(x * 0.07 + t * 6) * amp * Math.sin(x * 0.013 + t);
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
}
