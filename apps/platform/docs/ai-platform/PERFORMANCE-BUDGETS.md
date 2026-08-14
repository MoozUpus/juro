# Artifact performance budgets

## What is checked

`npm run performance:artifact` reads the already-built `dist` artifact and
fails when an emitted raw-byte guardrail regresses. It records six independent
values:

| Metric | Current baseline | Limit | Meaning |
| --- | ---: | ---: | --- |
| Client CSS | 510,814 B | 563,200 B | All emitted client CSS files |
| Initial browser JS | 299,846 B | 327,680 B | Vite browser entry and its static import closure |
| Largest lazy route JS increment | 212,853 B | 245,760 B | Largest dynamic-client-module closure after subtracting the static boot graph |
| Client fonts | 465,616 B | 524,288 B | Emitted font files |
| Client images | 577,980 B | 655,360 B | Emitted static image files |
| Worker entry | 5,726,119 B | 6,291,456 B | `dist/server/index.js` |

The exact baseline and limits are versioned in
`performance-budgets.json`. Limits are intentionally near the August 2026
artifact baseline: they catch accidental growth while a framework-level CSS
code-splitting limitation is addressed separately.

## How it is used

The platform build and `validate:artifact` task run this check after the
Cloudflare artifact validator. The standalone command is useful when comparing
an already-built candidate:

```sh
npm run performance:artifact
npm run performance:artifact -- --json
```

The fixture test is part of `npm run test:rendered`.

## Important boundary

These values are emitted **raw artifact bytes**, not browser-transfer bytes.
They do not measure caching, request priority, compression negotiated by the
edge, hydration, LCP, INP, CLS, or user-perceived AI latency. A Chrome DevTools
performance trace against an Access-authorized staging session remains required
before declaring Core Web Vitals passed.

Vinext currently emits one shared RSC CSS asset for this application. The
budget makes that fact visible and prevents silent growth; it must not be
reported as route-level CSS delivery until the bundler output changes and a
network trace confirms it.
