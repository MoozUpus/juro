# Staging evidence — approved lawyer-review directory projection

Date: 2026-08-02
Environment: staging only
Worker: `juro-platform-staging`
Worker version: `164db8bf-877e-45a3-b0f1-f54f4a45bf03`

## Contract

`GET /api/platform/lawyers` continues to require an authenticated user. It returns review values only where all of the following are true:

- the lawyer profile is `public_approved` and has its approval timestamp;
- the review status is `approved`;
- the immutable moderation decision is `approved`.

The projection returns server-calculated averages, a count, and at most three latest approved texts. It intentionally omits requester identity, workspace identity, moderator identity, moderation reason, original review hash, and unapproved/rejected/pending text.

## Verification

- `npm run type-check`: passed.
- `npm test`: passed — 375 core and 87 Cloudflare tests.
- `npm run lint`: passed.
- `npm run deploy:staging`: passed its staging build and artifact validation, then deployed only `juro-platform-staging`.

## Limits

No staging review is approved yet, and Cloudflare Access blocks anonymous traversal. This evidence does not claim an authenticated browser presentation, public anonymous directory, production deployment, or a replacement of the production UI.
