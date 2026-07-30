# Staging Phase 5 secure-upload evidence

Date: 2026-07-30
Environment: owner-protected staging only
Production: unchanged

## Deployed release

- Git commit: `bd0fa56` (`feat(platform): quarantine document analysis uploads`)
- Worker: `juro-platform-staging`
- Active Worker version: `822375b1-8117-4485-9373-2f8ac4a0e8f4`
- Traffic: 100%
- Deployment message: `Phase 5 secure upload bd0fa56`
- Staging D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`)
- Primary private R2 binding: `juro-staging-files`
- Dedicated quarantine bucket binding remains present but unused by this slice.

## Artifact and control-plane evidence

The exact staging build and artifact validation passed before deployment. The route manifest includes:

- `/api/platform/document-analysis/uploads`;
- `/api/platform/document-analysis/uploads/:analysisId`;
- `/api/platform/document-analysis/uploads/:analysisId/finalize`.

Deployment readback shows the expected staging D1, primary/backup/quarantine R2 bindings, document/OCR/export queues, legal/email/retention consumers, Vectorize indexes, analytics binding, staging flags, and model-name variables. `--keep-vars` preserved dashboard secrets.

The secret-binding-name readback contains only:

- `IDENTITY_KEYRING`;
- `RESEND_API_KEY`;
- `TURNSTILE_SECRET_KEY`.

No secret value was read or logged. `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` remain absent, so no live provider execution is claimed.

## Database postflight

- `PRAGMA quick_check`: `ok`.
- `PRAGMA foreign_key_check`: zero rows.
- `document_analyses`: zero rows.
- quarantined analyses: zero.

No D1 migration was required for this slice. The lifecycle reuses existing `document_files`, `document_analyses`, `idempotency_keys`, consent, and workspace-audit structures.

## Local verification

- targeted validation, MIME-spoof, idempotency, tenant-isolation, route-boundary, and UI-wiring tests: 6/6;
- full platform test/build suite: pass;
- lint: pass;
- type-check: pass;
- staging build: pass;
- staging artifact validation: pass;
- Cloudflare environment matrix: pass;
- generated binding type check: pass;
- source secret-value scan: pass;
- client-bundle secret scan: pass;
- `git diff --check`: pass.

## HTTP boundary

Anonymous requests returned Cloudflare Access `302` for:

- `https://staging.app.juro.uz/ru/individual/document-review`;
- `https://staging.app.juro.uz/api/platform/document-analysis/uploads`;
- `https://staging.app.juro.uz/ru/individual/document-builder`.

No Access cookie, token, or redirect location was recorded. This proves the anonymous denial boundary only. It does not prove an authenticated upload.

## Honest limitations

- No authenticated staging upload/R2 round trip is claimed because the available browser-control Node kernel fails before connecting to the existing Access session. Access was not bypassed.
- No real malware scanner is attached. A successfully uploaded document is designed to remain quarantined with `MALWARE_SCANNER_UNAVAILABLE`; OCR and AI are not invoked.
- No staging quarantine object was created by the anonymous smoke tests.
- Archive safety, OCR, Claude analysis, fallback, comparison/corrections/export integration, multi-file packages, and the 100-document quality gate remain open.
