import type { StageName } from '../../sim/stages';

/** Chart (x, z) control points of a line's main belt: three long runs joined by two U-turns, depot to dock. */
export const ROUTE: [number, number][] = [
  [-38, -11], [-24, -11], [-8, -11], [8, -11], [24, -11], [35, -11],
  [41, -9.5], [44, -5.5], [41, -1.5], [34, 0], [20, 0], [4, 0], [-12, 0], [-28, 0], [-37, 0],
  [-42.5, 1.5], [-45, 5.5], [-42.5, 9.5], [-37, 11], [-24, 11], [-8, 11], [8, 11], [24, 11], [36, 11],
];

/** Lateral distance of each lane from the belt's centre line. Express (real runs) is on the right, bulk on the left. */
export const LANE_OFFSET = 1.7;
export const BELT_HEIGHT = 0.9;
export const ITEM_LIFT = 0.4;

export interface StationDef {
  stage: StageName;
  /** Where the station sits, as a chart (x, z) the route passes through. */
  anchor: [number, number];
  /** Seconds an item spends inside (ambient) or at least (real runs). */
  service: number;
  /** Items are hidden by the housing while processed. */
  hidden: boolean;
  label: string;
}

export const STATIONS: StationDef[] = [
  { stage: 'depot', anchor: [-38, -11], service: 2.4, hidden: true, label: 'DEPENDENCIES' },
  { stage: 'lint', anchor: [-6, -11], service: 3, hidden: false, label: 'LINT' },
  { stage: 'build', anchor: [24, -11], service: 3.6, hidden: true, label: 'BUILD' },
  { stage: 'test', anchor: [2, 0], service: 7.5, hidden: false, label: 'TESTING GROUNDS' },
  { stage: 'dispatch', anchor: [-12, 11], service: 3, hidden: true, label: 'DISPATCH' },
];

/** Spacing items keep on a belt, and the belt's normal speed in world units per second. */
export const ITEM_GAP = 2.3;
export const BELT_SPEED = 3.4;

export const STAGE_COLOR: Record<StageName, number> = {
  depot: 0xe08a2e,
  lint: 0x2fb7a4,
  build: 0x3a74c9,
  test: 0xd9503a,
  dispatch: 0x8a5ad0,
};

/**
 * The belt stops at every room. h is half the room's length along the belt; hooded rooms hide anything inside. Porters push
 * crates across the gap on trolleys, and the belt restarts APRON units beyond each door.
 */
export const STATION_GAP: { h: number; hood: boolean }[] = [
  { h: 5, hood: true },
  { h: 4.5, hood: false },
  { h: 5, hood: true },
  { h: 8, hood: false },
  { h: 5, hood: true },
];
export const APRON = 1.6;
