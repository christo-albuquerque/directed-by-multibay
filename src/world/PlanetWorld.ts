import * as THREE from 'three';
import type { GlobeWorld } from '../globe/GlobeWorld';
import { ZONES } from '../globe/zones';
import { Particles } from '../scene/Particles';
import type { Product } from '../sim/factory';
import { motion } from '../ui/motion';
import { CrowdRenderer } from './crowd';
import { M, Prefab, StaticBatch } from './kit';
import { Line } from './line/Line';
import { buildPads } from './pads';
import { InstancePool } from './pools';
import type { Env, Pools } from './types';

function cratePrefab(): Prefab {
  return new Prefab()
    .box(0.8, 0.8, 0.8, M(0xb98a52), 0, -0.4, 0)
    .box(0.84, 0.12, 0.84, M(0x8a6236), 0, -0.4 + 0.08, 0)
    .box(0.84, 0.12, 0.84, M(0x8a6236), 0, -0.4 + 0.58, 0)
    .box(0.12, 0.84, 0.84, M(0x8a6236), -0.3, -0.42, 0)
    .box(0.12, 0.84, 0.84, M(0x8a6236), 0.3, -0.42, 0);
}

function boxPrefab(): Prefab {
  return new Prefab().box(0.8, 0.8, 0.8, M(0xc89b5f), 0, -0.4, 0).box(0.18, 0.02, 0.82, M(0xe8dcc0), 0, 0.4, 0).box(0.18, 0.82, 0.02, M(0xe8dcc0), 0, -0.41, 0.41);
}

/** The whole living planet: every district, always present, always moving. */
export class PlanetWorld {
  readonly lines: Line[] = [];
  readonly fx = new Particles();
  private pools: Pools;
  private crates = new InstancePool(cratePrefab(), 1600, true);
  private boxes = new InstancePool(boxPrefab(), 1600, true);
  private crowd = new CrowdRenderer(2600);
  private warn = new THREE.PointLight(0xff3322, 0, 70, 1.4);
  private marker = new THREE.Group();
  private selected: string | null = null;
  private v = new THREE.Vector3();

  constructor(private world: GlobeWorld) {
    this.pools = { crates: this.crates, boxes: this.boxes, crowd: this.crowd };
    const batch = new StaticBatch();
    buildPads(batch);
    for (const z of ZONES) if (z.kind === 'line') this.lines.push(new Line(z, batch));
    world.scene.add(batch.build(), this.crates.mesh, this.boxes.mesh, this.crowd.group, this.fx.points, this.warn, this.marker);
    for (const l of this.lines) world.scene.add(l.group);

    // Selection marker: a pulsing ring and a tall beam over the chosen run.
    const hl = new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.85, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 8, 28), hl);
    ring.rotation.x = Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 22, 8), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.35, depthWrite: false }));
    beam.position.y = 11;
    this.marker.add(ring, beam);
    this.marker.visible = false;
  }

  setSelected(key: string | null): void {
    this.selected = key;
  }

  /** Looks a product up across every line. */
  findProduct(key: string | null): { product: Product; line: Line } | null {
    if (!key) return null;
    for (const line of this.lines) {
      const product = line.state.products.find((p) => p.key === key);
      if (product) return { product, line };
    }
    return null;
  }

  /** The real run nearest the pointer (within a few pixels), if any. */
  pick(ndc: THREE.Vector2, camera: THREE.PerspectiveCamera): string | null {
    let best: string | null = null;
    let bestD = 0.05;
    for (const l of this.lines) {
      for (const p of l.pickables()) {
        this.v.copy(p.pos).project(camera);
        if (this.v.z > 1) continue;
        const d = Math.hypot(this.v.x - ndc.x, (this.v.y - ndc.y) * 0.9);
        if (d < bestD) {
          bestD = d;
          best = p.key;
        }
      }
    }
    return best;
  }

  update(dt: number, elapsed: number, activity: number): void {
    const env: Env = { dt, elapsed, activity, fx: this.fx, focus: this.world.controls.focus, camDist: this.world.controls.view.dist };
    this.crates.begin();
    this.boxes.begin();
    this.crowd.begin();
    let incident: THREE.Vector3 | null = null;
    for (const l of this.lines) {
      const night = this.world.nightAt(l.chart.center);
      l.update(env, night);
      l.draw(env, this.pools);
      if (!incident && l.incident) incident = l.incident;
    }
    this.crates.end();
    this.boxes.end();
    this.crowd.end();
    this.fx.update(dt, this.world.camera, this.world.renderer);

    // One shared red warning light for whichever line is in trouble.
    if (incident) {
      this.warn.position.copy(incident).addScaledVector(incident.clone().normalize(), 5);
      this.warn.intensity = 900 * (motion.reduced ? 0.7 : 0.55 + 0.45 * Math.sin(elapsed * 22));
    } else {
      this.warn.intensity = 0;
    }

    // Selection marker follows the chosen run.
    this.marker.visible = false;
    if (this.selected) {
      for (const l of this.lines) {
        const hit = l.pickables().find((p) => p.key === this.selected);
        if (hit) {
          this.marker.visible = true;
          const up = hit.pos.clone().normalize();
          this.marker.position.copy(hit.pos).addScaledVector(up, -0.35);
          this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
          this.marker.scale.setScalar(1 + Math.sin(elapsed * 5) * 0.08);
          break;
        }
      }
    }
  }
}
