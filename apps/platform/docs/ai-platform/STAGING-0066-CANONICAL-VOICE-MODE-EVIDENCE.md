# Staging evidence: canonical voice mode after migration 0066

Date: 2026-08-04

Environment: staging only

Production impact: none

## Scope

This checkpoint exposes the existing real voice-message pipeline through canonical localized routes while preserving the same authenticated AI chat, case, history, usage, and tenant context:

- `/:locale/:accountType/ai-lawyer/voice`;
- `/:locale/business/:workspaceId/ai-lawyer/voice`;
- legacy business-context compatibility route `/:locale/business/ai-lawyer/voice`.

The canonical route redirects with HTTP 308 to the existing AI chat and adds `mode=voice`. It does not create a second chat backend or duplicate usage accounting.

## Implemented behavior

- text and voice modes share the same chat and case context;
- recording starts only after an explicit user action;
- the user can pause, stop, cancel, review, edit, and confirm the transcript;
- an AI request is created only after transcript confirmation;
- speech playback has voice selection, mute, stop, replay, captions through the persisted answer text, and native pause controls;
- UI state is derived from the real recorder, transcription, streaming, and audio lifecycle;
- RU and UZ labels are present;
- the approved static Jurobek WebP is used as a non-critical visual fallback;
- voice-with-avatar remains disabled because no approved rigged 3D asset or verified lip-sync source is present;
- text chat remains usable without microphone, TTS, image, animation, or WebGL.

## Data and security

- migration `0066_voice_recordings.sql` was already applied to `juro-staging` before this UI checkpoint;
- audio uses the existing authenticated private-R2 upload/finalize path;
- MIME, magic bytes, size, hash, ownership, workspace, and retention checks remain server-side;
- transcripts remain encrypted in D1 by the existing voice pipeline;
- no provider key is sent to the browser;
- this checkpoint adds no new migration, binding, secret, bucket, queue, or Vectorize index.

## Local verification

| Check | Result |
| --- | --- |
| `npm run type-check` | Passed |
| `npm run lint` | Passed without warnings |
| Full `npm test` | Passed, including Vinext build and route manifest |
| `npm run test:cloudflare` | 102/102 passed |
| Focused voice and route tests | 11/11 passed |
| `npm run build:staging` | Passed |
| `node scripts/platform-tasks.mjs artifact --environment staging` | Passed |
| `npm run cf:types:check` | Passed; generated types are current |
| `npm run validate:cloudflare:matrix` | Passed for development, staging, and production artifacts; no deploy performed by the matrix |
| Canonical local voice route | HTTP 308 to `/ru/individual/ai-chat?mode=voice` |
| `npm run smoke:document-builder` | Passed: 34 scenarios; DOCX, PDF, and ZIP produced |
| `npm run smoke:document-comparison` | Passed: comparison and PDF/DOCX exports produced |
| `npm run smoke:case-create` | Passed: case, plan, and four steps persisted |

The builder smoke reported `aiStatus: unavailable` in the local process because local provider secrets are intentionally absent. The smoke itself passed, and this does not modify or inspect staging secret values.

## Motion and accessibility contract

- no `transition: all`;
- no automatic microphone activation;
- no fake recording or speaking state;
- focus-visible states are present for the mode switch and controls;
- press feedback uses a short `scale(.98)` transform;
- motion is disabled or reduced under `prefers-reduced-motion`;
- avatar and color are not the sole carriers of state;
- the functional voice flow does not depend on hover or WebGL.

## Staging deployment

- Worker: `juro-platform-staging`;
- Worker version ID: `19c6ab86-0039-41d3-afb1-f46ab694b087`;
- deployment ID: `1d40d5b7-9791-4ec5-9374-23e74084b745`;
- traffic: 100% to the version above;
- D1 migration check: `No migrations to apply!`;
- anonymous `https://staging.app.juro.uz/ru/individual/ai-lawyer/voice` returns HTTP 302 to Cloudflare Access with `no-store` and preserves the requested voice URL as `redirect_url`;
- public route remains protected by Cloudflare Access;
- production Worker `juro` remains on version `91774ed4-72e9-47bb-b93a-a4208d490b24`, deployed on 2026-07-26; it was not deployed or changed by this checkpoint.

## Known limitations

- browser microphone and audio-output behavior still require an authenticated Cloudflare Access browser session for full staging UI QA;
- no approved rigged 3D Jurobek asset is available, so avatar mode, facial animation, and lip-sync remain disabled rather than mocked;
- realtime duplex voice remains feature-flagged off;
- the broader legal-evaluation, document-evaluation, malware-scanner, and full responsive/accessibility release gates remain outside this checkpoint and are not claimed as complete.
