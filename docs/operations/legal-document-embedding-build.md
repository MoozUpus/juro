# Regular API document embedding build

The private current-corpus Worker uses the regular OpenAI embeddings endpoint through its environment's authenticated AI Gateway. It does not use the Batch API. The source plan, Queue, immutable R2 artifacts and sparse reducer remain the build architecture.

## Preparation and authorization boundary

Keep `DOCUMENT_EMBEDDINGS_ENABLED=false`, `AUTHORIZED_PROVIDER_TOKENS=0` and both provider rate limits at zero until the owner authorizes paid execution after topping up the provider balance. This blocks the build Workflow, Queue materialization, coordinator dispatch and reduction Workflow. A local bundle check is not a deployment or an execution authorization.

The accepted input manifest binds the source snapshot, accepted audit, input inventory, chunk-alias mapping and complete-corpus reconstruction. Its pages align with the frozen current membership sorted by legacy rendition ID. The build reads complete-corpus provision and normalized-title locators, plus only article/hierarchy metadata from the source database. It validates constructed chunk hashes and token counts against that accepted map before any provider dispatch. This is ordinary construction integrity checking, not a repeated corpus audit.

## Dispatch and recovery

- Each release has a separate durable coordinator and immutable output prefix. Do not resume envelopes from an older release under a new plan; preserve their evidence and explicitly supersede them when deploying.
- Embedding identity includes model, dimensions, input version, transformation and structured-input digest. All chunk aliases share one verified artifact. Audited reuse imports verify bytes before creating a new full-identity pointer; legacy pointers are not overwritten.
- A transactional reservation and input fence are persisted before every provider request. Requests contain at most 64 inputs, each at most 8,192 tokens, and at most 250,000 tokens in total. Configure both request and token rates from actual account limits before dispatch.
- Gateway requests disable logging, caching and automatic retries. A request has one provider attempt; the ledger owns retries. See [Gateway request handling](https://developers.cloudflare.com/ai-gateway/configuration/request-handling/).
- Known rate-limit rejections release that request's reservation and persist a cooldown. An input has at most five dispatch attempts. Quota exhaustion records a durable stop for subsequent dispatches.
- Network errors, invalid successful responses and other unknown outcomes retain the reservation and input fence. Do not clear them to force another charge. Investigate the specific request identity against provider usage before any separately authorized reconciliation.
- Successful responses require exact model, indices, dimensionality, finite nonzero vectors and audited usage. Normalized vector bytes are written immutably before a content-free validated-response record and verified pointers. A restart after that record can finish pointers and token accounting without calling the provider again. A crash before the record remains an unknown outcome.
- Vectorize receives only verified R2 embeddings. Page receipts retain durable provider token totals across delivery retries. The coordinator's `status()` reports reserved tokens, credit-stop state and cooldown without corpus bodies.

## Deployment handoff

After owner authorization, upload the prepared immutable input pages and manifest, read back their hashes while uploading, confirm private bindings and the authenticated stored-key Gateway configuration once, and set the authorized inventory and measured rates. Do not perform a separate live proof Worker or rebuild the accepted source evidence. Start a new release Workflow only after reconciling the paused older envelopes. Keep retrieval activation separate from construction.

After the last mutation, perform one exact Vectorize inventory comparison against the release manifest. Follow [the shared verification policy](legal-corpus-verification.md) for subsequent retrieval and activation checks.

The dedicated binding declarations are generated from `wrangler.legal-custom-current.jsonc` with `wrangler types --env-interface CustomCurrentBindings --include-runtime false --strict-vars false`. Keep the exported interface module-scoped when regenerating, so it does not merge with the application Worker's environment. The shared runtime declarations still use the legacy `VectorizeIndex` return shape; this builder explicitly selects asynchronous `Vectorize` V2 mutations.
