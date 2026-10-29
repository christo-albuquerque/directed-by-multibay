# DirectedByMultiBay

> **v2 (milestones 9-14): globe redesign.** The flat isometric v1 (tag `v1-flat`) was replaced by a rounded planet
> with a fixed master plan: 6 build lines, farms, mines, a rocket port, a cyberpunk night market and sky traffic.
> All loops are closed (no pop-in/out: items enter hidden housings, rockets leave out of view while another returns),
> and everything is still generated in code. Source: `src/globe` (planet, camera, zones) and `src/world` (districts).
>
> **Status (milestones 0-8 complete).** The original spec below is kept as written. What differs in the build:
> - Each repo has its **own launchpad** (and rescue hut, alarm and crew), not one shared central pad.
> - Rendering is vanilla TypeScript + Three.js with a small DOM overlay (no React).
> - Added: click-to-inspect panel, per-repo bays with an in-page repo editor, reduced-motion mode, adaptive render
>   quality, courier drones for PR builds, a rescue hut and crew, and a screen-reader status line.
> - **Not built:** matrix builds as parallel conveyor lanes; a status.json push model for tokenless polling.
> - See `THIRD_PARTY_LICENSES.md` for the license audit (one runtime dependency, `three`, MIT).

> A living 3D factory on the planet **Kepler-22b** that visualizes real GitHub Actions builds and releases across multiple repositories.

A tiny workforce of grains (rice, corn, wheat, quinoa, millet, basmati) hauls dependencies, runs build machines, brutally tests products, and launches releases into orbit by rocket. When nothing is running, everybody takes a ramen-and-coffee break. It is both a toy and a genuinely useful dashboard: click any product and see exactly which pipeline stage it is in.

