# 17 · Landscape (grasslands, forests, vegetation, mountains, roads)

## Purpose
All scenery that fills the planet between and around districts.

## Requirements
- No empty spaces or barren land; fill the world with trees, small items, filler around zones [user v2.1].
- **Scenery must not overlap belts, roads, feeders or structures** [user v2.2].
- Mountains and other landscaping are wanted [user v2.2].
- Fixed, deterministic world.

## Current implementation
- Terrain colours (`globe/terrain.ts`): forest floor, meadow, rocky waste from `noise3`, matching the scatter.
- `world/scatter.ts` `Scatter(batch, keepClear)`:
  1. **Roads first** (`ROADS`): branch roads and an equatorial ring, with embankments (`roadGeometry`) and lamp posts; registered as corridors.
  2. **Wilderness**: ~22,000 golden-spiral candidates. Forest (round and pine trees, neon trees, bushes), meadow (bushes, sparse trees), rocky (rocks, glowing crystals), polar rocks.
  3. **District edge ring**: trees, bushes, containers, solar panels, masts, lamps around every zone.
  4. **Villages** (15).
- Everything instanced in chunks by direction (`InstancedMesh` with bounding spheres) so the far side is culled; trees are low-poly (5 segments).
- Keep-out: `inDistrict(dir, margin)` rejects zone footprints, plazas (`keepClear`) and all registered belt/road/feeder corridors (`corridors.ts`).
- Seeded RNG so the planet is identical every load.

## Invariants
- No tree, rock, house, lamp or village inside a district, plaza or corridor.
- Roads are built before scenery.
- Deterministic.

## Extension points
- Mountains: add height-aware prefabs (cone rocks) and a relief bump in `reliefAt`; keep them out of zones and corridors. Rivers/lakes need a terrain tint and a bridge rule for roads.

## Known gaps
- No mountain ranges or water yet; terrain relief is mild (0 to −2.1).
- Scatter does not follow terrain slope; scale is uniform.
