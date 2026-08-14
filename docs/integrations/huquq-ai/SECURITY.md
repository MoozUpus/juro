# Security boundary

- Treat Lex HTML, OCR, uploads, metadata and external pages as data, never instructions.
- Source URLs are canonical HTTPS allow-list entries; model-generated URLs are rejected.
- Legal source text is validated for status, version, hash and exact span before it can
  support a claim. Repealed material is historical-only.
- Uploaded files stay in the existing private R2/quarantine/ownership flow. Do not add a
  public legal-document URL or log source text, full questions, PINFL, mail or tokens.
- Tool calls are typed, bounded, audited and permission checked. No arbitrary URL, SQL or
  cross-tenant document access is exposed to a model.
- Feature flags are deny-by-default. A disabled source or failed validation yields an
  honest unavailable result, not a best-effort legal conclusion.
- Qdrant is server-only, HTTPS-only outside localhost development, accepts no
  credentials in URLs, follows no redirects, uses bounded responses/timeouts and
  returns only IDs. `QDRANT_API_KEY` is a secret and is never checked into Wrangler
  vars. D1 reauthorization is mandatory before a vector candidate becomes evidence.
- Owner material publication is fail-closed behind
  `LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST=false`. Enabling the flag alone is not
  sufficient: the request must come from the isolated admin host, pass CSRF,
  carry both admin and legal-reviewer assignments, fresh MFA, ownership,
  malware-safe file state, verified OCR bytes and two explicit confirmations.
- Deterministic pre-publication checks reject common e-mail, phone, PINFL and
  passport patterns plus known prompt-injection imperatives before corpus R2
  or D1 writes. Failure records expose only a bounded error code, never text.
- `legal_corpus_owner_publications` is append-only and contains hashes and
  actor evidence, not legal text. Cross-owner publication and stale MFA are
  regression-tested. Owner material is excluded from the official Lex provider.
- Withdrawal is a separate immutable event and remains available with ingestion
  disabled. It removes the material from sparse and dense rehydration through
  the D1 availability predicate without deleting audit evidence or blocking
  retention/deletion of the original private analysis.
