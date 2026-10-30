# 04 · Farms

## Purpose
Where raw material (crop crates) comes from. A visible loop of seed, grow, harvest, replant.

## Requirements
- Farms with a real life cycle: seed, grow, harvest, replant, forever [user v2].
- Raw materials are trucked/belted to the factory depots (07) [v2].
- Always moving, never idle; nothing pops in or out.
- Filler and edges blend into the land (trees, fences); no barren patch [v2.1].

## Current implementation
- `src/world/farm/Farm.ts`; zone `farm` (lon −66, lat 8, 86 × 104). Sits straight on the terrain (no pad), with its own roads (`ribbonMesh`).
- 4 fields with per-row state machines (sprout, grow, ripe, harvested, replant); crop tint runs green to gold on instanced plants.
- Planters and combines (`vehicles.ts`) run the rows, with dust; domes, silos, windmills as scenery.
- Farmhands: `Ambient` grains on the field track loop with chores (inspect, clipboard, coffee, wave, repair), some carrying boxes, some on scooters, all clickable.
- Output: the crop trunk belt starts at `Farm.out` and runs to the west hub, then elevated feeders go to each line's depot (06, 07).

## Invariants
- Four fields, endless loop, crop colour tied to growth state.
- Harvest feeds the trunk belt; crates enter belts only inside hoods/silos.
- Farm roads and trunk are registered corridors (scenery avoids them).

## Extension points
- More fields: add a row state machine; keep the trunk start in a hood. Livestock/orchards would be new sub-areas inside the zone.

## Known gaps
- No animals; no irrigation visuals; no farm stalls or market (they could live in 16).
