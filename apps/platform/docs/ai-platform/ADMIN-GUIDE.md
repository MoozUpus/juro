# Admin guide

Staff routes require a staff capability and fresh MFA. Legal source staff review is available at `/:locale/admin/legal-sources/reviews`; it exposes normalized snapshots, review decisions and publication controls. The health panel reports corpus freshness and distinct review, publication and fetch queues without returning source text through its API.

Use the existing audit records for staff actions. Do not treat health status as legal verification; only an approved publication is eligible for verified retrieval/indexing.

## Operational feature controls

Local candidate route: `/:locale/admin/feature-flags`. API: `GET,POST /api/platform/admin/feature-flags`.

Both page and API require `staff.operations.manage` and MFA verified within the last 15 minutes. POST additionally requires the normal same-origin CSRF header. Environment and actor are resolved only on the server. A reason between 10 and 500 characters is mandatory; never enter secrets, names, contact details, document text or incident evidence there.

Before changing a flag, confirm that the displayed environment is the intended one and that history integrity is valid. Pause only the affected capability. Verify the user receives the localized temporary-pause response and that no usage/provider/R2/queue/request side effect occurred. Re-enable only after a real recovery probe, recording the recovery reason as a new immutable version. Never edit or delete history rows directly. A failed integrity indicator is an incident: do not append another transition, preserve evidence and roll application traffic back if necessary.

## Queue and scheduled-job operations

Local candidate route: `/:locale/admin/jobs`. API: `GET,POST
/api/platform/admin/jobs`. The same `staff.operations.manage`, active-TOTP and
15-minute MFA boundary applies; POST also requires CSRF. The table intentionally
shows only safe identifiers, typed error codes and timestamps.

Use redrive only after the dependency has recovered and the row displays the
action. Enter a non-sensitive reason. The server permits retrying jobs and an
explicit allowlist of recoverable terminal failures, rejects active leases and
cross-environment IDs, then reopens the same durable envelope/idempotency key.
Never paste document text, prompts, emails, credentials or provider responses
into the reason. Never mutate `job_runs`, `job_outbox` or redrive evidence by
hand. A failed integrity banner blocks redrive and must be handled as an
incident. After a redrive, reconcile job, outbox, domain effect, cost/usage and
alert evidence before closing the incident.

## Platform audit log

Local candidate route: `/:locale/admin/audit-log`. API: `POST
/api/platform/admin/audit-log` for both query and CSV export. There is no GET
endpoint, so every access passes the same CSRF, administrator capability, active
TOTP and 15-minute fresh-MFA boundary.

Use source, severity, action, actor, scope and UTC date filters to narrow the
result before export. The console intentionally shows only technical IDs and
safe event state. It does not expose document text, user messages, provider
bodies, email addresses, IP hashes or hidden metadata. Each successful
query/export displays its access-event ID. A chain-integrity failure is an
incident: stop using the console, preserve D1 evidence and do not bypass the
guard with direct SQL.