The name is a pun: **Multi-Bay** = one factory bay per repo, and the over-the-top spectacle of an action-movie finale. (Parody only: no real person's name, image or likeness appears anywhere in the app.)

---

## 0. Project facts

| Item | Value |
| --- | --- |
| Owner | GitHub user `christo-albuquerque` |
| Visualizer repo | `directed-by-multibay` (**public**), served on GitHub Pages at `https://christo-albuquerque.github.io/directed-by-multibay/` |
| Demo/test repo | `multibay-testlot` (**public**), a small real project whose workflows feed the demo |
| License | **MIT** |
| Local tools | `D:\Projects\Tools\{gh,git,node}`, all on user PATH. `gh` is already authenticated (scopes: repo, workflow, read:org). Git identity and `main` default branch are already configured globally. Do not ask the user to log in again. |
| Local folder | `D:\Projects\directed-by-multibay` and `D:\Projects\multibay-testlot` |
| Future | The friend's public repo is connected later via config only. **Do not connect it now.** |

### Legal and safety rules (non-negotiable)
- **No third-party assets.** Every model, texture, sound and icon is generated in code (Three.js primitives, procedural canvas textures, WebAudio synthesis). No downloaded model packs, images, fonts or audio.
- **Fonts:** system font stack only, unless an OFL/Apache font is self-hosted and credited.
- **Dependencies must be permissive** (MIT/BSD/Apache/ISC). No GPL/LGPL/AGPL/copyleft. Run a license check (e.g. `license-checker`) in CI and fail the build on a copyleft license. Keep a `THIRD_PARTY_LICENSES.md`.
- **No trademarks or lookalikes:** generic rockets, trucks and machines. Do not imitate SpaceX/NASA logos or any branded designs. Never use any real person's name or likeness in the UI (including the meme overlay, which reads only *"DIRECTED BY MULTIBAY"*).
- **No AI/API dependencies at runtime.** Only static files plus the public GitHub REST API.
- **No secrets in the repo.** Tokens (optional) live only in the user's browser `localStorage`.

---

## 1. Tech stack

- **Vite + TypeScript + vanilla Three.js** (no React; small DOM overlay for UI).
- Orthographic/isometric-style camera with orbit, zoom limits and a bird's-eye default.
- Simulation separated from rendering (see section 6).
- Instanced meshes and object pooling for workers and crates; keep it smooth on a laptop and acceptable on a phone.
- Deployed by a GitHub Actions workflow to GitHub Pages (`actions/deploy-pages`). Vite `base: '/directed-by-multibay/'`.
- Tests: Vitest for the simulation/state mapping logic. Playwright smoke test optional.

---

## 2. The workforce (all procedural, low-poly, flat shaded)

| Grain | Colour | Role |
| --- | --- | --- |
| Short-grain rice | pearl white `#F0EAE1`, blue overalls, hard hat | Assembly line |
| Golden corn | yellow `#F5B041` | Heavy machinery operators (presses, cranes, switches) |
| Wheat berry | amber `#D35400` | QA and testing squad |
| Quinoa | ruby `#922B21` | Express couriers on scooters |
| Millet | small, pale gold | Fast runners hauling raw materials |
| Long-grain basmati | slim, cream, clipboard and goggles | Supervisors and operators |
| Medics / hazmat | any grain in suits | Failure response |

Micro-details: idle sway and blink, gum bubbles, tiny newspapers, hammock naps. Variation in size and speed so the crowd never looks cloned.
**Interactions:** clicking an idle worker makes them jump, flip, squeak or wave at the camera. Clicking a worker carrying a box makes them drop it, stumble, grab it and keep running.

---

## 3. Factory layout (bird's-eye, readable)

Each connected repo gets its own **Bay**, labelled with the repo name. Stage layout inside a bay, left to right, so progress reads spatially:

1. **Raw Material Depot (dependencies):** crates labelled with the real dependency/step names (e.g. `npm-deps`, `cache`). A `cache-hit` pulls a crate from an underground pneumatic tube and the worker zips off on a scooter (speed boost).
2. **Lint station:** a worker with a magnifier and feather duster polishes each crate; it sparkles when passed.
3. **Build machines:** one machine per build job/step. Corn operators load crates, sealed product boxes come out onto conveyor belts. **Matrix builds** appear as parallel conveyor lanes with identical squads working in sync.
4. **Testing Grounds:** wheat squad throws boxes at walls, shoots them with cannons, drops and crushes them. Products that survive get a green seal. A few **wall-mounted TV screens** sit near the testing area. Normally they show live metrics (tests passed/failed, run duration, queue depth, success rate sparkline, rate-limit usage) and quirky test-lab visuals (scrolling test names, a fake oscilloscope, a stress-test gauge), all rendered to canvas textures. **During a failure every TV switches to a bold "DIRECTED BY MULTIBAY" end-credits card** (glitch flicker, then settles), and returns to metrics when the incident is cleared.
5. **Packing and Dispatch:** passed boxes ride a conveyor to a truck.
6. **Truck route to the Launchpad:** truck drives to the central depot, which loads rockets.
7. **Launchpad:** gantry with LED countdown, cheering crowd, rocket lifts off with particle smoke trail.

Release type distinction: `main`/tag releases launch **rockets**; PR/preview builds go out as small **courier drones**.
The factory must never look like an obvious loop: randomized timings, varied paths, background traffic, pooled objects spawning and despawning off-screen.

---

## 4. Factory states

- **Idle, "The Shift Break":** machines drop to a soft hum. A ramen stall and coffee cart appear in the courtyard. Workers slurp noodles with chopsticks, sip coffee, blow gum bubbles, read micro-newspapers, nap in hammocks. Scene eases to **dusk/night** with neon machine glow and string lights.
- **Alarm, "New Commit":** a rotating red klaxon and siren. Workers drop bowls, put on hard hats, sprint to stations. Day lighting returns.
- **Running:** busier = more workers, faster belts, more traffic. Activity level is driven by number of active runs (and recent run frequency).
- **Failure, "The Chaos Incident":** product turns red with warning stripes. Smoke puffs from the exact failing machine/step (the eye goes straight to the broken stage). Testers gasp and use mini extinguishers; a hazmat and paramedic crew arrive with stretchers and sweep debris into a hazmat funnel. The TV screens near the testing area all show *"DIRECTED BY MULTIBAY"* for the duration of the incident (see section 3). **Rain clouds** drift in after several consecutive failures.
- **Cancelled:** a giant rubber stamp reading **CANCELLED** slams on the box and a crane drops it through a trapdoor.
- **Success / Release:** box rides the truck, rocket gantry LEDs count down, workers wave glow sticks and checkered flags, rocket launches. **A release is only counted "live" when the rocket actually lifts off.**
- **Daytime/golden light when busy, neon twilight when quiet.**

---

## 5. Pipeline to factory mapping

Each GitHub Actions workflow run = one **Product** with a unique ID.

| GitHub concept | Factory representation |
| --- | --- |
| Workflow run (`queued`) | Crate order waits at the depot gate |
| Run `in_progress` | Product moves through stages |
| Job / step names | Mapped to stages via config (default regexes: `dep\|install\|cache` -> Depot, `lint` -> Lint, `build\|compile` -> Build, `test\|e2e` -> Testing, `release\|deploy\|publish` -> Launch) |
| Conclusion `success` | Product continues / launches |
| `failure` | Chaos Incident at the failing stage |
| `cancelled` | CANCELLED stamp + trapdoor |
| Matrix jobs | Parallel lanes |
| Release/tag published | Rocket lifts off |

**Click a product (or its pipeline)** to open a panel: repo, workflow, branch, commit message, actor, current stage, step list with status, elapsed time, link to the real run on GitHub. A highlight ring/trail shows where it is physically.
Animation timing should feel plausible vs real durations but need not be exact; if a stage is slow in reality, the product visibly waits/processes longer.

---

## 6. Architecture

```
src/
  sim/        # pure TS: Product, Stage, FactoryState, ActivityLevel, mapping, state machine (unit tested)
  data/       # DataSource interface + GitHubPoller, DemoSimulator, (optional) StatusJsonSource
  scene/      # Three.js: planet, bays, machines, conveyors, trucks, rockets, effects, lighting
  agents/     # worker generator, behaviours (steering/state machines), crowd manager
  ui/         # DemoPanel, ProductPanel, RepoConfigPanel, HUD, minimap
  config/     # repos.json defaults + localStorage user config
```

- A single `DataSource` interface emits normalized `RunEvent`s. The factory consumes events and never cares whether they come from GitHub or the simulator.
- Scene is driven from sim state, not the reverse.

### Multi-repo configuration
- Config is an array of repos: `{ owner, repo, label?, stageMap?, color? }`.
- Default: `christo-albuquerque/multibay-testlot`.
- Add/remove repos in a UI panel, via URL params (`?repos=a/b,c/d`) and `repos.json`. Each repo gets its own Bay automatically (layout adapts to bay count). Adding a repo needs no code change.
- Any public repo works with no token.

### Rate limits (important)
Unauthenticated GitHub API is ~60 requests/hour per IP. Therefore:
- Adaptive polling: fast (about 10s) while something is active, slow (60s+) when idle; use `ETag`/`If-None-Match`; only fetch `/runs/{id}/jobs` for in-progress or just-finished runs.
- Show a visible rate-limit indicator and back off politely on 403/429.
- Optional read-only token in `localStorage` (never committed) to raise limits to 5000/h.
- Optional alternative: each repo's workflow publishes a `status.json` (e.g. to the hub repo / Pages) via a reusable workflow, which removes polling pressure entirely.

---

## 7. Demo and testability (must-have)

### Demo Panel (floating UI, always available)
Buttons to force every state instantly without GitHub: Idle (ramen), New commit alarm, Start build, Build failure, Test failure, Cancel, Release and rocket launch, Matrix build, PR drone, Rain storm, plus a "Full cycle" auto-demo (idle -> commit -> build -> test -> release -> idle) and an activity-level slider.

### Real end-to-end demo with the `multibay-testlot` repo
A tiny real project (e.g. a small Node library with real tests and a lint step) with workflows:
- `ci.yml`: install (with caching), lint, build, test (optionally matrix), on push and PR.
- `release.yml`: creates a tag + GitHub Release, on `workflow_dispatch` and on push of tags.
- A **controllable workflow** with `workflow_dispatch` inputs: `fail_at: none | lint | build | test`, `delay_seconds`, `matrix: true|false`, `cancel_me`. Lets the user trigger success, each kind of failure and cancellation from the GitHub UI or `gh workflow run`.
- A script/README listing the exact commands to run a full demo: idle -> trigger -> watch factory -> failure -> fix -> release.
Run the visualizer in one browser tab (the Pages site or `npm run dev`) and trigger real builds from GitHub in another.

---

## 8. Milestones (build in order; commit after each; each ends with a working, verified state)

0. **Repos and plumbing:** create both public repos with `gh`, MIT license, `.gitignore`, README, CI + Pages deploy workflow, license-check job. Verify the empty site deploys.
1. **Scene foundation:** planet, isometric camera, lighting, one bay with placeholder stages, Demo Panel scaffold.
2. **Workers:** procedural grain generator (all variants), movement/behaviours, crowd manager.
3. **Stages and machines:** depot, lint, build, testing, dispatch, truck, launchpad, rocket, conveyors.
4. **States and effects:** idle ramen break, alarm, failure chaos, cancel stamp, rain, day/night, particles, WebAudio synthesized sounds (with mute button, off by default until user interaction).
5. **Live data:** GitHub poller, normalization, stage mapping, product selection panel.
6. **Test repo:** `multibay-testlot` with all workflows; verify a real run drives the factory.
7. **Multi-repo UI** and adaptive bay layout.
8. **Polish:** performance, mobile, accessibility (reduced-motion option, keyboard-accessible panels), README with GIFs, final license audit.

At each milestone: take screenshots with the built-in browser and fix visual problems before moving on. Keep the sessions' scope small to stay within usage limits.

---

## 9. Definition of done
- Public site live on Pages; demo panel runs every state; the test repo's real workflow runs visibly drive the factory; adding a second repo needs only config; nothing third-party is bundled besides permissive npm dependencies; license audit passes.
