# Staging provider connectivity probe

Status: **deployed to staging on 2026-08-12; health/SLO certification remains
open.**

The rolling probe is enabled only in staging Worker version
`f79f560a-bc9d-449f-aa7c-a421e2af2d9e` (which supersedes
`d11cd7cd-022c-4501-84ed-ed73befa3959`); production was not changed. The
latest OpenAI result recorded a `3063 ms` first useful server event and
`4510 ms` end to end. The post-deploy Anthropic result completed with a
`6301 ms` provider stage and `6448 ms` end to end, and its dependency-health
evidence is operational. Earlier Anthropic `PROVIDER_TIMEOUT` results at about
five seconds remain historical evidence but are superseded for the current
health projection. The configured minimum sample count of 20 has not been
reached, so none of these individual observations is p50/p95 evidence.

The rolling diagnostic runs only when both conditions are true:

- `APP_ENV=staging`;
- `STAGING_SYNTHETIC_PROBES_ENABLED=true`.

It is checked before dynamic provider import, has no HTTP endpoint, does not
accept a user trigger, and is inert in development and production. The
five-minute scheduler creates a new opaque execution ID, rotates RU/UZ coverage
and runs the OpenAI lifecycle probe alongside the configured Anthropic probe
under one shared 30-second deadline. The lifecycle path cleans up every
synthetic tenant/content row after completion.

Only technical metadata is retained: provider/model, terminal state, safe error
code, bounded timing/usage and append-only SLO evidence. It never stores a
prompt, answer, document, URL, account identifier, provider body or secret.
If technical SLO persistence fails, the provider probe is downgraded to failed
instead of producing a green result. Rolling v27 technical rows are bounded by
their documented retention; the append-only SLO ledger is not pruned by that
cleanup.

`MALWARE_SCANNER_PROBE_ENABLED` and
`STAGING_DOCUMENT_ANALYSIS_PROBE_ENABLED` are independent feature flags. This
provider flag does not enable scanner or document-analysis work. Roll back by
turning this flag off or restoring the prior staging Worker; leave additive D1
evidence intact. A private backup and isolated restore are required before the
new migrations are applied. See
[AI-RELIABILITY-SLO.md](./AI-RELIABILITY-SLO.md).
