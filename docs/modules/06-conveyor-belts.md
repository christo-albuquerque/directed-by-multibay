# 06 · Conveyor belts

## Purpose
Belts exist **only inside factories**. Farms, mines and everything else move goods with workers and vehicles; belts stop at every room's door and workers carry crates across on trolleys.

## Requirements
- Belts exist only in factories. Not on farms, in mines or between districts: there, workers and vehicles carry goods [user v2.3].
- Inside a factory every belt **terminates at each room**; workers unload it onto trolley carts, the work is done in the room, then it is loaded onto the exit belt that goes to the next stage [user v2.3].
- **No overlap with other structures**, terrain or vehicles. A belt may only meet a machine where it goes into a hood/housing to be hidden (spawn, despawn, swap) [user v2.2].
- Factorio/Satisfactory feel: interconnected belts in dedicated zones, spread out [user v2].
- Items never pop in or out in view [user v2].
- Matrix builds as parallel lanes [Brief §3, §5] (not built).

## Current implementation
- `src/world/belts.ts`: `BeltSurface` (scrolling striped texture, shared per line), `ribbonMesh(path, halfWidth, mat, lift)` (every belt and road ribbon goes through it and **registers its corridor**), `beltSupports` (legs and rails).
- `src/world/corridors.ts`: `registerCorridor`, `nearCorridor`, `auditCorridors`. Scenery placement rejects any spot within a corridor's half-width + margin. `window.__audit()` in the dev console lists overlapping belt/road pairs with longitude/latitude.
- **Line belts** (`line/layout.ts` `ROUTE`): one winding route (three long runs joined by two U-turns, depot to dock), two lanes: bulk (left, +1.7) and express (right, −1.7) carrying real runs. Belt height 0.9, item lift 0.4, speed 3.4, item gap 2.3.
- **Gaps at rooms** (`line/layout.ts` `STATION_GAP`, `APRON`): `Line.buildBelts` cuts each lane at every room (half-length 5, 4.5, 5, 8, 5, plus a 1.6 apron each side) and the supports skip the gaps. `Line.handoff` / `drawCarrier` draw the crossing: a porter steps out of the door, the crate hops on a trolley at the belt end, they go in (hidden inside hooded rooms: depot, build, dispatch), and come out of the exit door where the crate goes back on the belt and the porter walks back in. Trolleys are one shared instanced pool (`Pools.trolleys`, `supply.ts` `trolleyPrefab`).
- **Removed:** the farm and mine trunk belts, hubs, outposts and elevated feeders (`feeders.ts` is deleted); supply is by truck (see 07).
- Crates are `InstancePool` instances (tinted, 1600 each for crates and boxes).

## Invariants
- Belts exist only in factories; none in farms, mines, roads or between districts.
- Every line belt stops at each room and restarts beyond the exit door; crates cross on trolleys.
- Every belt/road ribbon of half-width ≥ 0.5 registers a corridor (done inside `ribbonMesh`).
- Items enter and leave belts only inside a hood (depot, build, dispatch, dock) or at a porter's trolley at a door.
- Two lanes per line belt: bulk never stops; express waits when the sim is behind.
- Audit rule: remaining overlaps from `__audit()` must be intentional (shared avenue road, road junctions).

## Extension points
- New belt: build a `SurfacePath`, call `ribbonMesh` (it registers itself), add supports, hide both ends in hoods.
- **Matrix builds** (`sim/runs.ts` `matrixWidth`: jobs named `test (a)`, `test (b)` share a prefix, up to 4): `Line.drawExpress` draws siblings 1.15 units apart behind the real box, in sync with it.
- Real parallel lanes: add parallel lanes using `route.offset(k)`; keep spacing > lane half-width.

## Known gaps
- Matrix builds do not get extra belts; their sibling boxes travel in a convoy on the express lane (see below).
- Porters at lint and the test arena are visible all the way through; their doors are open frames, so they appear at the door line.
