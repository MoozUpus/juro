# Phase 8 — application shell hardening

Date: 2026-07-31

## Implemented

The authenticated shell keeps a dense legal-work surface while the staging-only Cinematic prototype stays isolated at `/:locale/:accountType/prototypes/platform/cinematic` and the business equivalent. The prototype is fail-closed outside `APP_ENV=staging`, requires authentication and returns `noindex, nofollow` metadata.

The mobile shell now exposes the five approved destinations directly: dashboard, AI lawyer, cases, documents and profile. Remaining modules stay available through the accessible drawer opened by the top-bar menu. The former `More` control was removed from the bottom navigation; this prevents profile access from being displaced.

Motion remains limited to a 220 ms transform-only mobile drawer transition, bounded press feedback and the existing navigation indicator. The drawer has Escape handling, focus trapping and focus restoration. Reduced motion shortens transitions and removes press scaling. Reduced transparency disables top-bar backdrop filtering.

Jurobek remains an optimized static image in the staging prototype. The application does not claim a working avatar, microphone, WebGL or live voice capability when no approved rigged asset and verified STT/TTS path are present.

## Verification

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `node --import tsx --test tests/platform-core.test.ts` — 45/45 passed.
- `npm run build:staging` — passed.
- `npm run validate:artifact` — passed.
- focused source scan for OpenAI/Anthropic-style key literals — no matches.
- staging Worker deployment: `juro-platform-staging`, version `3f8ed10e-f927-42fe-8057-65701c5fc82e`.

## Deliberate limitations

`workers_dev` and preview URLs are disabled for staging and no staging route is configured in `wrangler.jsonc`. Consequently there is no browser-accessible staging URL to run protected visual, keyboard and Core Web Vitals checks. The source-level checks above are not a substitute for that runtime QA.

No production Worker, production D1 database, public platform UI route or production visual replacement was changed.