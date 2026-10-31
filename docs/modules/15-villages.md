# 15 · Villages

## Purpose
Small settlements scattered over the whole planet so no land is empty.

## Requirements
- Fill the world with stuff; no empty spaces or barren land [user v2.1].
- Seamless integration with other zones, with filler around them [user v2.1].
- Fixed world; nothing appears or disappears [v2].

## Current implementation
- `src/world/scatter.ts` (villages block): up to 72 villages placed by seeded random (`rng(20250611)`, so the planet is the same every visit), at least 12 units from any district, not in a pit, on near-flat ground.
- **Alpine villages** (near mountains, where ground within 22 units rises above 3.2): igloos with entrance tunnels and snow-capped log cottages with chimneys instead of ordinary houses.
- Each village: 7–13 houses (4 colour variants with lit windows) or, for a third of them, an urban cluster with 4–14 high neon-window blocks; water tower or silo; a small plaza with 3 stalls and lamps.
- All buildings are baked into the static batch; keep-out against zones, corridors (belts/roads/feeders) and plazas (`inDistrict`).
- The equatorial ring road and branch roads link villages to the districts.

## Invariants
- Villages never overlap districts, roads, belts or plazas.
- Three villagers per village (`scatter.ts` `Scatter.ambient`) stroll a loop round the plaza with chores, clickable.
- Same layout every load (seeded).
- Window glow follows the `wild` group night level.

## Extension points
- Village grains (`Ambient` loops around the plaza) and village-specific stalls.

## Known gaps
- Houses do not follow terrain slope (lifted 0.2).
