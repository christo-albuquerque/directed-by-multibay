# DirectedByMultiBay

A living 3D globe, **Kepler-22b**, covered by a cyberpunk factory that visualizes real GitHub Actions builds and releases across multiple repositories. Farms and mines feed the build lines, trucks carry finished boxes to the rocket port, and a neon night market never sleeps. The world is always moving: nothing pops in or out, and the scene keeps looping even when no build is running.

Live site: https://christo-albuquerque.github.io/directed-by-multibay/

| | |
| --- | --- |
| ![The whole planet: six build lines, the night market, farms, mines and the rocket port under a ring of clouds](docs/planet-overview.jpg) | ![The night market: neon signs, stalls, diners and a glowing logo](docs/night-market.jpg) |
| **The planet:** a fixed master plan. Every district exists from the start; repos only relabel lines. | **Night market:** stalls, diners, towers and strollers, with hover traffic and drones overhead. |
| ![A build line: dependencies, lint, build, test arena and dispatch](docs/build-line.jpg) | ![The rocket port with eight pads](docs/rocket-port.jpg) |
| **Build line:** crates enter hidden housings at each station, so nothing appears from thin air. | **Rocket port:** one rocket leaves out of sight while another returns from a delivery and takes its place. |
| ![Farms: fields that are seeded, grown, harvested and replanted](docs/farms.jpg) | ![Mines: a spiral pit, dump trucks, mine carts and a crusher](docs/mines.jpg) |
| **Farms:** seed, grow, harvest, replant, forever. | **Mines:** carts go out full and come back empty. |
| ![A break plaza beside a line: ramen tables, a coffee cart, hammocks and string lights](docs/break-plaza.jpg) | ![Rain and lightning rolling over the planet](docs/storm.jpg) |
| **Break plaza:** every line has one. Grains eat ramen, sip coffee, read the paper, blow gum bubbles or nap, while others work. | **Weather:** random drizzle, rain and thunderstorms roll in every few minutes. It has nothing to do with build results. |

The full design lives in [SPEC.md](SPEC.md). Everything is generated in code: no third-party models, textures, fonts or audio. Dependencies must be permissive-licensed (checked in CI).

## Using it

- **Live data:** the page polls GitHub Actions for your repos and turns every run into a product on the belt. Click a
  product (or a run in the top-left list) to see where it is and every step.
- **Several repos, one planet:** each repo gets its own build line, pad, rescue crew and workers. Add or remove repos
  with **📂 Repos** (up to 6); unused lines keep running ambient products. Your list is saved in this browser. You can also use
  `?repos=owner/a,owner/b` in the URL, or change the shipped default in `public/repos.json`.
- **Rate limit:** without a token GitHub allows 60 API requests an hour, so updates slow down. **🔑 Token** takes an
  optional read-only token (kept only in this browser, sent only to api.github.com) for 5000 an hour.
- **Demo Panel:** force every state without GitHub (pick the demo bay from the dropdown when there are several).
- **Accessibility and devices:** works on phones (drag, pinch, tap a product), arrow keys pan the view, panels are
  keyboard-operable, `Esc` closes run details, and a screen-reader status line reports the factory mood. **Motion:
  reduced** (also automatic with your OS setting) removes strobing lights and screen glitches. Big factories lower their
  own render quality if the frame rate drops.

## The grains

Everyone is a little grain with a job and a life, and they are all clickable (they squeak, hop, flip or wave, and drop their box if they were carrying one).

- **Kinds:** rice (blue overalls and a hard hat), corn (husk skirt), wheat (red headband, awns), basmati (tall, goggles, clipboard), quinoa couriers on scooters, tiny millet runners, medics with stretchers and hazmat crews with extinguishers.
- **Walking:** along walkways and tracks with a lazy side-to-side weave, hopping over belts, never in ruler-straight lines.
- **Stations:** polishers with magnifier and feather duster at lint, hammer crews at build, throwers and cannon crews at the testing grounds, loaders and packers at the dock.
- **Always something going on:** even idle lines are busy. Grains haul crates between piles, repair machinery with wrenches, sweep walkways, inspect stations, ride scooters, or take a turn at the plaza.
- **Alarm:** when a new run starts, everyone off duty sprints back to their station.
- **Failure:** testers gasp, grab extinguishers and foam the broken stage while a rescue crew arrives; the TVs roll the credits. A cancelled run gets a giant CANCELLED rubber stamp.
- **Release:** the crowd cheers with glow sticks and flags as the rocket leaves.

## How runs map to the factory

| GitHub | Factory |
| --- | --- |
| Step/job names containing checkout, install, setup, cache | Dependencies (raw material crates) |
| lint, format, eslint | Lint gate |
| build, compile, bundle | Build press (the crate becomes a sealed box) |
| test, e2e, coverage | Testing grounds: lifted, dropped, shot by a cannon, squashed |
| release, deploy, publish, upload | Dispatch: truck, crane, then the launchpad |
| success | Green seal, then a rocket (or a courier drone for `pull_request` runs) lifts off |
| failure at a step | Smoke, sparks and a rescue crew at that step's stage |
| cancelled | The product stops, then slides into the scrap chute |

Not built (yet): matrix builds fanning out into parallel lanes (their jobs share one lane).
- The demo project whose runs feed the default bay is [multibay-testlot](https://github.com/christo-albuquerque/multibay-testlot).

## Develop

```bash
npm install
npm run dev
```

## License

MIT. See [LICENSE](LICENSE).
