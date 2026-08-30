# 09: Answer one point-in-time question

**What to build:** Extend the tracer to one as-of request using separately modeled editorial Text Revisions and substantive Applicability Periods. An unknown interval must remain an explicit Temporal Coverage Gap.

Blocked by: 05, 08

Status: ready-for-agent

- [x] Full publisher revision tokens, including same-day suffixes, identify distinct Text Revisions.
- [x] Editorial-validity intervals and sourced Applicability Periods are represented and evaluated independently.
- [x] An as-of endpoint selects only provisions whose verified half-open Applicability Period contains the requested instant.
- [x] Unknown, ambiguous, or disputed applicability creates a Temporal Coverage Gap and cannot support historical Official Coverage.
- [x] A validated official current pointer may support current retrieval but does not manufacture historical eligibility.
- [x] AI Search datetime filters and item metadata reconcile exactly with legal D1 before release eligibility.
- [x] Tests cover boundaries, same-day revisions, delayed commencement, open-ended intervals, gaps, and Source Ladder continuation.

## Comments

**Verification (2026-08-30):**

- Migration `0005_temporal_evidence.sql` preserves editorial validity, sourced legal Applicability Periods, open Temporal Coverage Gaps, and validated current pointers as separate immutable records. Publisher revision uniqueness remains the full `(official_expression_id, publisher_revision_token)` identity, proven with distinct `2026-01-01-1` and `2026-01-01-2` revisions.
- `recordProvisionTemporalEvidence` accepts exactly one sourced applicability fact or explicit unknown/ambiguous/disputed gap, validates non-empty half-open intervals, persists idempotently, and detects identity conflicts instead of overwriting legal history.
- The official evidence resolver now accepts a typed current or timestamp endpoint. Timestamp resolution requires `as_of` eligibility and a verified interval containing the instant (`valid_from <= instant < valid_to`), rejects an overlapping open gap, and carries the same endpoint through Controlling Text and Official Translation resolution.
- The highest Legal Answer seam now routes an explicit timestamp to a pinned history Search Release, the provider-neutral candidate Interface, D1 catalog revalidation, and endpoint-aware R2 evidence hydration. Current interpretations continue to use the current capability.
- `assertSearchReleaseMetadataParity` compares every provider item key and all four custom fields (`language`, `document_type`, `valid_from`, `valid_to`) with legal D1 and throws on any missing, extra, or unequal item; Ticket 11 consumes this fail-closed gate before release sealing.
- Red evidence: the new temporal suite first failed with `ERR_MODULE_NOT_FOUND`; the as-of retrieval test then failed as Source Unavailability until endpoint routing was implemented. Green evidence: temporal/evidence/retrieval suites passed 16/16, including delayed commencement, both half-open boundaries, an open-ended period, same-day revisions, an explicit disputed gap, current-only pointer behavior, exact metadata parity, and strict Source Ladder failure behavior. Platform type-check passed. No remote resource was mutated.

### Post-review correction verification (2026-08-30)

- All target temporal instants now require canonical UTC `Z` timestamps; arbitrary offsets cannot be string-compared as legal intervals. Tests reject non-UTC offsets.
- Importing known textual authority no longer creates current eligibility. Current eligibility is added only with a verified current pointer, while as-of eligibility still requires sourced Applicability evidence and exact half-open interval containment.
- Provider metadata parity now compares stable Search Release `item_key` values rather than accidentally treating an R2 locator as the provider item identity.
- Temporal replay now reads back and compares the exact current pointer plus both current and as-of eligibility rows after every idempotent write. A pre-existing conflicting pointer or eligibility fact throws `LEGAL_TEMPORAL_IDENTITY_CONFLICT`; it can no longer be hidden by `INSERT OR IGNORE`.
