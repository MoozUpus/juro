# Staging 0055 — dedicated document-analysis quarantine bucket

Date: 2026-08-01

## Change

New document-analysis uploads use the already-bound private `QUARANTINE_BUCKET` rather than a prefix in `BUCKET`. Their immutable-style storage key begins with `quarantine-v2/`. The upload and finalization routes use only the quarantine binding. Existing ordinary documents and historical `quarantine/` keys are untouched.

Account deletion classifies keys by this versioned prefix, deletes legacy/ordinary objects from `BUCKET`, and deletes new quarantine objects from `QUARANTINE_BUCKET`. A missing quarantine binding is a recoverable purge failure, not an orphaned-data success.

## Remaining security gate

No malware scanner is connected. Finalization remains fail-closed with `MALWARE_SCANNER_UNAVAILABLE`; a document cannot become safe or reach OCR/Anthropic/OpenAI through this change.

## Deployment evidence

- Worker: `juro-platform-staging`
- Cloudflare version: `b3975cf2-67a7-4de0-a4e2-352dfd645a74`
- `BUCKET`: private `juro-staging-files`
- `QUARANTINE_BUCKET`: separate private `juro-staging-quarantine`
- Deployment: `npx wrangler deploy --config dist/server/wrangler.json` (exit 0)

## Verification

- focused upload, route-boundary, and account-deletion tests: 17/17 pass;
- `npm test` — exit 0;
- `npm run lint` — exit 0;
- `npm run build:staging` — exit 0 and generated staging artifact validation passed.