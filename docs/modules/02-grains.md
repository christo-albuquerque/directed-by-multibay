# 02 · The Grains

## Purpose
The workforce and population: tiny procedural grains with jobs and lives. They are the main focus: the interesting things that happen in each pipeline stage and on breaks [user, v2.1].

## Requirements
- Types [Brief §2]: short-grain rice (pearl white, blue overalls, hard hat; assembly), golden corn (heavy machinery), wheat berry (QA/testing), quinoa (express couriers on scooters), millet (small fast runners hauling raw materials), long-grain basmati (slim, clipboard, goggles; supervisors), medics/hazmat (failure response). Also punk/neon looks for the city.
- Micro-details: idle sway and blink, gum bubbles, newspapers, hammock naps; size/speed variation so the crowd never looks cloned [Brief §2].
- **Clicking** [Brief §2]: a click makes an idle grain jump, flip, squeak or wave; a grain carrying a box drops it, stumbles, grabs it and carries on.
- They walk curved, lived-in paths, never ruler-straight lines; they hop belts, haul boxes, repair, sweep, inspect, take breaks, and sprint to stations on the alarm [user v2.1].
- Idle is a mix: chores, boxes, maintenance, breaks; not everyone on break [user v2.1].
- Failure: testers gasp and use extinguishers; hazmat and medic crew arrive with stretchers [Brief §4].
- Release: crowd cheers with glow sticks and checkered flags [Brief §4].
- Procedural only: capsule bodies, no assets [Brief §0].

## Current implementation
- `src/world/crowd.ts`: `CrowdRenderer` draws every grain with instanced meshes (body, hat, arms, legs, eyes) plus one instanced mesh per **outfit** (overalls, husk, awn, sprout, goggles, cross, hazmat), per **prop** (chopsticks, cup, extinguisher, clipboard board, broom, wrench, magnifier, duster, glow stick, flag, newspaper, gum bubble, stretcher), carried crate and scooter. `LOOKS` defines the ten looks (rice, corn, wheat, quinoa, millet, basmati, medic, hazmat, punk, neon) with `girth`/`len` body shapes. Animation helpers: `walkLimbs`, `workLimbs(style)`, `styleProps(style)`. Work styles: hammer, polish, load, throw, clipboard, sweep, wave, sit, sip, spray, dance, ramen, coffee, news, gum, nap, treat, pack, cheer, inspect, repair.
- `src/world/folk.ts`: **`Folk`** is the crowd of one build line. `Net` is a small walkway graph with Dijkstra routing so grains walk round machines. Each agent has a post and errands (piles to haul between, machines to repair, floors to sweep, stations to inspect, plaza seats). States: work, walk, do. Curved steering with a lazy weave; belt hop; `alarm()` makes off-duty grains run to posts; `cheer()`; incident reaction (testers gasp, then spray foam); `poke(id)`; `actionPose` (hop, flip, wave, stumble with dropped crate, gasp); `pokeAction` (squeak pitch per type).
- `src/world/ambient.ts`: **`Ambient`** gives grains on paths (farm, mine, market) the same reactions: weave, random or stall stops, chores, carried boxes, scooters, clicking.
- Villages: three `Ambient` villagers per plaza.
- Per line (`Line.populate`): ~36 grains: station crews (rice/corn/wheat/basmati), 5 haulers (quinoa on scooters, millet runners), 2 maintenance + 2 inspectors, 6 plaza regulars; plus the rescue crew (2 hazmat, 2 medic) living at the hut.
- Clicking: `PlanetWorld.pokeGrain` (grains within ~3.5% of the screen) is tried after run picking in `main.ts`.

## Invariants
- The ten `LOOKS` exist and keep their colours/hats/outfits (tested).
- Every grain is clickable and reacts; carrying grains stumble and drop their box.
- Grains never walk in perfectly straight lines (weave) and never teleport (they walk to posts, seats and piles).
- Rescue crew: 2 hazmat + 2 medic per line, housed in the hut, with extinguishers/stretchers.
- Alarm on rising activity sends off-duty grains running to their posts.
- Cheering on launch; gasp then spray on failure at test.

## Extension points
- New look: add to `LOOKS` (+ outfit geometry if needed). New chore: add a `WorkStyle` in `workLimbs`, a prop in `styleProps`, and a POI in the owning module.
- New district population: use `Folk` (stations, schedules) or `Ambient` (paths).

## Known gaps
- Port crowd (loaders, drivers) and farm/mine crews use `Ambient`, not stations.
- Gum bubbles only at plazas and markets.
