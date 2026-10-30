# 17 · Landscape (grasslands, forests, vegetation, mountains, roads)

## Purpose
All scenery that fills the planet between and around districts.

## Requirements
- No empty spaces or barren land; fill the world with trees, small items, filler around zones [user v2.1].
- **Scenery must not overlap belts, roads, feeders or structures** [user v2.2].
- Mountains and other landscaping are wanted [user v2.2].
- Fixed, deterministic world.

## Current implementation
- **Mountains and lakes** (`globe/terrain.ts` `reliefAt`): ridged peaks up to 15 units with rock and snow colouring, lakes as flat basins at `WATER_LEVEL` (−2.8). A `landMask` keeps both 28+ units from districts and 12–28 units from roads (`world/roads.ts`: `ROADS`, `roadDistance`). Scenery skips lakes.
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
- Rivers need a bridge rule for roads; mountains must keep clear of every registered corridor.

## Known gaps
- Mountains reach 15 units and are climbable by scenery only; lakes are flat colour (no reflections or boats).
- Scatter does not follow terrain slope; scale is uniform.
