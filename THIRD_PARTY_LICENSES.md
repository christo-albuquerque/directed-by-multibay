# Third-party licenses

DirectedByMultiBay is MIT licensed (see [LICENSE](LICENSE)).

## What ships to the browser

The built site contains exactly one third-party library:

| Package | License | Purpose |
| --- | --- | --- |
| [three@0.186.1](https://github.com/mrdoob/three.js) | MIT | 3D rendering |

Everything else you see or hear is generated in code at runtime: every model (built from Three.js primitives),
texture (drawn to canvases), sound (WebAudio synthesis) and icon. There are **no downloaded models, images, fonts or
audio files**. The page makes network requests only to `api.github.com` (public Actions data) and to its own origin.

CI runs `npm run license-check`, which fails the build if any production dependency uses a copyleft license
(GPL, LGPL, AGPL, SSPL, EUPL or MPL).

## Build and test tooling (not shipped)

Development tools such as Vite, TypeScript, Vitest and license-checker are used only to build and test the site and are
not part of what is served. Their licenses are permissive (MIT, ISC, Apache-2.0, BSD, BlueOak, CC0), with these
exceptions, which are build-time only:

| Package | License | Why it is here |
| --- | --- | --- |
| lightningcss | MPL-2.0 | Vite's CSS minifier. Used unmodified at build time; its code is not in the output. |
| spdx-exceptions, spdx-ranges | CC-BY-3.0 (data) | Dependencies of the license-checker tool itself. |

## Name and parody

"DIRECTED BY MULTIBAY" is a parody of an action-movie credit line. No real person's name, image or likeness is used,
and nothing here is affiliated with any real production company or space agency. Kepler-22b is a real exoplanet name;
the planet, factory, grains and rockets shown are original, generic artwork.
