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
- **Supply by road** (`world/supply.ts` `Supply`): every line has a truck (crop truck from the farm shed for even lines, ore truck from the mine shed for odd lines) that loads unseen inside its shed, drives a registered road to the line's depot bay at local (−49.5, −11), parks, and two porters (rice, corn) carry crates one by one from its bed across to the depot door on trolleys, vanishing inside. The truck turns round and returns in the opposite lane.
- Real runs: a `FactoryState` product starts `inside` the depot housing (`Express` mode `inside`, stage 0) and leaves when the sim moves it to lint.
- Ambient bulk items spawn inside the housing too, at ~one every few seconds, so the belt never starts empty (`seedItems`).
- **Pneumatic cache tube** (`props.ts` `tubeHatch`) at the depot: when a real run's jobs contain a successful step named like "cache" (`sim/runs.ts` `hasCacheHit`), a scooter courier zips to the hatch at double speed (`Folk.zip`).
- Crew: loaders (rice, corn) beside the station with `load` style; haulers with scooters bring crates from piles (02).

## Invariants
- Station index 0, hidden housing; nothing appears outside it.
- Supply arrives by truck at the bay outside the depot door; trucks and porters never cross machines.
- Porters push crates on trolleys; no belt reaches the depot from outside.
- Real runs start here and carry the run key.

## Extension points
- Forklifts at the bay; more trucks per line when activity is high.

## Known gaps
- Deliveries are visual: ambient crates still spawn inside the depot on their own timer, not strictly when a porter delivers.
- Crate labels with real dependency names are not drawn yet.
- Cache-hit detection is only "a successful step whose name contains cache".
