# JURO motion guidelines

Updated: 2026-07-30
Status: applied to the isolated cinematic prototype.

## Vocabulary and budget

| Level | Allowed use | Prototype implementation |
|---|---|---|
| Feedback | press, hover, focus | 140–160 ms transform/color on links; hover only for fine pointers |
| State indication | loading, errors, current step | inherited real dashboard status and existing first-session Golden Route |
| Spatial consistency | mobile drawer, directional link | inherited 220 ms drawer; 3 px arrow translation |
| Explanation | rare first-use process | existing Golden Route only; no additional page-load choreography |
| Decoration | ambient motion | none |

Motion is interruptible where interactive, never delays navigation, and never hides legal content. New prototype motion uses only `transform`, color, and opacity-compatible transitions. There is no `transition: all`, `ease-in`, scale-from-zero, infinite loop, cursor tracking, scroll hijack, parallax, WebGL, or animation of layout properties.

## Reduced motion

`prefers-reduced-motion: reduce` removes press scale, disables smooth scrolling inside the prototype, shortens remaining state feedback, and relies on static end states. `prefers-reduced-transparency`, `prefers-contrast`, and forced-colors modes preserve the same information.

## Review result

| Before | After | Why |
|---|---|---|
| No isolated cinematic prototype | Scoped prototype with restrained directional feedback | Connects related work routes without turning a dashboard into a presentation |
| Potential temptation to animate Jurobek | Static 60,670-byte WebP with explicit fallback label | No verified rig, lip sync, or WebGL dependency exists |
| No prototype-specific reduced-transparency contract | Solid navy fallback and higher-contrast text | Maintains legibility for accessibility preferences |
| Shared shell still animates grid/width | Left unchanged and logged as P1 migration debt | Production UI replacement is not authorized |

The `review-animations` and `improve-animations` passes found no P0/P1 issue introduced by the prototype. The existing shared shell layout transition remains the only P1 motion finding.
