# Security boundary

- Treat Lex HTML, OCR, uploads, metadata and external pages as data, never instructions.
- Source URLs are canonical HTTPS allow-list entries; model-generated URLs are rejected.
- Legal source text is validated for status, version, hash and exact span before it can
  support a claim. Repealed material is historical-only.
- Uploaded files stay in the existing private R2/quarantine/ownership flow. Do not add a
  public legal-document URL or log source text, full questions, PINFL, mail or tokens.
- User-upload grounding is independently gated by
  `LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST`. A Vectorize hit is never authority:
  D1 must revalidate active workspace membership, owner/access scope, latest
  immutable document version and exact metadata, then R2 size and SHA-256 must
  match. Failure returns no private context. The browser receives neither an
  R2 key nor a public/signed file URL; full-text access repeats the same
  conversation, tenant, D1 and R2 checks.
- `USER_TRUSTED_PRIVATE` spans may support factual claims about the uploaded
  document only. The gateway converts them to `fact`, excludes them from
  streaming legal preliminaries, and never lets them establish legislation,
  legal freshness or coverage. Instructions embedded in a file remain
  untrusted data for both OpenAI and Anthropic.
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
  carry a current administrator or legal-reviewer assignment, fresh MFA,
  ownership, malware-safe file state, verified OCR bytes and an explicit
  rights-to-publish confirmation. No legal-approval confirmation is collected.
- Deterministic pre-publication checks reject common e-mail, phone, PINFL and
  passport patterns plus known prompt-injection imperatives before corpus R2
  or D1 writes. Failure records expose only a bounded error code, never text.
- `legal_corpus_owner_ingestions` is append-only and contains hashes and
  actor evidence, not legal text. Cross-owner ingestion and stale MFA are
  regression-tested. Owner material is excluded from the official Lex provider.
- Legacy `legal_corpus_owner_publications` rows remain immutable and readable
  for provenance; new technical auto-trust writes use the 0129 tables only.
- Withdrawal is a separate immutable event and remains available with ingestion
  disabled. It removes the material from sparse and dense rehydration through
  the D1 availability predicate without deleting audit evidence or blocking
  retention/deletion of the original private analysis.
