# 13 · Break rooms (plazas)

## Purpose
Where grains eat, drink, read, chew gum and nap. In v1 this was the "Shift Break" courtyard that appeared when idle; in v2 plazas are permanent and always partly in use.

## Requirements
- Ramen stall and coffee cart; grains slurp noodles with chopsticks, sip coffee, blow gum bubbles, read micro-newspapers, nap in hammocks; string lights; neon dusk when quiet [Brief §4].
- Idle is a **mix**: breaks, maintenance and boxes, not everyone on break [user v2.1].
- Alarm: grains drop what they are doing and sprint to stations [Brief §4].
- Fixed world: plazas never appear or disappear [v2].

## Current implementation
- `src/world/line/plaza.ts` `buildPlaza(batch, chart, zone, cx, cz)`: a plaza pad on the avenue side of each line at line-local (53, −8.5), built from a ramen stall (striped awning, neon RAMEN sign, lanterns, pot), coffee cart with umbrella, two tables with stools and bowls, two hammocks, four string-light posts. Returns **rest seats** (`Poi`, kind `rest`): 6 ramen, 2 nap, 3 coffee, 2 news, 3 gum.
- Used by `Folk` (02): six regulars always occupy seats; others come for a break when their lazy factor and the line's activity allow, and go back when the alarm sounds.
- Seats flag `taken` so two grains never share one.
- The plaza footprint is excluded from scenery (`Line.plazaDir`).

## Invariants
- One plaza per line, with the seats above and the same props.
- Regulars are always present; plaza activities use the same styles (`ramen`, `coffee`, `news`, `gum`, `nap`).
- Plaza never overlaps a belt or road corridor.

## Extension points
- More amenities (vending machine, arcade, bench); villages and the city have their own (15, 16).

## Known gaps
- No sound for the stall; no steam from the pot.
