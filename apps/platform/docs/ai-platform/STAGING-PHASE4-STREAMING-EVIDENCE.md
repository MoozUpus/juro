# Phase 4 validated streaming — evidence

Date: 2026-07-31
Scope: `POST /api/platform/ai` and the authenticated AI-lawyer client
Environment: local validation complete; deployed to owner-protected staging

## Implemented contract

- OpenAI Responses API is requested with `stream: true` for the authenticated browser flow.
- The Worker parses semantic SSE events across arbitrary byte boundaries and both CRLF/LF framing.
- The browser receives only `accepted`, `provider_started`, `provider_delta`, and `fallback` status metadata before completion.
- Provider-generated legal content is released only as a terminal response after JSON Schema, Zod, verified-source, persistence, and usage-ledger checks.
- Stop/disconnect propagates an `AbortSignal` to both the primary provider and any eligible fallback.
- A cancelled run stores `AI_CANCELLED`, releases its reservation, and leaves no consumed usage cycle.
- No database migration, Cloudflare resource, runtime dependency, or production route was added.

## Local evidence

- `npx tsx --test tests/ai-platform.test.ts`: 9 passed, 0 failed.
- `npm run type-check`: passed.
- `npm run lint`: passed after abort-listener review.
- `npm test`: 313 core tests and 84 Cloudflare tests passed; bounded development build passed.
- `npm run build:staging`: passed and validated the staging artifact.
- `npm run cf:types:check`: generated bindings are current.
- `npm run validate:cloudflare:matrix`: development, staging, and production-profile build/dry-run matrix passed when run sequentially.
- `git diff --check`: passed.

## Review findings fixed before staging

1. SSE CRLF delimiters split between network chunks are normalized after concatenation.
2. Caller cancellation is checked before timeout retry in the Anthropic fallback.
3. Retryable provider errors may retry within the two-attempt bound, while `AI_CANCELLED` stays terminal.
4. Request abort listeners are removed on every terminal path.


## Protected staging postflight

- Commit: `83a673f` (`feat(platform): stream validated AI responses safely`).
- Worker: `juro-platform-staging`.
- Version: `1cbc9ea9-6ec8-4ab8-9495-b880b269f423` at 100% traffic.
- Deployment message: `Phase 4 validated AI streaming 83a673f`.
- Remote D1 `juro-staging`: `PRAGMA quick_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows; zero writes.
- Anonymous request to `https://staging.app.juro.uz/ru/individual/ai-chat`: `302` to Cloudflare Access with `no-store`; protection was not bypassed.
- Staging secret-name inventory remains exactly `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`.
- Production Worker `juro` latest version remains `91774ed4-72e9-47bb-b93a-a4208d490b24`.

## Open gates

- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are absent from the last inspected staging secret-name inventory.
- No live OpenAI/Anthropic request, token/cost row, provider fallback, or authenticated RU/UZ stop trace is claimed.
- Authenticated browser streaming, cancellation, RU/UZ rendering, and D1 ledger evidence remain open until provider secrets and an authenticated staging session are available.
- Reconnect/resumable generation remains unimplemented.

Production is unchanged. Functional production deployment and production UI replacement remain separate explicit owner approvals.
