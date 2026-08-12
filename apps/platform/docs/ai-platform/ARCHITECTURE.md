# Architecture

JURO platform is a Vinext/React application served by a Cloudflare Worker. Server routes use D1 through the `DB` binding, private R2 through `BUCKET`, queues for asynchronous work, Vectorize for verified-source indices, and server-only OpenAI/Anthropic integrations. `wrangler.jsonc` separates development, staging and production bindings.

Tenant checks occur server-side before object reads/writes. Legal sources remain unpublished until staff review. Document uploads remain quarantined until a real scanner marks them safe; no provider receives quarantined bytes. See `CLOUDFLARE-RESOURCES.md`, `SECURITY.md`, and `KNOWN-LIMITATIONS.md`.

## Operational status

The public status projection is derived from environment-scoped,
append-only dependency evidence rather than a default-green checklist.
Components stay `unknown` until all of their required dependencies have fresh
operational evidence; old evidence becomes `stale`, and explicit failures
remain visible. This behavior is deployed to staging Worker
`f79f560a-bc9d-449f-aa7c-a421e2af2d9e` and is defined in
[AI-RELIABILITY-SLO.md](./AI-RELIABILITY-SLO.md). It is still not a blanket
availability assertion: the latest Anthropic evidence is operational after an
earlier timeout, but the checkpoint has insufficient SLO samples.
