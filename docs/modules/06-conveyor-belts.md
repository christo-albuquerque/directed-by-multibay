# 06 · Conveyor belts

## Purpose
Belts carry crates and boxes **inside factories** and, as elevated feeders and trunks, from farms and mines into the factories' depots.

## Requirements
- Belts exist only in factories (and the farm/mine trunks and feeders that supply them); they are not all over the world [user v2.2].
- **No overlap with other structures**, terrain or vehicles. A belt may only meet a machine where it goes into a hood/housing to be hidden (spawn, despawn, swap) [user v2.2].
- Factorio/Satisfactory feel: interconnected belts in dedicated zones, spread out [user v2].
- Items never pop in or out in view [user v2].
- Matrix builds as parallel lanes [Brief §3, §5] (not built).

## Current implementation
- `src/world/belts.ts`: `BeltSurface` (scrolling striped texture, shared per line), `ribbonMesh(path, halfWidth, mat, lift)` (every belt and road ribbon goes through it and **registers its corridor**), `beltSupports` (legs and rails).
- `src/world/corridors.ts`: `registerCorridor`, `nearCorridor`, `auditCorridors`. Scenery placement rejects any spot within a corridor's half-width + margin. `window.__audit()` in the dev console lists overlapping belt/road pairs with longitude/latitude.
- **Line belts** (`line/layout.ts` `ROUTE`): one winding route (three long runs joined by two U-turns, depot to dock), two lanes: bulk (left, +1.7) and express (right, −1.7) carrying real runs. Belt height 0.9, item lift 0.4, speed 3.4, item gap 2.3.
- **Feeders** (`feeders.ts`): `Feeder` is an elevated belt with its own crates; hubs (`makeHub`, height 4.9) collect the farm trunk (west) and mine trunk (east); `buildFeeders` runs one arc per line into its depot (odd lines are turned so each depot faces its supply). Mine has an extra pit conveyor feeder.
- Crates are `InstancePool` instances (tinted, 1600 each for crates and boxes).

## Invariants
- Belts exist only in factories, feeders and the farm/mine trunks.
- Every belt/road ribbon of half-width ≥ 0.5 registers a corridor (done inside `ribbonMesh`).
- Items enter and leave belts only inside a hood (depot, build, dispatch, dock) or off the ends of feeders in their hubs.
- Two lanes per line belt: bulk never stops; express waits when the sim is behind.
- Audit rule: remaining overlaps from `__audit()` must be intentional (feeder into depot, shared avenue road, hub junctions).

## Extension points
- New belt: build a `SurfacePath`, call `ribbonMesh` (it registers itself), add supports, hide both ends in hoods.
- **Matrix builds** (`sim/runs.ts` `matrixWidth`: jobs named `test (a)`, `test (b)` share a prefix, up to 4): `Line.drawExpress` draws siblings 1.15 units apart behind the real box, in sync with it.
- Real parallel lanes: add parallel lanes using `route.offset(k)`; keep spacing > lane half-width.

## Known gaps
- Matrix builds do not get extra belts; their sibling boxes travel in a convoy on the express lane (see below).
- Feeder-over-road crossings (mine trunk over the port east road) rely on elevation; no bridge models yet.
