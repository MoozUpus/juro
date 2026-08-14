# Known limitations

- Production migration `0121` and authenticated browser QA completed on
  2026-08-14. The staging-only evidence schema migrations `0122` and `0123`
  intentionally remain absent from production.
- The current Windows runner lacks `bash`, so root website lint/type-check are blocked.
- Legal answer quality has no publishable metric until lawyer-reviewed fixtures and a
  reproducible run exist.
- Advice.uz and court-practice retrieval remain unavailable unless separately verified;
  they must not be presented as official APIs.
- Qdrant is not deployed. JURO's existing Vectorize/D1 path is used for the compatible
  dense/indexed design; any Qdrant adoption needs benchmark and infrastructure approval.
- `status.juro.uz` now resolves and is attached to the production Worker. Its
  status-host fence still needs to be preserved in every future routing change.
