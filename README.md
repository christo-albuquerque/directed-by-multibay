# DirectedByMultiBay

A living 3D factory on the planet **Kepler-22b** that visualizes real GitHub Actions builds and releases across multiple repositories. Tiny grain workers haul dependencies, run build machines, stress-test products and launch releases into orbit. When nothing is running, everybody takes a ramen break.

Live site: https://christo-albuquerque.github.io/directed-by-multibay/

| | |
| --- | --- |
| ![Idle: the whole crew on a ramen break at night, with hammock naps and a neon RAMEN sign](docs/idle-ramen-break.jpg) | ![Busy: workers at every station, a crate on the belt, cannon and crane ready at the testing grounds](docs/busy-factory.jpg) |
| **Idle:** machines hum down, the plaza unfolds, everyone eats ramen, sips coffee or naps. | **Busy:** a real run travels the belt through dependencies, lint, build and test. |
| ![Failure: black smoke from the build machine, foam spraying, rescue crew arriving, DIRECTED BY MULTIBAY on the TVs](docs/failure-chaos.jpg) | ![Release: a truck delivers the finished box and a crane loads it into the rocket](docs/release-loading.jpg) |
| **Failure:** smoke at the broken stage, extinguishers, a rescue crew, and the credits on the TVs. | **Release:** the truck, crane and rocket (pull-request builds leave by courier drone). |
| ![Two repos, two bays, two launchpads on one planet](docs/two-bays.jpg) | |
| **Many repos:** every repo gets its own bay and launchpad on a shared planet. | |

The full design lives in [SPEC.md](SPEC.md). Everything is generated in code: no third-party models, textures, fonts or audio. Dependencies must be permissive-licensed (checked in CI).

## Using it

- **Live data:** the page polls GitHub Actions for your repos and turns every run into a product on the belt. Click a
  product (or a run in the top-left list) to see where it is and every step.
- **Several repos, one factory:** each repo gets its own bay, launchpad, rescue crew and workers, all sharing one planet
  and break plaza. Add or remove repos with **📂 Repos** (up to 4). Your list is saved in this browser. You can also use
  `?repos=owner/a,owner/b` in the URL, or change the shipped default in `public/repos.json`.
- **Rate limit:** without a token GitHub allows 60 API requests an hour, so updates slow down. **🔑 Token** takes an
  optional read-only token (kept only in this browser, sent only to api.github.com) for 5000 an hour.
- **Demo Panel:** force every state without GitHub (pick the demo bay from the dropdown when there are several).
- **Accessibility and devices:** works on phones (drag, pinch, tap a product), arrow keys pan the view, panels are
  keyboard-operable, `Esc` closes run details, and a screen-reader status line reports the factory mood. **Motion:
  reduced** (also automatic with your OS setting) removes strobing lights and screen glitches. Big factories lower their
  own render quality if the frame rate drops.

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
| cancelled | CANCELLED stamp and a trapdoor |
| 3 failures in a row | Storm clouds and rain |

Not built (yet): a matrix build does not fan out into parallel conveyor lanes; its jobs share one lane.
- The demo project whose runs feed the default bay is [multibay-testlot](https://github.com/christo-albuquerque/multibay-testlot).

## Develop

```bash
npm install
npm run dev
```

## License

MIT. See [LICENSE](LICENSE).
