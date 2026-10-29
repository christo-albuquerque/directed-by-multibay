import * as THREE from 'three';

const container = document.getElementById('app') as HTMLElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f1a);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(4, 3.5, 5);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xfff1d6, 0x223344, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(5, 8, 4);
scene.add(sun);

// Placeholder "grain": a capsule, to prove the pipeline works end to end.
const grain = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.5, 1, 6, 16),
  new THREE.MeshStandardMaterial({ color: 0xf0eae1, flatShading: true }),
);
grain.position.y = 1;
scene.add(grain);

const ground = new THREE.Mesh(
  new THREE.CylinderGeometry(4, 4, 0.3, 48),
  new THREE.MeshStandardMaterial({ color: 0x8a4b3a, flatShading: true }),
);
ground.position.y = -0.15;
scene.add(ground);

function resize(): void {
  const { clientWidth: w, clientHeight: h } = container;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((t) => {
  grain.rotation.y = t / 1000;
  grain.position.y = 1 + Math.sin(t / 400) * 0.1;
  renderer.render(scene, camera);
});
