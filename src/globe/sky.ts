import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise3 } from './terrain';
import { R } from './surface';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ATMOSPHERE_VERT = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec3 vWorldN;
  void main() {
    vWorldN = normalize(mat3(modelMatrix) * normal);
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const ATMOSPHERE_FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uColor;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec3 vWorldN;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormalV, vViewDir)), 2.6);
    float lit = smoothstep(-0.35, 0.55, dot(normalize(vWorldN), uSun));
    float a = rim * (0.25 + 0.95 * lit);
    gl_FragColor = vec4(uColor * a * 1.6, a);
  }
`;

/** Everything beyond the ground: stars, a glowing atmosphere, drifting clouds, a moon and a ringed neighbour. */
export class Sky {
  readonly group = new THREE.Group();
  private atmosphere: THREE.Mesh;
  private uSun = { value: new THREE.Vector3(0, 0, 1) };
  private cloudLayers: THREE.Mesh[] = [];

  constructor() {
    this.group.add(this.buildStars(), this.buildMoon(), this.buildRingPlanet());

    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.075, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { uSun: this.uSun, uColor: { value: new THREE.Color(0x6fa8ff) } },
        vertexShader: ATMOSPHERE_VERT,
        fragmentShader: ATMOSPHERE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.atmosphere.renderOrder = 2;
    this.group.add(this.atmosphere);

    for (const [i, speed] of [[0, 0.012], [1, -0.007], [2, 0.019]] as const) {
      const layer = this.buildClouds(100 + i, 30 + i * 6, R + 24 + i * 7);
      layer.userData.speed = speed;
      this.cloudLayers.push(layer);
      this.group.add(layer);
    }
  }

  private buildStars(): THREE.Points {
    const r = rng(7);
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const d = 3200;
      pos.set([Math.cos(a) * s * d, u * d, Math.sin(a) * s * d], i * 3);
      c.setHSL(0.55 + r() * 0.15, 0.4, 0.7 + r() * 0.3);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false }));
    stars.frustumCulled = false;
    return stars;
  }

  private buildMoon(): THREE.Mesh {
    const geo = new THREE.IcosahedronGeometry(46, 3);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const h = noise3(v.x * 5, v.y * 5, v.z * 5) * 2.2 + noise3(v.x * 13, v.y * 13, v.z * 13);
      p.setXYZ(i, v.x * (46 + h), v.y * (46 + h), v.z * (46 + h));
      const g = 0.62 + noise3(v.x * 9, v.y * 9, v.z * 9) * 0.12;
      col.set([g, g * 0.98, g * 0.95], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    m.position.set(-520, 280, -700);
    return m;
  }

  private buildRingPlanet(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 20), new THREE.MeshStandardMaterial({ color: 0xc79a6b, roughness: 1, flatShading: true }));
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 4;
    const ctx = c.getContext('2d')!;
    for (let x = 0; x < 256; x++) {
      const a = 0.25 + 0.5 * Math.abs(Math.sin(x * 0.19)) * (x > 40 && x < 220 ? 1 : 0.15);
      ctx.fillStyle = `rgba(214,190,160,${a})`;
      ctx.fillRect(x, 0, 1, 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ring = new THREE.Mesh(new THREE.RingGeometry(170, 300, 96, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    // Remap the ring's UVs so the texture runs across its width rather than around it.
    const rp = ring.geometry.getAttribute('position') as THREE.BufferAttribute;
    const ruv = ring.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < rp.count; i++) ruv.setXY(i, (Math.hypot(rp.getX(i), rp.getY(i)) - 170) / 130, 0.5);
    ring.rotation.x = Math.PI / 2.2;
    g.add(body, ring);
    g.position.set(900, 420, -1300);
    g.rotation.z = 0.35;
    return g;
  }

  private buildClouds(seed: number, count: number, radius: number): THREE.Mesh {
    const r = rng(seed);
    const parts: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < count; i++) {
      // A cloud is a cluster of flattened low-poly blobs lying along the planet's surface.
      const u = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const dir = new THREE.Vector3(Math.cos(a) * s, u, Math.sin(a) * s);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const puffs = 3 + Math.floor(r() * 3);
      for (let k = 0; k < puffs; k++) {
        const g = new THREE.IcosahedronGeometry(1, 0);
        const size = 3.5 + r() * 4;
        const off = new THREE.Vector3((r() - 0.5) * 12, 0, (r() - 0.5) * 12).applyQuaternion(q);
        m.compose(dir.clone().multiplyScalar(radius).add(off), q, new THREE.Vector3(size * 1.6, size * 0.55, size * 1.2));
        g.applyMatrix4(m);
        parts.push(g);
      }
    }
    const geo = mergeGeometries(parts, false)!;
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x28303c, flatShading: true, roughness: 1, transparent: true, opacity: 0.88 }));
    mesh.castShadow = true;
    return mesh;
  }

  update(dt: number, sunDir: THREE.Vector3, camDist: number): void {
    this.uSun.value.copy(sunDir);
    // Clouds thin out as the camera dives toward the factories so they never block the view.
    const show = THREE.MathUtils.smoothstep(camDist, 170, 300);
    for (const l of this.cloudLayers) {
      l.rotation.y += dt * (l.userData.speed as number);
      l.visible = show > 0.01;
      (l.material as THREE.MeshStandardMaterial).opacity = 0.88 * show;
    }
  }
}
