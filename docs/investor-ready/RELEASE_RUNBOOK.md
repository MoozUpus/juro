# Investor-ready release runbook

## Preconditions

1. Work only from `codex/investor-ready-ecosystem` with a reviewed Draft PR and green CI.
2. Confirm Wrangler is authenticated to the intended account and every production command includes `--env production` and remote intent.
3. Confirm `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_KEY_API_TOKEN` exist as production Worker secrets. Never place the long-lived Calls token in code, docs, logs or a browser response.
4. Confirm the payment provider remains in explicitly disclosed demo mode; this release does not authorize or imply a real merchant integration.
5. Confirm the currently approved registration policy set remains version
   `2026-08-23.1` with the exact owner-approved operator particulars recorded in
   `LEGAL_PUBLICATION_HANDOFF.md`. Never infer replacement legal details from
   repository or account metadata.
6. Any later legal-content or operator-detail change requires a new version and
   digests, renewed explicit owner approval, policy tests, append-only production
   publication evidence and a fresh registration-path acceptance replay. Do not
   mutate the approved `2026-08-23.1` evidence in place or turn owner approval
   into a claim of independent qualified-counsel review.
7. Before the investor rehearsal, require a stable Chrome extension connection
   in both selected profiles and close every live Chrome gate named in
   `QA_MATRIX.md`. If selected-source remote screen rendering or forced
   reconnect is still open, keep those actions out of the investor demo rather
   than inferring them from implementation or automated tests.
8. After any Windows-scale QA, visibly restore the host to its original scale
   and record both the tested state and the restored state.

## D1 gate

1. Export the production database to a protected local temporary path.
2. Record SHA-256, restore the export locally, run SQLite quick check and foreign-key check.
3. Upload the encrypted/private backup and manifest to the approved private R2 location, then read back and verify the SHA-256.
4. Apply migrations `0146`–`0158` sequentially with production bindings.
5. Re-list migrations and query only bounded verification counts/constraints.
6. Apply the version-1 investor seed only after the schema gate passes. Immediately after the first bounded seed, confirm exactly three active demo-account registry rows, the three fixed seed payment rows and one consent-published demo lawyer. Later rehearsal-created runs may increase the payment count; every such row must still be constrained to `provider=demo` and `is_simulation=1` and must never be represented as a real payment.
7. Remove verified local plaintext backup copies using the approved safe cleanup procedure.

## Deploy and smoke

1. Build and validate the production artifact.
2. Deploy through `apps/platform/scripts/deploy-production.mjs`.
3. Record the Cloudflare version and route configuration.
4. Check `juro.uz`, `app.juro.uz`, `lawyer.juro.uz`, `admin.juro.uz` and `status.juro.uz` separately.
5. Verify `lawyer.juro.uz/ru/billing`, `/ru/knowledge` and other clean professional paths no longer return 404.
6. Check `/api/status` after deploy. A degraded dependency blocks an overall-green claim even when the deployment itself succeeded.
7. Complete authenticated Chrome role QA and update `QA_MATRIX.md` with exact evidence.

## Rollback

- Use the prior Cloudflare Worker version for application rollback.
- Do not roll migrations back by editing production tables ad hoc. Restore from the verified pre-migration D1 backup only under an incident decision.
- Do not delete investor rows by broad pattern. The fixed IDs/account registry provide a bounded review surface for a separate reset operation.
