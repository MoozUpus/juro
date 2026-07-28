# Cinematic platform prototype route

Updated: 2026-07-28
Status: route contract approved; no compliant staging route is deployed yet; production UI unchanged.

## Required surface

The protected design surface will use a route such as:

```text
/:locale/:accountType/prototypes/platform/cinematic
```

For business workspaces, the canonical account route shape remains `/:locale/business/:workspaceId/...`. The final prototype path may move the prototype segment earlier if required by the existing route compiler, but must preserve locale/account/workspace identity and direct-refresh behavior.

## Deployment boundary

The route must exist only on a distinct staging Worker/hostname or behind a server-enforced staging feature flag. It must:

- be `noindex, nofollow`;
- require a real authenticated staging session;
- use only isolated staging D1/R2/Queue/Vectorize and synthetic/anonymized data;
- keep the current production dashboard and homepage unchanged;
- share real application services/components rather than in-memory demo success;
- expose honest disabled/“Скоро” states where a provider or backend is absent;
- support direct URL, refresh, back/forward, RU/UZ, desktop/tablet/mobile, keyboard, reduced motion, and non-WebGL fallback.

The existing Sites project cannot host this staging route because it has no preview URL and every Sites deployment is production. An older public in-memory cinematic surface is reference material only and is not accepted as the staging prototype.

## Required vertical slice

The first staging slice must prove one connected journey with server authorization and persistence:

1. application shell and workspace/current-case context;
2. dashboard next action;
3. AI-lawyer entry and chat state;
4. voice mode that remains usable without avatar/WebGL;
5. document-analysis entry and real job state;
6. document-builder entry through the existing canonical route;
7. case plan/deadline context;
8. least-privilege lawyer-handoff preview;
9. profile/settings and loading, empty, processing, partial, error, offline, denied, limit, cancelled, and archived states.

No step may display a successful analysis, upload, voice, queue, handoff, or AI response unless the corresponding staging backend operation and evidence exist.

## Review gate

Before owner review, the route requires:

- type-check, lint, unit/integration/route/security tests, build, artifact validation, and strict secret scan;
- remote staging D1/R2/Queue binding smoke;
- document-builder canonical route regression;
- keyboard/focus/dialog/drawer/tab/ARIA tests;
- screenshots for 1440, 768, 390, and 360 widths in RU and UZ;
- 200% zoom, reduced motion, no horizontal overflow, and screen-reader status checks;
- console/hydration/network failure review;
- LCP/INP/CLS, bundle, GPU/memory, avatar-off, WebGL-unavailable, and long-session measurements;
- a documented switch back to the existing UI.

After review, production migration still requires a separate explicit UI-replacement approval. Publishing the staging prototype is not that approval.
