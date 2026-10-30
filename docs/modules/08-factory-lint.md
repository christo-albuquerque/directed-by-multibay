# 08 · Factory lint (room/area)

## Purpose
Station 2: a worker polishes each crate. In GitHub terms: **lint / format**.

## Requirements
- A worker with a magnifier and a feather duster polishes each crate; the crate sparkles when it passes [Brief §3.2].
- Lint failure: smoke at this exact station, crew rushes here [Brief §4].
- Open station (visible), so the polishing can be seen.

## Current implementation
- `line/prefabs.ts` `lint`; `STATIONS[1]` anchor (−6, −11), **not hidden**, service 3 s, label "LINT".
- Crew: two rice polishers (`polish` style: magnifier in the right hand, duster in the left, swinging) plus a basmati clipboard supervisor. Posts are on the near side of the walkway.
- Scrap chute on the express side (`Line.buildStations`) takes rejected runs.
- Failure: product turns red, black smoke and a red point light at this station, rescue crew from the hut, TVs show credits (see 10).

## Invariants
- Open (not hidden) station, index 1, label LINT.
- Polishers carry magnifier + duster.
- Every crate that leaves lint (ambient or real) gets a sparkle burst (`Line.sparkle`).
- A failure at lint puts smoke and the crew at lint.

## Extension points
- More polish effects (shine on the crate tint).

## Known gaps
- None open.
