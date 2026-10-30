# 19 · Pipeline and data

## Purpose
Turns real (or demo) GitHub Actions runs into products travelling through the factory.

## Requirements [Brief §5–§7]
- Each workflow run is a **Product**; stages map from job/step names (default regexes: dep/install/cache → Depot, lint → Lint, build/compile → Build, test/e2e → Testing, release/deploy/publish → Launch); success continues/launches, failure → Chaos Incident, cancelled → CANCELLED stamp, matrix → parallel lanes (not built), release/tag → rocket, PR → drone.
- Click a product for details: repo, workflow, branch, commit, actor, stage, step list, elapsed time, link to GitHub; a highlight ring shows where it is.
- Adaptive polling (≈10 s active, 60 s+ idle), ETag, back off on 403/429, rate-limit indicator, optional token in `localStorage`; any public repo works.
- Multi-repo config: `{ owner, repo, label? }` from `repos.json`, URL `?repos=a/b,c/d`, an in-app editor; no code change per repo. Up to **6** repos (one line each). The friend's repo is not connected yet.
- Demo Panel forces every state without GitHub; Full cycle; `multibay-testlot` has real workflows (ci, controllable, release) for end-to-end demos.

## Current implementation
- `src/sim/`: `factory.ts` (`FactoryState`, `Product` with `u`, `status`, `failAt`, `cap`, `pr`, `launchSeconds`), `runs.ts` (normalise runs, steps → progress), `stages.ts`; unit tested.
- `src/data/github.ts`: poller with ETag, `cache: 'no-store'`, backoff, rate limit.
- `src/config.ts`: repo list (`MAX_BAYS` alias of `MAX_LINES`), saved in the browser.
- `src/main.ts`: wires poller → per-line `FactoryState`; apply repos relabels lines (`setLabel`, `resetRuns`).
- Visual gating: `Product.cap = stage + 0.99` so the sim never outruns what is on screen; a finished run waits at 4.99 for its truck.
- UI: `ui/LivePanel.ts`, `ui/ProductPanel.ts`, `ui/DemoPanel.ts`, `ui/NavPanel.ts`.

## Invariants
- Sim is pure TypeScript and independent of the scene; the scene is driven from sim state.
- A release is only "live" when the rocket lifts off.
- Unauthenticated polling stays within limits (adaptive, ETag).
- Max 6 repos; config needs no code change.

## Known gaps
- `status.json` push model; Demo Panel lacks an activity slider, a matrix/cache button and a weather button.
