# 05 · Mines

## Purpose
Where ore crates come from. Carts go out full and come back empty.

## Requirements
- Mines with minecarts: out full, back empty, forever [user v2].
- Ore is trucked/belted to the factory depots (07) [v2].
- Everything visibly moving; spawn/despawn only inside tunnels or hoods.

## Current implementation
- `src/world/mine/Mine.ts`; zone `mine` (lon 66, lat −14, 92 × 84). Open pit (`PIT_RADIUS 30`, `PIT_DEPTH 13`, carved into the terrain mesh) with a spiral ramp road.
- 3 dump trucks run the ramp; an excavator (`Dyn` chain) digs; a pit conveyor lifts ore to the crusher; rail line with tunnel hood and mine carts (`railOut`/`railBack`); ore heaps; crusher with smoke; outpost where the trunk starts (`Mine.out`).
- Miners: `Ambient` grains on the pit rim with chores (inspect, clipboard, repair, wave, coffee), some hauling, some on scooters; clickable.
- Output: ore trunk belt to the east hub, then elevated feeders to each depot (06, 07).

## Invariants
- Carts and trucks run closed loops; carts enter and leave only through the tunnel hood.
- Pit geometry comes from `pitDepthAt`; vehicles follow `pitDepthAt` heights so they never sink into the bowl or float.
- Ramp and trunk are registered corridors.

## Extension points
- More cart lines or a second pit: add a path, register it, keep portals as hoods.

## Known gaps
- Cart/ramp heights are tuned by eye; no audit of ramp vs terrain beyond `pitDepthAt`.
- No mountains next to the mine yet (see 17).
