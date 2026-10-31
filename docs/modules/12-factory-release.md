# 12 · Factory release (rocket port)

## Purpose
Where trucks unload and rockets load and launch. A release counts as live **only when the rocket lifts off** [Brief §4].

## Requirements
- Rocket gantry with LED countdown, cheering crowd, rocket lifts off with a particle smoke trail [Brief §3.7].
- `main`/tag releases use rockets; PR/preview builds use courier drones [Brief §3].
- Rockets leave the planet out of view while another returns from a delivery and takes its place at the dock; nothing appears or vanishes [v2].
- Release/tag published → rocket lifts off [Brief §5].

## Current implementation
- `src/world/port/Port.ts`; zone `port` (lon 74, lat 30, 64 × 84): control tower with neon sign, radar dishes, lamps, 8 pads (6 repo + 2 freight, `world/pads.ts` helpers), roads (avenue between line columns, east road, port loop) drawn with `ribbonMesh` (registered).
- Craft arrive from altitude 600 (rockets) or 360 (drones), unseen above 260.
- Per pad: 2 rockets + 2 drones in a state machine (docked → countdown → ascend → away → arrive → hover → landing → docked).
- Flow: line dock `loaded` → express truck collects → drives its road → unloads when a rocket is docked → `product.cap` cleared → sim `launching` → countdown → ascend → `launched` (stats increment) → another craft lands.
- Particles: engine flame and smoke per craft; the crowd on the line cheers (`Line.celebrate`).
- `PR` runs launch a drone instead of a rocket.

## Invariants
- Eight pads; two rockets and two drones each; launching only after the truck unloads.
- Rockets and drones are never seen loitering in space: above altitude 180 a craft shrinks out of sight (gone by 260) and it comes back down from above that height, replacing the one that left. Docked rockets are upright cylinders (the basis fallback must stay perpendicular to the heading).
- Stats `succeeded` increments on liftoff (`launchSeconds`), not before.
- One craft leaves out of sight as another lands.
- Pre-staged express truck per line.

## Extension points
- LED scoreboard text on gantries; crowd at the pad (loaders, drivers, cheering grains using `Ambient`).

## Known gaps
- No gantry LED countdown text yet; no grains at the pads themselves.
