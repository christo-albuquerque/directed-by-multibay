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
  - **Camera roll fix:** screen-up is built from the carried frame in the plane of the view (`dir * sin(tilt) - fwd * cos(tilt)`). The old code used the surface normal as camera up, which is parallel to the view at tilt 0 (reached by right-drag tilting down); `lookAt` then picked a random roll and the next left-drag spun the globe wildly.
- **Rotation axis guide** (GlobeControls.axisGuide): while a drag or two-finger turn is in progress a cyan line through the planet's centre, with a ring round it, shows the axis the world is turning about (left-drag: perpendicular to the focus direction and the drag direction; right-drag, shift-drag and two-finger turn: the view axis through the focus). It is smoothed, flips to avoid swinging, and fades out 0.5 s after release.
- Per-event movement is clamped (90 px), flick glide is capped (28 px/frame) and scaled by frame time, stale pointers are cleared on blur or lost capture, NaN moves are ignored.
- `ui/NavPanel.ts`: presets (Planet, Factory, Market, Rocket port, Farms, Mines) with `flyTo`.
- `ui/LivePanel.ts`, `ProductPanel.ts`, `DemoPanel.ts`: live status, run details, demo buttons (Success run, Fail @ lint/build/test, Cancel all, Speed, Sound, Motion, Matrix build, Cache hit run, Weather, Full cycle).
- `ui/sfx.ts`: synthesized sound (siren, boom, crash, thud, stamp, rumble, squeak, rain); `ui/motion.ts`: reduced motion.
- Taps: runs first (the camera then **follows the box** through belt, dock, truck, pad and rocket until the rocket passes about 240 altitude: `GlobeControls.follow`, `PlanetWorld.productPosition`), then vehicles (follow), then grains (squeak and reaction). Dragging, zooming or tapping the "Following" chip stops it.
- **Time dial** (`ui/TimeDial.ts`, top-right under the navigation buttons, clear of the run details panel): a ring with a sun/moon handle showing the sun's position; drag it to set the time of day (the time locks), click Auto to let days run again.

## Invariants
- Camera never uses a fixed-north heading for movement; pole crossing is smooth (checked in the console: steps stay constant across lat 89.9°).
- Inertia is capped and stops when the pointer stops.
- Esc closes run details; panels are keyboard operable; srStatus announces mood.

## Known gaps
- No automated test for pointer gestures (only the manual pole-crossing check).
