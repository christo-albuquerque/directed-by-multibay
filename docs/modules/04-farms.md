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
- Irrigation canals are `bentSlab` strips that follow the ground (they used to be flat 90-unit boxes that floated in the air).
- Planters and combines (`vehicles.ts`) run the rows, with dust; domes, silos, windmills as scenery.
- Farmhands: `Ambient` grains on the field track loop with chores (inspect, clipboard, coffee, wave, repair), some carrying boxes, some on scooters, all clickable.
- Output: crop trucks (`supply.ts`) load unseen inside a shed at the farm's south end (chart (0, 52)) and drive to the depots of the west column lines (07). No belts leave the farm.

## Invariants
- Four fields, endless loop, crop colour tied to growth state.
- Harvest is moved by combines and trucks; there are no belts.
- Farm roads and the supply roads are registered corridors (scenery avoids them).

## Extension points
- More fields: add a row state machine; keep the trunk start in a hood. Livestock/orchards would be new sub-areas inside the zone.

## Known gaps
- No animals; no irrigation visuals; no farm stalls or market (they could live in 16).
