# Admin guide

Staff routes require a staff capability and fresh MFA. Legal source staff review is available at `/:locale/admin/legal-sources/reviews`; it exposes normalized snapshots, review decisions and publication controls. The health panel reports corpus freshness and distinct review, publication and fetch queues without returning source text through its API.

Use the existing audit records for staff actions. Do not treat health status as legal verification; only an approved publication is eligible for verified retrieval/indexing.

## Operational feature controls

Local candidate route: `/:locale/admin/feature-flags`. API: `GET,POST /api/platform/admin/feature-flags`.

Both page and API require `staff.operations.manage` and MFA verified within the last 15 minutes. POST additionally requires the normal same-origin CSRF header. Environment and actor are resolved only on the server. A reason between 10 and 500 characters is mandatory; never enter secrets, names, contact details, document text or incident evidence there.

Before changing a flag, confirm that the displayed environment is the intended one and that history integrity is valid. Pause only the affected capability. Verify the user receives the localized temporary-pause response and that no usage/provider/R2/queue/request side effect occurred. Re-enable only after a real recovery probe, recording the recovery reason as a new immutable version. Never edit or delete history rows directly. A failed integrity indicator is an incident: do not append another transition, preserve evidence and roll application traffic back if necessary.
