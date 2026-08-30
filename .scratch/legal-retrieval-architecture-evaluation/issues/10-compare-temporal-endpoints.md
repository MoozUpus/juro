# 10: Compare two independent Temporal Endpoints

**What to build:** Answer one legal-change question by searching and resolving two independently typed Temporal Endpoints, including history-versus-history, and comparing separate Provision Sets through persisted provision lineage.

Blocked by: 09

Status: ready-for-agent

- [x] Temporal Scope supports current/current, current/timestamp, timestamp/current, and timestamp/timestamp comparisons.
- [x] The same bounded formulations run independently for the left and right endpoints, with no more than twelve endpoint-formulation searches.
- [x] Each endpoint produces its own evidence eligibility checks, Candidate Packet, and Provision Set; conflicting text is never fused into one proposition.
- [x] Stable Provision Concepts and many-to-many lineage represent unchanged, modified, renumbered, moved, split, merged, and repealed transitions.
- [x] Lineage and cross-language equivalence require explicit evidence/review state; article-number equality alone is insufficient.
- [x] One unavailable endpoint makes indexed comparison unavailable and continues the Source Ladder without borrowing the other endpoint.
- [x] Tests cover every endpoint combination, renumbering, split/merge, repeal, gaps, and independent twelve-provision ceilings.

## Comments

**Verification (2026-08-30):**

- The `TargetLegalAnswerRetriever.answer` Interface now accepts a comparison interpretation with independently typed left/right endpoints. It runs the same bounded formulations through two complete endpoint executions; each resolves its own capability release, Candidate Packet, D1 revalidation, twelve-provision ceiling, Controlling Text evidence, and Provision Set before comparison.
- Comparison output preserves separate left/right Legal Answers and quotations. It exposes only accepted, evidence-backed transitions and never fuses conflicting endpoint text into a third proposition. Six formulations per endpoint enforce the twelve endpoint-formulation maximum.
- Migration `0006_provision_lineage.sql` adds immutable many-to-many Provision Concept lineage for unchanged, modified, renumbered, moved, split, merged, and repealed transitions. Repeal alone may have no successor. Explicit evidence URL and pending/accepted/rejected review state are required.
- The same migration adds immutable cross-language/cross-script Official Expression equivalence with normalized expression-pair identity, evidence, and review state. Neither route prefix, article number, wording, nor incidental provider identity creates an edge.
- `recordProvisionLineage` is idempotent and rejects identity conflicts. `resolveProvisionLineage` returns only accepted explicit edges between the two endpoint concept inventories, including many-to-many split/merge and terminal repeal edges.
- Red evidence: the comparison suite initially failed with `ERR_MODULE_NOT_FOUND` for the lineage Module. Green evidence: 8 comparison tests cover all four endpoint combinations, independent searches and Provision Sets, explicit renumber/split/merge/repeal, no article-number inference, unavailable-endpoint Source Ladder behavior, twelve provisions independently on both sides, and rejection before the second endpoint when the first needs thirteen. The combined target/candidate/evidence/release/storage/Worker regression passed 57/57 and platform type-check passed. No remote resource was mutated.

### Post-review correction verification (2026-08-30)

- Comparison search counts now sum each endpoint's actual formulation and repair usage, so asymmetric repair cannot be under-reported.
- Returned lineage must connect the selected left/right Provision Concept inventories (or be a selected terminal repeal), and every selected concept must be covered. An unrelated accepted edge now fails closed.
- Official Expression equivalence import reads back both the supplied ID and stable natural identity. A second incidental ID for an existing evidenced equivalence now raises an immutable identity conflict instead of being silently ignored.
