# 16 · Markets and restaurants

## Purpose
Places where grains shop, eat and drink: the Night Market stalls and diner plaza, the ramen stalls and coffee carts at every break plaza, and village stalls.

## Requirements
- Ramen stall and coffee cart [Brief §4]; markets/stalls/neon signs in the cyberpunk city [user v2].
- Grains eat ramen with chopsticks, sip coffee, read newspapers [Brief §4].

## Current implementation
- City (`city/City.ts`, `signs.ts`): two rows of stalls facing a plaza with tables and seated diners (ramen and cup props), strollers who stop at stalls, neon signs from one atlas, spinning logo.
- Break plazas (`line/plaza.ts`): ramen stall (neon RAMEN sign, lanterns), coffee cart, tables (see 13).
- Villages (`scatter.ts`): 3 stalls per village plaza (pink/cyan/amber awnings with neon strips).

## Invariants
- Stalls always have signs/neon; ramen stalls exist at every plaza and the city.
- Diners hold chopsticks or cups.

## Extension points
- Food variety (noodle bowls, skewers), stall owners (grains behind counters), menu boards with real run names.

## Known gaps
- Stall owners not modelled; no steam on stalls.
