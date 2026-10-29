import * as THREE from 'three';
import { BAY_X0, BAY_X1, BAY_Z0, BAY_Z1, PLAZA_R, type Layout } from './layoutPlan';
import { cyl, mat, rng, shadowAll } from './util';

/** Kepler-22b: a floating diorama slab of terracotta rock, sized to hold every bay and plaza. */
export function buildPlanet(layout: Layout): THREE.Group {
  const planet = new THREE.Group();
  const rand = rng(22);
  const { center, radius } = layout;

  const top = cyl(radius, radius, 1.4, 0x9a5a43, center.x, -1.4, center.z, 64);
  const rim = cyl(radius + 0.3, radius + 0.3, 0.3, 0x6e3d2f, center.x, -1.7, center.z, 64);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(radius + 0.3, radius * 0.6, 14, 1), mat(0x4a2f2a));
  rock.rotation.x = Math.PI;
  rock.position.set(center.x, -1.7 - radius * 0.3, center.z);
  planet.add(top, rim, rock);

  const taken = (x: number, z: number): boolean =>
    layout.bayZ.some((bz) => x > BAY_X0 - 1 && x < BAY_X1 + 1 && z > bz + BAY_Z0 - 1 && z < bz + BAY_Z1 + 1) ||
    layout.plazas.some((p) => Math.hypot(x - p.x, z - p.z) < PLAZA_R + 1.5);

  // Craters and boulders scattered on the free ground.
  const count = Math.round(radius * 1.3);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * (radius - 2);
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    if (taken(x, z)) continue;
    if (rand() < 0.5) {
      planet.add(cyl(0.8 + rand() * 1.4, 1.1 + rand() * 1.6, 0.08, 0x7d4636, x, 0, z, 10));
    } else {
      const s = 0.4 + rand() * 0.9;
      const rockMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat(0x7a5a4c));
      rockMesh.position.set(x, s * 0.5, z);
      rockMesh.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      planet.add(rockMesh);
    }
  }

  shadowAll(planet, true, true);
  return planet;
}

/** Starfield parented to the camera, so it always fills the orthographic view. */
export function addStars(camera: THREE.Camera): THREE.Points {
  const rand = rng(7);
  const n = 1400;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rand() * 2 - 1) * 130;
    pos[i * 3 + 1] = (rand() * 2 - 1) * 85;
    pos[i * 3 + 2] = -120 + rand() * 20;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false }));
  stars.frustumCulled = false;
  camera.add(stars);
  return stars;
}
