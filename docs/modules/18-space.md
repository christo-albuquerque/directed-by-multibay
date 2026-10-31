# 18 · Space (sky, orbit, weather)

## Purpose
Everything above the ground: stars, atmosphere, moon, ring planet, clouds, satellites, and weather.

## Requirements
- Rocket launches visible from the planet; rockets leave out of view [v2].
- Day/night cycle; golden light when busy, neon twilight when quiet [Brief §4].
- Weather: **random** drizzle, rain and storms every so often. Not tied to failures [user v2.1] (the brief's "rain after failures" is superseded).
- Procedural only; no textures or models [Brief §0].

## Current implementation
- `globe/sky.ts`: star field, atmosphere shader, moon, ring planet, cloud layers (fade by camera distance).
- `globe/GlobeWorld.ts`: sun, moon and hemisphere lights; `DAY_SECONDS = 900`; `nightAt`; bloom; manual frame timing.
- `city/Skyways.ts`: satellites on tilted orbits at R+210 to R+400.
- **Demo Panel weather button** cycles six modes (`world/weatherModes.ts`): Dynamic (the random schedule), Clear, Rainy, Snow, Overcast, Off. Dynamic also includes snow and overcast spells; the others hold one state until changed.
- `world/weather.ts` `Weather`: in Dynamic mode picks, when each spell ends, one of four skies with **equal chance**: clear, rain (a drizzle, rain or storm, equally likely), snow or overcast; each lasts 60–140 s; level eases in and out; dims sun (−60%) and hemisphere light (−30%); rain streaks around the camera focus; storms add two-blink lightning and delayed thunder (`sfx.rumble`); `sfx.rainOn`. `planet.weather.begin('storm', seconds)` forces a spell for testing.

## Invariants
- Weather never reads build results; `dynamic` is the default.
- Snow never plays the rain sound.
- Weather and day/night keep running when idle.
- Reduced motion suppresses lightning flashes.

## Extension points
- Wind-blown clouds, snow near the poles, aurora; keep them independent of the factory state.

## Known gaps
- No per-region weather (it follows the camera); overcast has no visible clouds beyond the dimming.
