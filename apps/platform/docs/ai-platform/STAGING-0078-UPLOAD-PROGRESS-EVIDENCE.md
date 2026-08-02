# Staging 0078 — byte-level document-upload progress

Date: 2026-08-02

## Delivered slice

The document-review and dashboard quick-upload surfaces report the actual browser upload progress
from `XMLHttpRequest.upload` only when the browser supplies a computable byte
length. It separately communicates SHA-256 preparation, byte transfer, and
private-quarantine finalization in RU and Uzbek Latin. The control exposes an
accessible progress bar and polite status updates; it never invents a
percentage when the browser does not know the total.

The existing direct PUT preserves `Content-Type`, CSRF and SHA-256 headers.
The Worker continues to stream the body to the private quarantine R2 bucket and
checks the stored size/checksum before an analysis changes state. This slice
does not add a scanner or cause any quarantined file to reach OCR or an AI
provider.

## Deployment evidence

- Environment: protected `staging`
- Worker: `juro-platform-staging`
- Worker version: `5e0ef094-2580-4e04-a486-0f849795c212`
- Surface: `https://staging.app.juro.uz/ru/individual/document-review`
- D1 migration and new Cloudflare resource: none
- Production Worker, production D1/R2, Sites and `apps/website`: unchanged

## Verification

- `npm run type-check` — passed
- `npm run lint` — passed
- `npm test` — passed, including the byte-progress and existing secure-upload
  boundary contracts
- `npm run build:staging` and artifact validation — passed
- `npm run deploy:staging` — passed with only the existing isolated staging
  bindings

The owner-only Access boundary remains enabled. No authenticated file upload or
browser UI traversal is claimed from this task runtime, and no file bytes were
created or read as test data in staging.
