# Phase 8 cinematic prototype evidence

Updated: 2026-07-30
Status: deployed to owner-only staging and control-plane verified; authenticated visual gates remain open.

## Implemented

- staging-only `/prototypes/platform/cinematic` entry;
- authenticated personal routes `/:locale/:accountType/prototypes/platform/cinematic`;
- authenticated business route `/:locale/business/:workspaceId/prototypes/platform/cinematic`;
- server-side exact `APP_ENV === staging` guard and noindex metadata;
- real application shell, tenant, session, dashboard API, AI chat, analysis, builder, cases, plan, handoff, profile/settings routes;
- RU/UZ copy;
- static official Jurobek WebP with honest avatar/voice limitation;
- scoped cinematic shell/reading surfaces, responsive and accessibility preference CSS.

## Local evidence

- type-check: pass;
- lint: pass;
- targeted platform core: 41/41;
- rendered Worker routes: 28/28 after correcting a harness-only staging-env assumption;
- staging build: pass, including personal and business prototype route manifests;
- Impeccable detector: `[]`;
- dependencies: none added;
- migration: none.
- full regression cycle: 416/416 (28 rendered, 305 core, 83 Cloudflare);
- final type-check and lint: pass;
- exact staging build/artifact and Cloudflare binding types: pass;
- production-profile build/artifact validation: pass without deployment;
- document-builder and document-comparison smokes: pass;
- high-confidence changed-file secret scan: 0 matches across 24 files.

## Remote staging evidence

- Worker: `juro-platform-staging`;
- version: `cfef8153-3322-4ce5-b271-3478a0531b28` (version 34);
- deployment: `fd9e8bde-1f09-43d5-b2ae-413e4e730110`;
- source annotation: `phase 8 cinematic staging prototype 8cb9fea`;
- traffic: 100% to the exact Phase 8 version;
- protected hostname: `https://staging.app.juro.uz`;
- anonymous `HEAD` requests to the unscoped, RU, UZ, and canonical builder staging routes all return `302` to Cloudflare Access with private/no-store cache policy;
- D1 `juro-staging`: `PRAGMA quick_check` returned `ok`; `PRAGMA foreign_key_check` returned zero rows; `changes=0`, `rows_written=0`;
- exact version bindings re-read: staging D1 `bb716a96-b2fb-4823-90d6-6c228fed181a`, private staging file/backup/quarantine R2 buckets, seven staging Queue producers, four staging Vectorize indexes, Analytics Engine, assets, and images;
- secret-name inventory contains only `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`; values were not read;
- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are absent, so no live AI provider result is claimed;
- production Worker `juro` remains at version `91774ed4-72e9-47bb-b93a-a4208d490b24` from 2026-07-26 and was not deployed.

## Corrective deployment evidence

An initial CLI process still had `CLOUDFLARE_ENV=staging` while deploying an already flattened staging artifact with explicit `--name`. Wrangler therefore formed the unintended exact name `juro-platform-staging-staging`. Queue attachment failed before traffic migration. The unintended Worker was deleted with its exact resolved name, and the subsequent version read returned expected error `10007` (Worker does not exist). The correct deploy then used the generated staging config with explicit `--name juro-platform-staging`, `--keep-vars`, and `--strict`, without a second environment suffix.

No D1, R2, Queue, Vectorize, Sites, custom-domain, or production resource was deleted or altered during this correction.

## Open gates

The browser-control runtime still exits before opening Chrome because its generated kernel is treated as ESM while calling CommonJS `require`. Access was not bypassed. Authenticated screenshots, interactive keyboard/focus QA, axe, 200% zoom, console/hydration inspection, real-device performance, GPU/memory, and visual regression are therefore not recorded.

Phase 8 is a deployed staging checkpoint, not a passed release gate. No production Worker, D1, R2, route, Sites version, or UI was changed.
