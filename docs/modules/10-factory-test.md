# 10 · Factory test (rooms/areas)

## Purpose
Station 4: the testing grounds, where products are brutally tested. In GitHub terms: **test / e2e / coverage**. May hold several test areas.

## Requirements
- Wheat squad throws boxes at walls, shoots them with cannons, drops and crushes them; survivors get a green seal [Brief §3.4].
- A few **wall TVs** near the arena: live metrics normally (passed/failed, duration, queue, success sparkline, rate-limit), quirky lab visuals (scrolling test names, oscilloscope, stress gauge), all canvas textures. **During a failure every TV shows a bold "DIRECTED BY MULTIBAY" end-credits card** (glitch, then settle) and returns to metrics when cleared [Brief §3.4].
- Failure: testers gasp and use mini extinguishers; hazmat and medic crew with stretchers; debris swept to a hazmat funnel [Brief §4].
- Multiple test types/rooms are welcome [user v2.2].

## Current implementation
- `line/prefabs.ts` `arena`, `craneHead`, `cannonBarrel`; `STATIONS[3]` anchor (2, 0), open, service 7.5 s, label "TESTING GROUNDS".
- Choreography (`src/scene/choreography.ts` `testPose`): lift, drop, cannon shot (`SHOT_PHASE`), impact (`IMPACT_PHASE`), squash. Cranes and cannons are `Dyn` parts, one per lane; the real run loops through the routine while its real tests run.
- TVs: `src/scene/Tv.ts` (`metrics`, `lab` modes, credits card). Two per arena, driven by `FactoryState` mode and stats.
- Crew: wheat testers (`throw` style, `tester` flag), a basmati clipboard supervisor. On failure testers `gasp`, then `spray` extinguisher foam at the incident.
- Rescue crew (hut at the west end): 2 hazmat (extinguishers) + 2 medic (stretchers), walking out from the hut to the failing station and back; black smoke plus a pulsing red point light; shared warning light in `PlanetWorld`.
- Cancelled runs: product stops, a giant CANCELLED stamp slams down, then the run slides into the scrap chute.

## Invariants
- Index 3, open arena, label TESTING GROUNDS; two TVs per arena.
- TVs show credits for the whole incident, metrics otherwise.
- Testers react (gasp, spray); rescue crew of four arrives at the failing station.
- Smoke comes from the failing station, not just the arena.

## Extension points
- Extra test rooms (unit, e2e, perf): add stations with their own choreography; keep TV wiring.
- Hazmat debris funnel (sweep to a funnel prop).

## Known gaps
- No hazmat funnel; "trapdoor" for cancel replaced by scrap chute.
- Only one arena style.
