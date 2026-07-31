# Staging provider connectivity probe

This controlled Phase 9 diagnostic is intentionally narrow. It performs one
real structured-output request to each configured provider only when both
conditions are true:

- `APP_ENV=staging`;
- `STAGING_SYNTHETIC_PROBES_ENABLED=true`.

The feature flag is checked before the dynamic provider import. The probe has
no HTTP route, has no user trigger, does not touch production, and is inert in
development and production.

Each provider has one immutable logical key: `staging-provider-connectivity-v1`.
The unique D1 index means a completed or failed provider attempt is never
automatically retried. The fixed input contains no legal question, document,
account identifier, or other user content. D1 retains only provider/model,
provider response identifier, token totals, latency, terminal state, and a safe
error code; it retains neither request nor response text.

Migration `0048_staging_provider_probe.sql` is additive. Routine rollback is
application-first: deploy the prior Worker or restore
`STAGING_SYNTHETIC_PROBES_ENABLED=false`; the diagnostic table then remains
unused. A D1 Time Travel bookmark and checksum-verified private-R2 export are
required before applying the migration.
