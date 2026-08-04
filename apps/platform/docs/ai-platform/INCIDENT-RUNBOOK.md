# Incident runbook

For suspected data exposure, provider outage, queue failure, cost spike, upload failure or OTP outage: stop the affected feature flag/queue, preserve audit metadata, avoid logging user content or secrets, assess tenant scope, and use the documented rollback path. Do not delete evidence to recover service.

Current fail-closed controls: unavailable malware scanning leaves files quarantined; unavailable verified legal-source freshness must not be shown as current; staff routes require fresh MFA. See `ROLLBACK.md` and `SECURITY.md`.

## Feature-stop procedure (after migration 0084 is activated)

1. Enter `/:locale/admin/feature-flags` only through the protected staff session and complete fresh MFA.
2. Confirm the environment label. Choose only the affected capability and enter a non-sensitive operational reason.
3. Verify the new immutable version and valid chain. Never use direct D1 mutation as an incident shortcut.
4. Run one synthetic request and verify the localized `OPERATIONAL_FEATURE_DISABLED` response before any provider, usage, R2, queue or lawyer-request side effect.
5. Preserve correlation IDs, safe metrics and Worker/D1 version evidence; never copy user content or secrets into the feature reason or incident log.
6. Repair and probe the dependency. Re-enable through the same console with a recovery reason, then verify one successful synthetic flow and cost/usage reconciliation.

If chain integrity fails, all covered execution is designed to fail closed. Do not extend or reconstruct the chain in place. Preserve the database, roll back the Worker if needed, and restore only from a verified private backup after the incident owner approves recovery.
