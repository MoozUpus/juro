# Incident runbook

For suspected data exposure, provider outage, queue failure, cost spike, upload failure or OTP outage: stop the affected feature flag/queue, preserve audit metadata, avoid logging user content or secrets, assess tenant scope, and use the documented rollback path. Do not delete evidence to recover service.

Current fail-closed controls: unavailable malware scanning leaves files quarantined; unavailable verified legal-source freshness must not be shown as current; staff routes require fresh MFA. See `ROLLBACK.md` and `SECURITY.md`.