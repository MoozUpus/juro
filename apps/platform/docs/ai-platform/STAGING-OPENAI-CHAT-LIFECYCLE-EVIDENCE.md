# Staging OpenAI chat lifecycle evidence

Date: 2026-08-03

Environment: protected staging only (`juro-platform-staging`)

## Change

- Commit: `351a0b0` (`Verify staging AI chat lifecycle`).
- Worker version: `a2b2357e-0dc8-4b83-9c45-8813f48d0968`.
- Probe key: `staging-openai-legal-chat-v26`.
- Production Worker, D1, R2, routes, and UI were not changed.

The probe has no HTTP route. It can run only when both `APP_ENV=staging` and the normally disabled `STAGING_SYNTHETIC_PROBES_ENABLED=true` gate are present. It uses fixed synthetic RU and UZ prompts and never logs or persists provider bodies, user content, or secret values as evidence.

## Verified lifecycle

For both RU and UZ, the staging-only job verified:

1. isolated synthetic user/workspace ownership;
2. `ai_runs` and `ai_usage_ledger` reservation;
3. a real OpenAI Responses API request through the production adapter;
4. strict Zod parsing and the no-verified-source boundary;
5. `clarification_required` in the requested language;
6. conversation, user/assistant message, branch, message version, and audit persistence;
7. completed AI run and released, non-chargeable usage ledger;
8. idempotent replay returning the completed conversation;
9. full synthetic tenant/content cleanup.

## Remote evidence

The bounded `staging_provider_probes` record contains:

- `status=succeeded`;
- `provider=openai`;
- `model=gpt-5.6-sol`;
- `input_tokens=2038`;
- `output_tokens=295`;
- `latency_ms=6493`;
- `error_code=NULL`;
- `started_at=2026-08-03T12:30:59.178Z`;
- `finished_at=2026-08-03T12:31:11.566Z`.

After the run, the probe flag was returned to `false`, all 45 Worker bindings remained present, and remote counts for synthetic users, workspaces, conversations, AI runs, usage ledgers, and idempotency rows were all zero.

The latest non-synthetic failed user run predates this deployment (`2026-08-03T07:06:29.177Z`). No new failed user run existed when the evidence was recorded.

## Local release gate

- `npm run type-check`: pass.
- `npm run lint`: pass with zero warnings.
- targeted staging/AI tests: 18/18 pass.
- full core and Cloudflare suites: 418/418 and 95/95 pass.
- `npm run build:staging`: pass.
- `npm run validate:artifact -- --environment staging`: pass.
- tracked-file provider-key pattern scan: no match.

## Open gate

Cloudflare Access-authenticated browser traversal remains separate from this service-level proof. The local browser-control bridge exited before connecting because its temporary launcher was interpreted as ESM by a user-home package setting; the repository, Access policy, and user-home file were not modified to bypass that failure. A new owner browser request after the deployment is required to close the visual/user-session gate.
