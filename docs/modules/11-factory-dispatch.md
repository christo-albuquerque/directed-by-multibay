# 11 · Factory dispatch / deploy

## Purpose
Station 5 and the dock: products that passed tests are packed and loaded (by hand, crane or forklift) into crates onto trucks that are already waiting, ready for release. In GitHub terms: **release / deploy / publish / upload**.

## Requirements
- Passed boxes ride a conveyor to a truck [Brief §3.5]; loaded using hands/forklifts in crates onto trucks [user v2.2].
- Pre-staged handoff: the truck is waiting when tests finish [v2].
- Hidden housing for the final swap (no pop-in) [v2].

## Current implementation
- `line/prefabs.ts` `dispatch`, `packer`, `dock`; `STATIONS[4]` anchor (−12, 11), hidden housing, service 3 s, label "DISPATCH".
- Dock at the belt end (`Line.dockPose`): a hood where the finished real run waits (`Express` mode `loaded`, `cap = 4.99`) until its express truck arrives.
- `Line.waitingAtDock()` / `collectFromDock()` hand the run to the port's truck; the line forgets its visual (`dispatched` set prevents re-creation).
- Crew: rice loaders and packers (`load`, `pack`) beside the dock; haulers bring crates from piles.

## Invariants
- Hidden dispatch and dock hoods; the run stays at u = 4.99 until the truck unloads it at the pad.
- A collected run is never re-created on the line.
- Express truck waits at the dock (pre-staged).

## Extension points
- Forklift that visibly lifts boxes from belt end onto the truck bed.

## Known gaps
- No forklifts; loading is hidden inside the dock hood.
