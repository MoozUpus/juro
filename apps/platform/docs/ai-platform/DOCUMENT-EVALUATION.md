# JURO document evaluation

Updated: 2026-08-06

## Reproducible corpus harness

`evaluation/document-evaluation-corpus.ts` defines a 100-item synthetic test-package manifest and 30 comparison pairs. It covers DOCX, text/scanned PDF, JPG, PNG, ZIP, tables, bilingual content, low-quality scans, annexes, injection payloads, renumbered clauses, hidden risks, dates/sums, and user-side selection.

`npm run evaluate:documents:materialize -- --output .tmp/document-evaluation-corpus`
creates real deterministic binaries for all 100 rows plus a hashed synthetic
ground-truth file and `artifact-manifest.json`. The generator embeds the existing
DejaVu Sans asset, rasterizes image/scanned-PDF fixtures, creates valid OOXML/ZIP
containers with fixed metadata, and immediately re-reads every file to verify
size, SHA-256, unique hash, expected magic bytes and safe relative path. The
2026-08-04 local run produced 100 distinct artifacts, 30 comparison pairs and
5,502,884 total artifact bytes with zero integrity failures. Generated binaries
remain ignored local evidence rather than repository payload.

### Latest integrity materialization

On 2026-08-06, the deterministic corpus was materialized again with zero
integrity failures: corpus version `2026-08-04.1`, 100 distinct artifacts, 30
comparison pairs and 5,502,884 total bytes. The artifact-manifest SHA-256 was
`c4c7f1864f00161ef60106cf54c30d8216caea985b39266c57cb1fabb46e38d2` and
the synthetic ground-truth SHA-256 was
`3ba7dfdfaafc2ddb757a39715502c3564f8d8756c669e1ff1e6c6bf8c45e0c2d`.
This is reproducible fixture integrity, not OCR, provider, comparison, or
human-review evidence.

The manifest and materialized artifacts are not a claim that the binaries have
passed OCR or Claude. `npm run evaluate:documents:validate -- --evidence
<persisted-evidence.json> --artifacts <artifact-manifest.json>` is deliberately
fail-closed. Self-declared result JSON is no longer accepted. The evidence must
come from the POST-only, fresh-MFA staging endpoint
`/api/platform/admin/document-evaluation` after migration `0092`.

Each immutable review event is bound by D1 to the actual private file hash/size,
clean scan record, completed analysis, SHA-256 of the normalized result,
document-analysis `ai_run`, provider/model/response ID/completion time and exact
count of persisted critical risks. Comparison rows must identify a completed
comparison that contains the reviewed file; export additionally requires the
reciprocal peer review and shared comparison ID. Export re-reads all referenced
records, rejects stale/deleted/changed evidence, replays the entire per-reviewer
hash chain and commits the latest-review digest in a separate export event.
Question, document, OCR, result, filename and provider-response content are not
included in the evidence artifact.

The validator reports and enforces the requested aggregate metrics: 100% format
classification and artifact evidence, at least 95% document-type accuracy, at
least 95% critical-risk detection, at least 90% user-side detection with user
confirmation, at least 98% dates/sums extraction, at least 95% clean-scan OCR,
all 30 comparison pairs reviewed, and 100% prompt-injection resistance for the
tagged packages. A staging quality score must come from real safe-file/provider
execution, not this manifest or its unit fixtures.
## Current automated evidence

The document-analysis processor is tested for tenant/object-state checks before
R2 or AI access, quarantine refusal, R2 size/SHA-256 integrity, bounded local
PDF/DOCX extraction, structured provider-output validation, idempotent durable
persistence, usage/audit records, and legal-source freshness enforcement.

Bounded ZIP packages now produce a deterministic relationship context covering
the tentative primary document, annexes, amendments, acceptance acts,
correspondence, evidence, explicit filename references and exact normalized-text
duplicates. The graph is bounded and validated, persists with the normalized
analysis, stays inside the provider's untrusted envelope, and is reviewable in
RU/UZ. This is structural test evidence only; relationship accuracy is not yet a
release metric and requires named human review in the 100-package run.

The OCR/extraction extension adds four passing integration cases: successful
Workers AI conversion and analysis chaining, idempotent replay, cross-tenant
denial before R2/provider access, retryable missing-provider behavior, and
fail-closed source-integrity rejection. The generated D1 migration applies with
zero foreign-key violations, the Cloudflare contract suite passes 87/87, and the
targeted Phase 5 processor/provider/upload/OCR/export set passes 18/18.

When corpus freshness is unavailable, legal-compliance risks and citations are
removed while structural findings remain; stale compliance findings are marked
low confidence with an explicit RU/UZ warning. Image-derived text is explicitly
marked for human review and does not count toward the 95% OCR quality threshold.

A focused live staging analysis is recorded in
`STAGING-0101-0103-DOCUMENT-ANALYSIS-EVIDENCE.md`: one authenticated synthetic
DOCX received a safe verdict from `juro-private-clamav`, Anthropic availability
failed for that attempt, the documented OpenAI fallback completed without double
charge, and three tenant-scoped index chunks persisted. It is deliberately not
treated as corpus, comparison, accuracy, clean-console, or human-review proof.
The current read-only secret-name inventory contains `OPENAI_API_KEY` and
`ANTHROPIC_API_KEY`; no value was read, logged, or exported.

## Required release matrix — not yet achieved

- staging execution of the 100 materialized synthetic/anonymized packages
  covering DOCX, text PDF, scans, photos, tables, bilingual material, low
  quality, ZIP, annexes, prompt injection, and renumbered versions;
- at least 30 comparisons;
- at least 95% critical-risk detection and document-type accuracy, at least 90%
  user-side detection with confirmation, at least 98% clean dates/sums
  extraction, and at least 95% clean-scan OCR;
- zero cross-account access, unauthorized download, prompt execution, or secret
  exposure;
- reviewer evidence for every threshold and remediation for every miss.

The artifact generator and stronger validator contract are implemented and
tested, but the quality gate remains open until all 100 controlled artifacts and
30 comparisons run in staging through a real malware scanner, OCR/provider
pipeline and named human review.

Migration `0092` is present in the current staging migration ledger; this does
not claim a single document review. The export route still requires a fresh-MFA
legal reviewer and a real persisted safe-file/provider run for every package.
