# JURO document evaluation

Updated: 2026-07-31

## Current automated evidence

The document-analysis processor is tested for tenant/object-state checks before
R2 or AI access, quarantine refusal, R2 size/SHA-256 integrity, bounded
PDF/DOCX extraction, structured provider-output validation, idempotent durable
persistence, usage/audit records, and legal-source freshness enforcement.
When corpus freshness is unavailable, legal-compliance risks and citations are
removed while structural findings remain; stale compliance findings are marked
low confidence with an explicit RU/UZ warning.

These tests verify processing and safety contracts. A live staging analysis is
not claimed because no malware scanner can mark a file safe and provider secret
bindings are absent.

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
