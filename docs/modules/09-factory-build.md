# 09 · Factory build (room/area)

## Purpose
Station 3: machines turn crates into sealed product boxes. In GitHub terms: **build / compile / bundle**.

## Requirements
- One machine per build job/step; corn operators load crates; sealed boxes come out on belts [Brief §3.3].
- Matrix builds as parallel lanes with identical squads in sync [Brief §3.3] (not built).
- Heavy machinery run by golden corn [Brief §2].
- Failure at build: smoke at this machine, crew arrives [Brief §4].
- Hidden housing hides the crate-to-box swap (no pop-in) [v2].

## Current implementation
- `line/prefabs.ts` `build`, `pistonHead`; `STATIONS[2]` anchor (24, −11), hidden housing, service 3.6 s, label "BUILD".
- One piston press per lane (`Dyn` `pressHeads`) animates whenever an item is inside; chimney smoke (`Line.smoke`) scales with activity.
- Crates enter as `crate`, the express item becomes a `box` halfway through service (`e.kind = 'box'`).
- Crew: five corn operators (`hammer` style) on the near side; maintenance crews repair nearby generators.

## Invariants
- Hidden housing; crate → box swap happens inside it.
- Index 2, label BUILD, a press per lane.
- Corn crews use `hammer`.

## Extension points
- Matrix lanes: one press per extra lane.

## Known gaps
- Matrix builds not built.
