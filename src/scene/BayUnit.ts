import * as THREE from 'three';
import { Crowd } from '../agents/Crowd';
import { FactoryState } from '../sim/factory';
import { Alarm } from './Alarm';
import { Bay } from './Bay';
import { Incidents } from './Incidents';
import { Launchpad } from './Launchpad';
import { OffsetEmitter, type Particles } from './Particles';
import { ProductView } from './ProductView';

/** Everything that belongs to one repo: its own simulation, bay, launchpad, rescue hut, alarm and crew. */
export class BayUnit {
  /** Bay-local things (positioned at the bay's z). */
  readonly group = new THREE.Group();
  readonly state = new FactoryState();
  readonly bay: Bay;
  readonly launchpad = new Launchpad();
  readonly incidents = new Incidents();
  readonly alarm = new Alarm();
  readonly products = new ProductView();
  /** Workers walk in world space, so the crowd lives outside the bay group. */
  readonly crowd: Crowd;
  private fx: OffsetEmitter;
  private worldIncident = new THREE.Vector3();
  private shift: THREE.Vector3;

  constructor(
    readonly repo: string,
    readonly label: string,
    readonly z: number,
    baseFx: Particles,
  ) {
    this.group.position.set(0, 0, z);
    this.bay = new Bay(label);
    this.group.add(this.bay.group, this.launchpad.group, this.incidents.group, this.alarm.group, this.products.group);
    this.crowd = new Crowd(z);
    this.shift = new THREE.Vector3(0, 0, z);
    this.fx = new OffsetEmitter(baseFx, this.shift);
  }

  update(dt: number, elapsed: number, baseFx: Particles, night: number): void {
    const state = this.state;
    state.update(dt);
    const mode = state.mode;
    this.bay.update(dt, elapsed, mode, state, this.fx, night);
    this.launchpad.update(dt, elapsed, state.launchAge, this.fx, state.launchKind);
    this.incidents.update(dt, elapsed, state, this.fx);
    const incident = this.incidents.incident ? this.worldIncident.copy(this.incidents.incident).add(this.shift) : null;
    this.crowd.update(dt, elapsed, mode, { fx: baseFx, incident, activity: state.activity });
    this.alarm.update(dt, elapsed, this.crowd.alarmLeft > 0 || mode === 'failure', this.crowd.alarmLeft > 0);
    this.products.update(state, elapsed, this.fx);
  }
}
