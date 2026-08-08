# Architecture

JURO platform is a Vinext/React application served by a Cloudflare Worker. Server routes use D1 through the `DB` binding, private R2 through `BUCKET`, queues for asynchronous work, Vectorize for verified-source indices, and server-only OpenAI/Anthropic integrations. `wrangler.jsonc` separates development, staging and production bindings.

Tenant checks occur server-side before object reads/writes. Legal sources remain unpublished until staff review. Document uploads remain quarantined until a real scanner marks them safe; no provider receives quarantined bytes. See `CLOUDFLARE-RESOURCES.md`, `SECURITY.md`, and `KNOWN-LIMITATIONS.md`.