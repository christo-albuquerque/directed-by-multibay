# 14 · Cities

## Purpose
The cyberpunk hub: the Night Market city (Cyberpunk-2077-style neon) and the sky traffic above it.

## Requirements
- Cyberpunk feel: neon signs, markets, stalls, flying drones/vehicles, a bright night look [user v2].
- Not boxed in by tall towers; fill the world with stuff [user v2.1].
- Always moving, even when idle [v2].

## Current implementation
- `src/world/city/City.ts`, zone `city` (lon 0, lat −8, 84 × 58). Mid-rise towers (heights 8–16 at the back, 5–11 on the sides) with glowing windows; stalls, diners, a spinning logo, steam vents, and roads with lane lines.
- `signs.ts`: `SignAtlas`, one canvas texture for all neon signs (one draw call).
- Population: diners seated with ramen/cup props; strollers are `Ambient` grains that follow lane loops, stop at stalls, carry boxes, ride scooters, and react to clicks.
- `Skyways.ts`: hover-car lanes (heights 24, 30, 38, 40, 48), package drones (22–31), satellites. Closed loops.
- The city is joined to the world by roads (see 17) and surrounded by villages and forest.

## Invariants
- City zone fixed at lon 0, lat −8; neon signs from the shared atlas.
- Towers never exceed the sky lanes below them (lanes ≥ 24 over the city).
- Sky traffic loops forever.

## Extension points
- More districts of the same city: add to `City` with stalls/signs; keep towers varied and low enough to read the market.

## Known gaps
- Market signs read mirrored from behind.
- Only one city; no skyscraper cluster by design.
