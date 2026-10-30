# 01 · The World

## Purpose
A rounded planet, **Kepler-22b**, that holds every district, always present and always moving [Brief §3, user v2 request].

## Requirements
- Rounded globe, not flat; a massive factory takes over the planet; the world is fixed (districts never appear or disappear; repo count only relabels lines) [v2].
- No empty spaces or barren land; districts touch each other or are joined by filler (trees, roads, small kit) [user, v2.1].
- Always alive: day/night turns even when idle; nothing holds still.
- Cyberpunk feel in the city, bloom and neon allowed [v2].
- Camera: bird's-eye default, zoom limits, orbit [Brief §1]; works on phones.

## Current implementation
- Files: `src/globe/` (`surface.ts`, `path.ts`, `zones.ts`, `terrain.ts`, `sky.ts`, `GlobeControls.ts`, `GlobeWorld.ts`), `src/world/PlanetWorld.ts`, `src/world/pads.ts`, `src/world/kit.ts`, `src/world/pools.ts`.
- **Globe maths** (`surface.ts`): radius `R = 160`. `Chart` is an azimuthal-equidistant local map (x east, z south, y up) so every district is authored in flat units and wraps the sphere. `basisAt`, `lonLatDir`, `toLocal`, `point`, `matrix(x,z,h,rot)`.
- **Paths** (`path.ts`): `SurfacePath` follows a chart polyline (`through`) or free 3D points (`through3D`); `at`, `offset`, `nearest`, `ribbon`.
- **Zones** (`zones.ts`): master plan, never changes at runtime.

| Zone | Where (lon, lat) | Size w × d |
| --- | --- | --- |
| city "Night Market" | 0, −8 | 84 × 58 |
| 6 build lines (`line0`…`line5`) | lon ±(22.5 + row·2.75), lat 12 + row·15; even lines west, odd lines east and turned half round | 96 × 34 each |
| rocket port | 74, 30 | 64 × 84 |
| farm | −66, 8 | 86 × 104 |
| mine | 66, −14 | 92 × 84 |
| power fields | −4, 60 | 120 × 32 |

- **Terrain** (`terrain.ts`): icosphere detail 46, flat-shaded; low-poly relief 0 to −2.1 below `R`; biome colours (forest floor, meadow, rocky waste) match the scenery scatter; zone colours blended under districts; mine pit carved (`PIT_RADIUS 30`, `PIT_DEPTH 13`). Pads (`pads.ts`) are flat bent slabs so districts meet the terrain cleanly.
- **Lighting** (`GlobeWorld.ts`): sun, moon, hemisphere light; `DAY_SECONDS = 900`; `nightAt(dir)` is per place, so each district dusks on its own; glow materials brighten with `setGlow(group, night)`. Bloom + ACES tone mapping. Shadows follow the camera focus.
- **Quality ladder:** a frame-rate watcher lowers bloom, then pixel ratio, then shadows. Far forests hide when the tier is low and the camera is far.
- **PlanetWorld** composes everything and exposes `pick`, `pokeGrain`, `findProduct`, `setSelected`, `update`.

## Invariants (do not break)
- `R = 160`; six build lines (`MAX_LINES = 6`); one city, port, farm, mine, power zone.
- Zones never overlap (tested in `globe.test.ts`).
- Nothing is added to or removed from the world at runtime.
- `Chart` convention: x east, z south, local +x of a station frame = left of travel.
- Day/night always advances (except the debug `frozen` flag).

## Extension points
- New district: add to `ZONES`, give it a `Chart`, a pad, a terrain colour, and register its belts/roads (see 06).
- New scenery: see 17.

## Known gaps
- Power fields are mostly decorative (panels, pylons); no moving parts yet.
- Poles are ice-coloured and sparse.
