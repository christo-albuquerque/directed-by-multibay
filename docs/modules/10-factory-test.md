# 10 · Factory test (rooms/areas)

## Purpose
Station 4: the testing grounds, a walled room where products are brutally tested by the grains who work there. In GitHub terms: **test / e2e / coverage**.

## Requirements
- Four kinds of test, each done physically by grains [Brief §3.4, user v2.4]:
  1. **Dropped from hands**: a grain picks the box up, carries it, drops it (bounces), picks it up and sets it back.
  2. **Shot with guns**: a grain with a rifle fires at the box, with muzzle flash, tracers and impact sparks.
  3. **Shot with a cannon**: an operator aims and fires the cannon; the ball flies and hits the box.
  4. **Mini rocket launch**: a rocketeer loads, lights and launches a mini rocket from the room's launch section; when the test fails it **explodes on launch or in the air**, when it passes it bursts into confetti.
- Boxes are never moved by machinery with no one touching them; a grain must lift, drop, shoot or fire.
- Grains who work in the room stay inside it while working (no roaming through walls or standing on belts) [user v2.4].
- **Wall TVs** show live metrics normally (passed/failed, duration, queue, success sparkline, rate limit) and quirky lab visuals, as canvas textures. **During a failure every TV shows the "DIRECTED BY MULTIBAY" end-credits card** (glitch, then settle) and returns to metrics when cleared [Brief §3.4]. The TVs must not block the way objects leave the room; there are 5 of them [user v2.4].
- Failure: testers gasp and use extinguishers; hazmat and medic crew with stretchers; debris swept to a hazmat funnel [Brief §4].
- Multiple test types/rooms are welcome [user v2.2].

## Current implementation
- `line/prefabs.ts` `arena`: a walled room open to the sky with gates on the belt axis, gantry towers and cannon mounts. The old target wall across the exit path is gone. `STATIONS[3]` anchor (2, 0), open, label "TESTING GROUNDS"; belt gap half-length 8 (see 06).
- `line/testlab.ts` **`TestLab`** owns the room's crew, the four tests and their effects:
  - Eight testers live in the room, four on each side of the belt (side +x for the bulk lane, −x for the express lane): a dropper (wheat), a gunner (corn, rifle prop), a cannon operator (wheat) and a rocketeer (rice). They walk from fixed posts to their marks and back; they never leave the room.
  - `TEST_SECONDS = 7`. A lane's item takes the tests in turn (`TestLab.kindOf`); an item that is failing always gets the rocket test, so it explodes.
  - `motion[lane]` tells `Line` where to draw the item (carried overhead, bouncing, kicked by a hit, shaking) and `cannon[lane]` drives the cannon barrels and the cannonball; `flash` pulses the arena light.
  - Mini rockets are `Dyn` meshes launched from `launcherPrefab` tubes at (±5.8, −7.1) in room-local coordinates. Failing products explode on the pad or at about 40% of the climb; passing ones burst into green/gold confetti at the top.
- Supervisor: one basmati with a clipboard stays inside the room (no errands).
- TVs: `src/scene/Tv.ts` (`metrics`, `lab` modes, credits card): five on the side walls facing into the room, 3 high on both walls and one higher on the east wall, clear of the cannon mounts and the exit path (`Line.buildScreens`).
- Rescue crew (hut at the west end): 2 hazmat (extinguishers) + 2 medic (stretchers), walking out from the hut to the failing station and back; black smoke plus a pulsing red point light; shared warning light in `PlanetWorld`.
- Hazmat funnel (`props.ts` `funnel`) beside the hut: during an incident the crew's swept debris streams from the broken station into it (`Line.updateCrew`).
- Cancelled runs: product stops, a giant CANCELLED stamp slams down, then the run slides into the scrap chute.
- The old overhead crane head and its lifting choreography (`choreography.ts` `testPose`) are no longer used for items.

## Invariants
- Index 3, open arena, label TESTING GROUNDS; five TVs on the side walls; the belt exit path is clear.
- All four test kinds exist and every item is lifted, dropped, shot or fired at by a grain.
- A failing product gets the mini rocket test and the rocket explodes.
- Room workers stay inside the room while working; the arena has no grains standing on belts.
- TVs show credits for the whole incident, metrics otherwise.
- Testers react to a failure; the rescue crew of four arrives at the failing station.
- Smoke comes from the failing station, not just the arena.

## Extension points
- More tests (e.g. crush press, drop tower, conveyor-jam test): add a `TestKind`, a timeline in `TestLab.update` and an actor role.
- Extra test rooms (unit, e2e, perf): add stations with their own lab; keep TV wiring.
- Funnel animations (debris tipping in).

## Known gaps
- Test choice is rotation-based, not tied to what the real test steps are called.
- The gun and rocket tests have no sound yet.
- "Trapdoor" for cancel is the scrap chute.
- The lab's testers do not react individually to a failure (the arena supervisor and rescue crew do).
