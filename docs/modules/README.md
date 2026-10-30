# Module baseline (read this first)

These files describe **what each part of DirectedByMultiBay is supposed to be and do**. They are the baseline for every change: before editing a module, read its file; after editing, update it and run the sync check below.

Sources of truth, in order:
1. The user's current instructions in chat.
2. These module files (kept in step with the code).
3. The original brief, `D:\Projects\DirectedByMultiBay.MD` (Gemini-generated). Its section numbers are cited as **[Brief §n]**.
4. Later chat requests, recorded in each module under "Requested later".

## Modules

| # | File | Covers |
| --- | --- | --- |
| 01 | [world.md](01-world.md) | The planet: globe maths, zones, terrain, camera, lighting, day/night, quality tiers |
| 02 | [grains.md](02-grains.md) | Every kind of grain: models, outfits, props, behaviours, reactions, clicking |
| 03 | [vehicles.md](03-vehicles.md) | Trucks, drones, flying cars, rockets, mine carts, farm machines, forklifts |
| 04 | [farms.md](04-farms.md) | Fields, planters, combines, silos, domes, windmills, crop trunk belt |
| 05 | [mines.md](05-mines.md) | Open pit, ramp, dump trucks, excavator, rail carts, crusher, ore trunk belt |
| 06 | [conveyor-belts.md](06-conveyor-belts.md) | Belts and feeders: where they may exist, routing rules, no-overlap rule |
| 07 | [factory-unloading-dock.md](07-factory-unloading-dock.md) | Depot: where farm/mine resources arrive |
| 08 | [factory-lint.md](08-factory-lint.md) | Lint station |
| 09 | [factory-build.md](09-factory-build.md) | Build station |
| 10 | [factory-test.md](10-factory-test.md) | Testing grounds and TVs |
| 11 | [factory-dispatch.md](11-factory-dispatch.md) | Dispatch/deploy: packing and loading onto trucks |
| 12 | [factory-release.md](12-factory-release.md) | Rocket port: trucks unload, rockets load and launch |
| 13 | [break-rooms.md](13-break-rooms.md) | Plazas: ramen, coffee, hammocks, newspapers, gum |
| 14 | [cities.md](14-cities.md) | The Night Market city and its sky traffic |
| 15 | [villages.md](15-villages.md) | Scattered villages and low-rise blocks |
| 16 | [markets-restaurants.md](16-markets-restaurants.md) | Stalls, diners, neon signs, the ramen stall |
| 17 | [landscape.md](17-landscape.md) | Forests, meadows, rocks, crystals, roads, scenery rules |
| 18 | [space.md](18-space.md) | Sky, stars, moon, ring planet, clouds, satellites, weather |
| 19 | [pipeline-and-data.md](19-pipeline-and-data.md) | GitHub runs → products, stage mapping, polling, demo panel |
| 20 | [ui-and-controls.md](20-ui-and-controls.md) | Camera controls, panels, accessibility, sound |

## How to use these files

**Before a change:** read the module file(s) it touches. Check "Invariants" so nothing is removed or altered by accident.

**After a change:** update the module file in the same commit (behaviour, constants, new files, new gaps), then run the sync check:

```bash
npm test
```

`src/modules.test.ts` checks that every module file exists with the required headings and that the key invariants named in the files still hold in code (counts of lines, stations, grain types, zones, and so on). When an invariant changes on purpose, change the file and the test together.

**Review checklist for any change** (answer each in the commit message or PR):
1. Which modules did this touch? Are their files updated?
2. Did anything listed under "Invariants" change? If yes, was that requested?
3. Does any belt, road, feeder or flying route now overlap a structure, another route, or the terrain, except where an item is deliberately hidden inside a machine?
4. Can anything still appear or vanish in view? (Spawning, despawning and swapping happen only inside hoods, hangars, tunnels or off-screen.)
5. Are tests, build and license check green?

## Global rules (apply to every module)

- Everything is generated in code. No downloaded models, textures, fonts or audio [Brief §0].
- Dependencies are permissive only; CI fails on copyleft [Brief §0].
- No AI/API at runtime; no secrets in the repo; tokens only in the user's browser [Brief §0].
- The friend's repo is not connected until the user says so [Brief §0].
- The world is fixed and always moving: every district exists from the start, loops are closed, nothing pops in or out.
- Belts and conveyors exist only inside factories, farms and mines' own feeders; they never overlap other structures, except where they enter a machine hood to be hidden.
- Weather is random and independent of build results.
- Parody only: no real person's name or likeness; the TV card reads "DIRECTED BY MULTIBAY".
