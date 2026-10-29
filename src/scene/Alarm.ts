import * as THREE from 'three';
import { sfx } from '../ui/sfx';
import { box, cyl, makeLabel, shadowAll } from './util';

/** Rotating red klaxon on a tower. Spins and wails when a new commit wakes the factory. */
export class Alarm {
  readonly group = new THREE.Group();
  private spinner = new THREE.Group();
  private dome: THREE.Mesh;
  private light = new THREE.PointLight(0xff2a1a, 0, 16, 1.6);
  private level = 0;
  private wasOn = false;

  constructor() {
    this.group.position.set(-13.2, 0, -1.8);
    this.group.add(cyl(0.18, 0.25, 5.2, 0x6b7280, 0, 0.1, 0, 8), box(0.9, 0.4, 0.9, 0x374151, 0, 5.3));

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xff2a1a, emissiveIntensity: 0.1, transparent: true, opacity: 0.92 }));
    this.dome.position.y = 5.7;
    // Two light beams that sweep around as the lamp spins.
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    for (const s of [1, -1]) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.7, 5, 10, 1, true), beamMat);
      beam.rotation.z = (Math.PI / 2) * s;
      beam.position.set(s * 2.5, 0, 0);
      this.spinner.add(beam);
    }
    this.spinner.position.y = 5.8;
    this.light.position.y = 6;
    this.group.add(this.dome, this.spinner, this.light);
    const label = makeLabel('ALARM', { fontPx: 22, color: '#ffb4ab' });
    label.position.y = 7;
    this.group.add(label);
    shadowAll(this.group);
    (this.dome as THREE.Mesh).castShadow = false;
    this.beamMat = beamMat;
  }

  private beamMat: THREE.MeshBasicMaterial;

  /** `on` while the alarm should sound (new commit) or a failure is active. */
  update(dt: number, elapsed: number, on: boolean, siren: boolean): void {
    if (siren && !this.wasOn) sfx.siren(3.2);
    this.wasOn = siren;
    this.level += ((on ? 1 : 0) - this.level) * (1 - Math.exp(-dt * 6));
    this.spinner.rotation.y += dt * (2 + this.level * 8);
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 14);
    (this.dome.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1 + this.level * (0.8 + pulse * 1.4);
    this.light.intensity = this.level * (10 + pulse * 25);
    this.beamMat.opacity = this.level * 0.35;
    this.spinner.visible = this.level > 0.02;
  }
}
