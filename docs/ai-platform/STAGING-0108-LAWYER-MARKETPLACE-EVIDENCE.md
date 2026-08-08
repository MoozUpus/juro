# Staging 0108 — lawyer marketplace lifecycle

Date: 2026-08-07
Environment: protected staging only
Production: unchanged

## Scope

Migration `0108_lawyer_marketplace_profile_completion.sql` is additive. It adds
the professional completion fields, private photo metadata and an explicit
marketplace state to `lawyer_profiles`:

`profile_incomplete` → `pending_review` → `public_approved`.

`rejected` remains a terminal moderation outcome until the lawyer edits the
profile. The existing legacy profile status is retained for compatibility.

## Staging evidence

- A private pre-migration D1 export was uploaded to the staging backup bucket
  and its downloaded SHA-256 matched before the migration was applied.
- Wrangler reported **no pending migrations** after applying `0108` remotely.
- A read-only aggregate query returned no staging lawyer profiles. No synthetic
  availability, review or booking was fabricated to make the directory appear
  populated.
- Staging Worker version `6e606faa-23cb-4606-8a6b-f11e60d85ba3` is deployed
  with only staging bindings.
- An authenticated Chrome session loaded
  `/ru/individual/lawyers`; the RU navigation, heading, directory explanation,
  filter form and empty state rendered with no console errors.

## Safety boundary

The onboarding transaction creates a lawyer profile only for the lawyer
persona. All completion state is recomputed server-side; the browser cannot
mark a profile approved. The request flow additionally filters to
`public_approved` and its existing server authorization remains the final
enforcement point.

Profile images stay private. The endpoint accepts only JPEG, PNG or WebP after
magic-byte validation, limits input to 2 MiB, computes SHA-256, submits the
bytes to the internal malware scanner and validates the scanner schema and
returned checksum. R2 persistence happens only after a `clean` verdict; an
unavailable scanner returns a bounded `503` and writes nothing.

## Checks

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npx tsx --test tests/lawyer-marketplace-lifecycle.test.ts` — 3/3 passed.
- `npm run test:cloudflare` — 129/129 passed.
- `npm run test:rendered` — 30/30 passed.
- `npm run build:staging` — passed; staging artifact validation passed.
- `npm run deploy:staging` — passed.

## Open gates

This does not claim a live photo upload because staging has no deliberately
provisioned synthetic lawyer account. It also does not claim a public
`juro.uz` marketplace, a client-to-lawyer handoff E2E run, real legal review,
or any production change.
