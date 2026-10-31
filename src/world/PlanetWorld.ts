import * as THREE from 'three';
import type { GlobeWorld } from '../globe/GlobeWorld';
import { ZONES, zoneChart } from '../globe/zones';
import { Particles } from '../scene/Particles';
import type { Product } from '../sim/factory';
import { motion } from '../ui/motion';
import { CrowdRenderer } from './crowd';
import { Farm } from './farm/Farm';
import { Power } from './power/Power';
import { Supply, trolleyPrefab } from './supply';
import { Mine } from './mine/Mine';
import { Port } from './port/Port';
import { City } from './city/City';
import { Skyways } from './city/Skyways';
import { Scatter } from './scatter';
import { Weather } from './weather';
import { M, Prefab, StaticBatch, setGlow } from './kit';
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
  private trolleys = new InstancePool(trolleyPrefab(), 400, false, false);
  private crowd = new CrowdRenderer(2600);
  readonly farm: Farm;
  readonly mine: Mine;
  readonly port: Port;
  readonly city: City;
  private skyways = new Skyways();
  private scatter: Scatter;
  private launching = new Map<Line, boolean>();
  readonly weather: Weather;
  private portZone = ZONES.find((z) => z.kind === 'port')!;
  private cityZone = ZONES.find((z) => z.kind === 'city')!;
  private supply!: Supply;
  private power!: Power;
  private powerZone = ZONES.find((z) => z.kind === 'power')!;
  private farmZone = ZONES.find((z) => z.kind === 'farm')!;
  private mineZone = ZONES.find((z) => z.kind === 'mine')!;
  private warn = new THREE.PointLight(0xff3322, 0, 70, 1.4);
  private marker = new THREE.Group();
  private selected: string | null = null;
  private v = new THREE.Vector3();

  constructor(private world: GlobeWorld) {
    this.pools = { crates: this.crates, boxes: this.boxes, crowd: this.crowd, trolleys: this.trolleys };
    const batch = new StaticBatch();
    buildPads(batch);
    for (const z of ZONES) if (z.kind === 'line') this.lines.push(new Line(z, batch));
    this.farm = new Farm(batch);
    this.mine = new Mine(batch);
    this.supply = new Supply(batch, this.lines);
    this.port = new Port(batch, this.lines);
    this.city = new City(batch);
    this.power = new Power(batch);
    this.weather = new Weather(world);
    this.scatter = new Scatter(batch, this.lines.map((l) => ({ dir: l.plazaDir(), r: 8 })));
    world.scene.add(this.scatter.group);
    setGlow('sky', 0.6);
    world.scene.add(batch.build(), this.crates.mesh, this.boxes.mesh, this.trolleys.mesh, this.crowd.group, this.fx.points, this.warn, this.marker, this.farm.group, this.mine.group, this.power.group, this.port.group, this.city.group, ...this.farm.meshes, ...this.mine.meshes, ...this.port.meshes, ...this.skyways.meshes, ...this.supply.meshes);
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

  private lastRunLine = -1;

  /**
   * Where a run's box is right now, wherever it is: on its belt, in the dock, on its truck, at the pad, or on the
   * rocket as it climbs. Null once it has left the world (the rocket reaches the stratosphere) or the run ended badly.
   */
  productPosition(key: string): THREE.Vector3 | null {
    const hit = this.findProduct(key);
    if (hit) {
      const li = this.lines.indexOf(hit.line);
      this.lastRunLine = li;
      return hit.line.runPosition(key) ?? this.port.followRun(li, hit.product);
    }
    return this.lastRunLine >= 0 ? this.port.followRun(this.lastRunLine, null) : null;
  }

  /** The truck, rocket, drone or hover car nearest the pointer (within a few pixels), as something to follow. */
  pickVehicle(ndc: THREE.Vector2, camera: THREE.PerspectiveCamera): (() => THREE.Vector3 | null) | null {
    let best: (() => THREE.Vector3 | null) | null = null;
    let bestD = 0.045;
    for (const f of [...this.port.followables(), ...this.supply.followables(), ...this.skyways.followables()]) {
      this.v.copy(f.pos).project(camera);
      if (this.v.z > 1) continue;
      const d = Math.hypot(this.v.x - ndc.x, (this.v.y - ndc.y) * 0.9);
      if (d < bestD) {
        bestD = d;
        best = f.follow;
      }
    }
    return best;
  }

  /** Pokes the grain nearest the pointer (within a few pixels). Returns whether one was hit. */
  pokeGrain(ndc: THREE.Vector2, camera: THREE.PerspectiveCamera): boolean {
    let best: (() => void) | null = null;
    let bestD = 0.035;
    const sources: { list: { id: number; pos: THREE.Vector3 }[]; poke: (id: number) => void }[] = [];
    for (const l of this.lines) sources.push({ list: l.grainPickables(), poke: (id) => l.folk.poke(id) });
    for (const a of [this.farm.ambient, this.mine.ambient, this.city.ambient, this.scatter.ambient]) if (a) sources.push({ list: a.pickables(), poke: (id) => a.poke(id) });
    for (const src of sources) {
      for (const g of src.list) {
        this.v.copy(g.pos).project(camera);
        if (this.v.z > 1) continue;
        const d = Math.hypot(this.v.x - ndc.x, (this.v.y - ndc.y) * 0.9);
        if (d < bestD) {
          bestD = d;
          best = () => src.poke(g.id);
        }
      }
    }
    if (!best) return false;
    (best as () => void)();
    return true;
  }

  update(dt: number, elapsed: number, activity: number): void {
    const env: Env = { dt, elapsed, activity, fx: this.fx, focus: this.world.controls.focus, camDist: this.world.controls.view.dist };
    this.crates.begin();
    this.boxes.begin();
    this.trolleys.begin();
    this.crowd.begin();
    let incident: THREE.Vector3 | null = null;
    for (const l of this.lines) {
      const night = this.world.nightAt(l.chart.center);
      const wasLaunching = this.launching.get(l) ?? false;
      l.update(env, night);
      const nowLaunching = l.state.products.some((p) => p.status === 'launching');
      if (nowLaunching && !wasLaunching) l.celebrate();
      this.launching.set(l, nowLaunching);
      l.draw(env, this.pools);
      if (!incident && l.incident) incident = l.incident;
    }
    // Supply chain: farm and mine trucks carry crates to every depot.
    this.farm.update(env, this.world.nightAt(zoneChart(this.farmZone).center));
    this.farm.draw(env, this.pools);
    this.mine.update(env, this.world.nightAt(zoneChart(this.mineZone).center));
    this.supply.update(env, this.world.nightAt(this.world.controls.focus));
    this.mine.draw(env, this.pools);
    this.supply.draw(env, this.pools);
    this.port.update(env, this.world.nightAt(zoneChart(this.portZone).center));
    this.port.draw(env, this.pools);
    this.city.update(env, this.world.nightAt(zoneChart(this.cityZone).center));
    this.power.update(env, this.world.nightAt(zoneChart(this.powerZone).center));
    this.city.draw(env, this.pools);
    this.skyways.update(dt, elapsed, env.camDist, this.world.nightAt(this.world.controls.focus));
    this.weather.update(dt, elapsed);
    if (env.camDist < 200) this.scatter.ambient.draw(env, this.pools);
    setGlow('wild', this.world.nightAt(this.world.controls.focus));
    // Slow machines drop the far-away forests first.
    this.scatter.group.visible = this.world.quality >= 2 || env.camDist < 300;
    this.crates.end();
    this.boxes.end();
    this.trolleys.end();
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
