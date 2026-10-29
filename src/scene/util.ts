import * as THREE from 'three';

export function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...opts });
}

export function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  return m;
}

export function cyl(rTop: number, rBottom: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat(color));
  m.position.set(x, y + h / 2, z);
  return m;
}

export function shadowAll(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}

/** Deterministic PRNG so the planet looks the same every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeLabel(text: string, opts: { fontPx?: number; color?: string; bg?: string } = {}): THREE.Sprite {
  const fontPx = opts.fontPx ?? 40;
  const font = `700 ${fontPx}px system-ui, "Segoe UI", Roboto, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const pad = fontPx * 0.5;
  const w = Math.ceil(probe.measureText(text).width + pad * 2);
  const h = Math.ceil(fontPx * 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = opts.bg ?? 'rgba(10,14,26,0.78)';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 3);
  ctx.fill();
  ctx.font = font;
  ctx.fillStyle = opts.color ?? '#f0eae1';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(w / 70, h / 70, 1);
  sprite.renderOrder = 10;
  return sprite;
}
