# JURO public-site motion system

The public homepage uses motion to explain how a legal question becomes an actionable result. Motion is not required to read or operate the page.

## Vocabulary and budget

- Hero: staged entrance, kinetic headline, pointer-responsive depth, and user-controllable scenario crossfade.
- Product story: scroll-linked active-state progression that preserves native scrolling.
- Document analysis: clause highlight and finding crossfade tied to scroll or explicit tab selection.
- Case continuity: progressive timeline from question to plan, document, and lawyer handoff.
- Handoff: dossier assembly and restrained character idle motion.
- Supporting sections: one-time reveal plus short hover or press feedback only.
- Legal content and FAQ: minimal motion.

## Timing tokens

- Fast feedback: `140ms`.
- Small state change: `180–220ms`.
- Content transition: `320–520ms`.
- Explanatory entrance: up to `880ms`, without delaying interaction.
- Premium ease-out: `cubic-bezier(.23, 1, .32, 1)`.
- Spatial movement: `cubic-bezier(.77, 0, .175, 1)`.

## Performance rules

- Continuous motion updates only CSS custom properties inside `requestAnimationFrame`.
- Animated properties are primarily `transform` and `opacity`.
- Intersection observers disconnect from elements after the first reveal.
- No scroll hijacking, blocking stagger, `transition: all`, or layout-property animation.
- No new runtime dependency is required.

## Accessibility

`prefers-reduced-motion: reduce` disables progress, transforms, keyframes, and long transitions. All content remains visible and all product states remain available through native buttons and tabs. Pointer effects are ignored for touch input.
