# 07 · Factory unloading dock (Depot / dependencies)

## Purpose
First station of every line: raw materials arrive from the farm and mine and become the crates that start each pipeline run. In GitHub terms: **dependencies** (install, cache, checkout).

## Requirements
- Raw-material depot with crates labelled by real dependency/step names [Brief §3.1].
- `cache-hit` pulls a crate from an underground pneumatic tube; the worker zips off on a scooter [Brief §3.1] (not built).
- Resource trucks come in from farms and mines [user v2.2]; supplies pre-staged so nothing waits [v2].
- `queued` runs wait at the depot gate [Brief §5].
- Items are born inside the housing (nothing pops in view) [v2].

## Current implementation
- `line/prefabs.ts` `depot`, placed first on the route (`STATIONS[0]`, anchor (−38, −11), hidden housing, service 2.4 s, label "DEPENDENCIES").
- Supply arrives by elevated feeder (`feeders.ts`) into the depot's intake (`Line.supply()` gives entry, outside and ramp points). Truck drop-off bays: planned, not built (feeders replace trucks for supply).
- Real runs: a `FactoryState` product starts `inside` the depot housing (`Express` mode `inside`, stage 0) and leaves when the sim moves it to lint.
- Ambient bulk items spawn inside the housing too, at ~one every few seconds, so the belt never starts empty (`seedItems`).
- Crew: loaders (rice, corn) beside the station with `load` style; haulers with scooters bring crates from piles (02).

## Invariants
- Station index 0, hidden housing; nothing appears outside it.
- Feeder arrives at the depot, never crossing machines on the way.
- Real runs start here and carry the run key.

## Extension points
- Truck bays with unloading forklifts; a pneumatic tube hatch for cache hits (needs a `cache` flag on the run).

## Known gaps
- No visible truck unloading (feeders do the supply job).
- Crate labels with real dependency names are not drawn yet.
