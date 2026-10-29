import * as THREE from 'three';
import { cyl, mat, rng, shadowAll } from './util';

export const PLANET_RADIUS = 22;

/** Kepler-22b: a floating diorama slab of terracotta rock under a starfield. */
export function buildPlanet(scene: THREE.Scene): THREE.Group {
  const planet = new THREE.Group();
  const rand = rng(22);

  const top = cyl(PLANET_RADIUS, PLANET_RADIUS, 1.4, 0x9a5a43, 0, -1.4, 0, 56);
  const rim = cyl(PLANET_RADIUS + 0.3, PLANET_RADIUS + 0.3, 0.3, 0x6e3d2f, 0, -1.7, 0, 56);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(PLANET_RADIUS + 0.3, 13, 14, 1), mat(0x4a2f2a));
  rock.rotation.x = Math.PI;
  rock.position.y = -1.7 - 6.5;
  planet.add(top, rim, rock);

  // Factory floor: pale concrete apron where the bay and launchpad sit.
  const apron = new THREE.Mesh(new THREE.BoxGeometry(34, 0.12, 14), mat(0xb9b2a6));
  apron.position.set(2, 0.06, -0.5);
  planet.add(apron);

  // Craters and boulders scattered on the free ground.
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 8 + rand() * (PLANET_RADIUS - 10);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(z) < 8 && x > -16 && x < 20) continue;
    if (rand() < 0.5) {
      const crater = cyl(0.8 + rand() * 1.4, 1.1 + rand() * 1.6, 0.08, 0x7d4636, x, 0, z, 10);
      planet.add(crater);
    } else {
      const s = 0.4 + rand() * 0.9;
      const rockMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat(0x7a5a4c));
      rockMesh.position.set(x, s * 0.5, z);
      rockMesh.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      planet.add(rockMesh);
    }
  }

  shadowAll(planet, true, true);
  scene.add(planet);
  return planet;
}

/** Starfield parented to the camera, so it always fills the orthographic view. */
export function addStars(camera: THREE.Camera): THREE.Points {
  const rand = rng(7);
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rand() * 2 - 1) * 80;
    pos[i * 3 + 1] = (rand() * 2 - 1) * 50;
    pos[i * 3 + 2] = -120 + rand() * 20;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false }));
  stars.frustumCulled = false;
  camera.add(stars);
  return stars;
}
