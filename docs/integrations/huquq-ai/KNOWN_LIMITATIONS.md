# Known limitations

- Production Worker rollout completed on 2026-08-14, but no production D1
  migration, browser-authenticated QA, or restore rehearsal was performed by
  this integration.
- The current Windows runner lacks `bash`, so root website lint/type-check are blocked.
- Legal answer quality has no publishable metric until lawyer-reviewed fixtures and a
  reproducible run exist.
- Advice.uz and court-practice retrieval remain unavailable unless separately verified;
  they must not be presented as official APIs.
- Qdrant is not deployed. JURO's existing Vectorize/D1 path is used for the compatible
  dense/indexed design; any Qdrant adoption needs benchmark and infrastructure approval.
- `status.juro.uz` did not resolve from the release runner during the production
  smoke check; the Worker deployment itself was verified via `app.juro.uz`.
