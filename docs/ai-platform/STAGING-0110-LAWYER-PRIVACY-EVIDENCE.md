# Staging 0110 — lawyer profile visibility boundary

Date: 2026-08-07

## Deployment

- Commit: `8ff6b10` (`fix(platform): keep pending lawyer profiles private`)
- Environment: protected staging only
- Worker version: `1721fec0-b8f6-451d-9e8a-4893204d8519`
- D1 migrations: none; this is application-only
- Production: not read, deployed, or otherwise changed

## Boundary implemented

- `/api/public/lawyers/:profileId/photo` now requires both
  `status='public_approved'` and `public_approved_at`.
- `/api/platform/lawyers` selects only the same approved state.
- The professional owner previews an upload at the new private,
  authenticated `/api/platform/lawyer-profile/photo` endpoint.
- A profile in `pending_review` has no public photo delivery or client-facing
  request card.

## Checks

- `npm run type-check`: passed after resolving a pre-existing generated-type
  narrowing in the dormant corpus scheduler.
- `npm run lint`: passed.
- `npm run test`: passed.
- `npm run test:cloudflare`: 129/129 passed.
- `npm run cf:types` and `npm run cf:types:check`: passed.
- `npm run build:staging`: passed, including staging artifact validation.
- Authenticated Chrome directory smoke: RU heading and approved-only explanatory
  copy rendered; `Найдено специалистов: 0`; no horizontal overflow; no console
  errors.

## Explicit limitation

The browser used for the smoke blocked a direct public image URL with
`ERR_BLOCKED_BY_CLIENT`. That is treated as an environment limitation, not as
evidence that a pending profile image returned 404. The SQL boundary has a
regression assertion; a neutral-browser HTTP smoke remains an open test.
