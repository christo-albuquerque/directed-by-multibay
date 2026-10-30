# 20 · UI and controls

## Purpose
How a person looks around, inspects runs, and runs the demo, on desktop and phone.

## Requirements
- Orbit/zoom camera with limits; works on phones [Brief §1, §8].
- Reduced-motion option, keyboard-accessible panels, screen-reader status line [Brief §8].
- WebAudio synthesized sounds with a mute button, off until user interaction [Brief §8].
- **Dragging or touching the world must never spin, snap or fling it.** [user v2.2]

## Current implementation
- `globe/GlobeControls.ts`: drag turns the globe; right-drag or shift-drag turns/tilts; wheel and pinch zoom (`MIN_DIST 26`, `MAX_DIST 560`); two fingers rotate and tilt; arrow keys/WASD pan, Q/E rotate, +/− zoom; `flyTo` for presets and selection.
  - The camera facing is a tangent vector **carried along the surface** (parallel transport), never measured from north, so there is no pole singularity.
  - Per-event movement is clamped (90 px), flick glide is capped (28 px/frame) and scaled by frame time, stale pointers are cleared on blur or lost capture, NaN moves are ignored.
- `ui/NavPanel.ts`: presets (Planet, Factory, Market, Rocket port, Farms, Mines) with `flyTo`.
- `ui/LivePanel.ts`, `ProductPanel.ts`, `DemoPanel.ts`: live status, run details, demo buttons.
- `ui/sfx.ts`: synthesized sound (siren, boom, crash, thud, stamp, rumble, squeak, rain); `ui/motion.ts`: reduced motion.
- Taps: runs first, then grains (squeak and reaction).

## Invariants
- Camera never uses a fixed-north heading for movement; pole crossing is smooth (checked in the console: steps stay constant across lat 89.9°).
- Inertia is capped and stops when the pointer stops.
- Esc closes run details; panels are keyboard operable; srStatus announces mood.

## Known gaps
- No automated test for pointer gestures (only the manual pole-crossing check).
