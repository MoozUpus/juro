# Document analysis milestone gap

Status: resolved

The completed analysis row was durable, but Analytics Engine had no `document_analyzed` emitter. v105 inspects the guarded final D1 update result and emits only for the one batch that changes the analysis from `persisting` to `completed`; an `already_completed` replay emits nothing.

Validation:

- type-check passed;
- lint passed;
- generated Cloudflare types are current;
- 16 focused analytics and document-processor tests passed;
- the development/staging/production Cloudflare artifact matrix passed;
- no production deploy or browser session was used.
