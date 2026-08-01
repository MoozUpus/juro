# JURO document evaluation

Updated: 2026-08-01

## Reproducible corpus harness

`evaluation/document-evaluation-corpus.ts` defines a 100-item synthetic test-package manifest and 30 comparison pairs. It covers DOCX, text/scanned PDF, JPG, PNG, ZIP, tables, bilingual content, low-quality scans, annexes, injection payloads, renumbered clauses, hidden risks, dates/sums, and user-side selection.

The manifest is not a claim that binary fixtures have passed OCR or Claude. `scripts/validate-document-evaluation.ts --results <reviewed-results.json>` is deliberately fail-closed: it requires one result per package, expected format, comparison peer, bounded OCR evidence for scans, and a human reviewer identity. A staging quality score must come from real safe-file/provider execution, not this manifest.
## Current automated evidence

The document-analysis processor is tested for tenant/object-state checks before
R2 or AI access, quarantine refusal, R2 size/SHA-256 integrity, bounded local
PDF/DOCX extraction, structured provider-output validation, idempotent durable
persistence, usage/audit records, and legal-source freshness enforcement.

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

A live staging analysis is not claimed: no real malware scanner can promote a new
upload to `analysis_safe`. The current read-only staging secret-name inventory
contains `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` alongside the existing
security secrets; no value was read, logged, or exported. Separate fixed synthetic
probes completed successfully with `gpt-5.6-sol` and `claude-sonnet-4-6` and
record only technical metadata in D1. This is connectivity evidence, not evidence
of a user/legal response, safe-file promotion, or completed document analysis.
The deployed Workers AI binding and OCR consumer remain infrastructure evidence only.

## Required release matrix — not yet achieved

- 100 synthetic/anonymized packages covering DOCX, text PDF, scans, photos,
  tables, bilingual material, low quality, ZIP, annexes, prompt injection, and
  renumbered versions;
- at least 30 comparisons;
- at least 95% critical-risk detection and document-type accuracy, at least 90%
  user-side detection with confirmation, at least 98% clean dates/sums
  extraction, and at least 95% clean-scan OCR;
- zero cross-account access, unauthorized download, prompt execution, or secret
  exposure;
- reviewer evidence for every threshold and remediation for every miss.

The quality gate remains open until the complete reproducible suite runs in
staging with real safe-file and provider execution.
