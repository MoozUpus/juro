# Incident runbook

For suspected data exposure, provider outage, queue failure, cost spike, upload failure or OTP outage: stop the affected feature flag/queue, preserve audit metadata, avoid logging user content or secrets, assess tenant scope, and use the documented rollback path. Do not delete evidence to recover service.

Current fail-closed controls: unavailable malware scanning leaves files quarantined; unavailable verified legal-source freshness must not be shown as current; staff routes require fresh MFA. See `ROLLBACK.md` and `SECURITY.md`.

## Legal corpus alert response

1. Confirm the environment, source kind and opaque alert/run ID in the email;
   never paste legal text, source snapshots or secrets into incident notes.
2. Inspect the protected source-health and jobs views, then correlate the
   `source_sync_runs`, identifiers-only outbox and Queue/DLQ records.
3. If the run failed, repair the source/Queue/parser boundary and use the
   guarded redrive or manual corpus operation; do not edit a failed run or alert.
4. If the corpus is stale, verify both Lex and Advice full-corpus success and
   their source timestamps. Keep confirmed legal conclusions fail-closed until
   freshness is restored.
5. Preserve the alert and run evidence. A later successful run is new evidence;
   it does not delete or rewrite the historical alert.

## Feature-stop procedure (after migration 0084 is activated)

1. Enter `/:locale/admin/feature-flags` only through the protected staff session and complete fresh MFA.
2. Confirm the environment label. Choose only the affected capability and enter a non-sensitive operational reason.
3. Verify the new immutable version and valid chain. Never use direct D1 mutation as an incident shortcut.
4. Run one synthetic request and verify the localized `OPERATIONAL_FEATURE_DISABLED` response before any provider, usage, R2, queue or lawyer-request side effect.
5. Preserve correlation IDs, safe metrics and Worker/D1 version evidence; never copy user content or secrets into the feature reason or incident log.
6. Repair and probe the dependency. Re-enable through the same console with a recovery reason, then verify one successful synthetic flow and cost/usage reconciliation.

If chain integrity fails, all covered execution is designed to fail closed. Do not extend or reconstruct the chain in place. Preserve the database, roll back the Worker if needed, and restore only from a verified private backup after the incident owner approves recovery.

## Guarded job redrive (after migration 0085 is activated)

1. Stop the affected feature or Queue producer and prove the dependency has
   recovered with a synthetic, content-free probe.
2. Open `/:locale/admin/jobs` through the protected staff session, complete
   fresh MFA and confirm the environment and redrive-history integrity.
3. Inspect only the safe job type, error, attempt, subject and correlation IDs.
   If redrive is absent, do not bypass the server policy or edit D1 directly.
4. Record a non-sensitive operational reason and submit once. The same job ID,
   outbox row and idempotency key are reopened; no replacement logical job is
   created.
5. Follow safe Worker logs and reconcile exactly one domain effect, one usage/
   cost result and the terminal job/outbox state. Confirm any configured alert.
6. If delivery repeats, a lease is active, history integrity fails or the
   effect cannot be reconciled, pause the Queue, preserve evidence and roll the
   Worker back. Never delete redrive events to make the console green.
