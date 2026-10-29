import * as THREE from 'three';
import { Chart, lonLatDir } from './surface';

export type ZoneKind = 'line' | 'city' | 'port' | 'farm' | 'mine' | 'power';

/** A flat-ish district on the globe. Sizes are in world units along the zone's own chart axes. */
export interface Zone {
  id: string;
  kind: ZoneKind;
  label: string;
  lon: number;
  lat: number;
  /** Turns the zone about its centre. */
  yaw: number;
  w: number;
  d: number;
  /** Which build line this zone is, for kind 'line'. */
  index?: number;
}

/** Most repos the world can show: one build line each. */
export const MAX_LINES = 6;

function lineZone(i: number): Zone {
  const row = Math.floor(i / 2);
  const lat = 12 + row * 15;
  // Rows nearer the pole are narrower in longitude, so the columns move outward with latitude.
  const lon = (i % 2 === 0 ? -1 : 1) * (22.5 + row * 2.75);
  // Right-hand lines are turned half way round, so every line's depot faces its own supply side
  // (crops from the west, ore from the east) and both columns' docks face the central dispatch avenue.
  return { id: `line${i}`, kind: 'line', label: `Line ${i + 1}`, lon, lat, yaw: i % 2 === 0 ? 0 : Math.PI, w: 96, d: 34, index: i };
}

/** The master plan of the planet. Everything exists from the start; nothing is added or removed at runtime. */
export const ZONES: Zone[] = [
  { id: 'city', kind: 'city', label: 'Night Market', lon: 0, lat: -8, yaw: 0, w: 84, d: 58 },
  ...Array.from({ length: MAX_LINES }, (_, i) => lineZone(i)),
  { id: 'port', kind: 'port', label: 'Rocket Port', lon: 74, lat: 30, yaw: 0, w: 64, d: 84 },
  { id: 'farm', kind: 'farm', label: 'Agri-Biome 7', lon: -66, lat: 8, yaw: 0, w: 86, d: 104 },
  { id: 'mine', kind: 'mine', label: 'Deep Mines', lon: 66, lat: -14, yaw: 0, w: 92, d: 84 },
  { id: 'power', kind: 'power', label: 'Power Fields', lon: -4, lat: 60, yaw: 0, w: 120, d: 32 },
];

const charts = new Map<string, Chart>();

export function zoneChart(zone: Zone): Chart {
  let c = charts.get(zone.id);
  if (!c) {
    c = new Chart(lonLatDir(zone.lon, zone.lat), zone.yaw);
    charts.set(zone.id, c);
  }
  return c;
}

export function zoneById(id: string): Zone {
  const z = ZONES.find((x) => x.id === id);
  if (!z) throw new Error(`unknown zone ${id}`);
  return z;
}

const tmp = new THREE.Vector2();

/** 0 outside a zone, rising to 1 inside, with `soft` units of falloff beyond its footprint. */
export function zoneWeight(zone: Zone, dir: THREE.Vector3, soft = 8): number {
  const p = zoneChart(zone).toLocal(dir, tmp);
  const dx = Math.abs(p.x) - zone.w / 2;
  const dz = Math.abs(p.y) - zone.d / 2;
  const out = Math.max(dx, dz);
  if (out <= 0) return 1;
  return Math.max(0, 1 - out / soft);
}
