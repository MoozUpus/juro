# 08: Answer one domain-general General Legal Question

**What to build:** Route one representative General Legal Question through domain-general Question Interpretation, bounded formulations, hybrid candidate retrieval, controlling evidence, Coverage Requirements, Provision Set selection, and the strict Source Ladder.

Blocked by: 04, 07

Status: ready-for-agent

- [x] Each Plausible Reading owns proposition-level Coverage Requirements and receives one formulation before any reading receives a second.
- [x] The total budget is six formulations, including multilingual recovery and the single candidate-grounded repair search.
- [x] Topic-specific labor, pregnancy, dismissal, synonym, and act/article rules are absent from the general interpretation path.
- [x] Hybrid candidates are grouped into a complementary Provision Set and verified through the target evidence path before supporting a proposition.
- [x] Missing material Case Facts produce a Conditional Answer; missing coverage produces Live Official Search or an Insufficient-Evidence Result as appropriate.
- [x] More than six required formulations or twelve hydrated provisions produces clarification or Insufficient Evidence without silent truncation.
- [x] Acceptance tests exercise multiple legal domains and observe the resulting Legal Answer, Official Citations, and Source Ladder state through the highest retrieval seam.

## Comments

**Verification (2026-08-30):**

- Added the deep `TargetLegalAnswerRetriever` Module with one `answer` Interface. Question Interpretation, pinned release selection, `LegalCandidateIndex`, catalog revalidation, complementary Provision Set selection, one repair search, Controlling Text hydration, Official Citations, and Source Ladder outcomes remain inside its Implementation.
- The interpretation contract is domain-general: Plausible Readings own unique proposition-level Coverage Requirements, formulations reference only declared readings/requirements, and ordering validation rejects a second formulation for any reading before all readings receive their first.
- Six formulations are the total request budget. A candidate-grounded repair consumes the same budget and can run once; more than six produces focused clarification before candidate retrieval. Selection of more than twelve distinct Provision Renditions likewise produces clarification before evidence hydration.
- Only catalog-revalidated locators can be selected. Each chosen locator resolves through the Ticket 03/04 R2 byte/hash/source-hash and Controlling Text path before it can populate What the Law Says; provider excerpts never cross into the Legal Answer.
- Material missing Case Facts produce a Conditional Answer with focused questions. Empty/rejected coverage continues to Live Official Search as insufficient indexed Official Coverage, while provider, reconciliation, or evidence failures remain distinct Source Unavailability.
- Red evidence: `legal-target-retrieval.test.ts` first failed with `ERR_MODULE_NOT_FOUND`. Green evidence: its 3 highest-seam tests passed across employment, family, and tax questions, a two-reading repair, conditional behavior, budget enforcement, citations, hash evidence, and Source Ladder states.
- Combined target/candidate/evidence/release/storage/Worker regression passed 45/45; platform type-check and the staging legal Worker dry-run passed. No remote resource was mutated.

### Post-review correction verification (2026-08-30)

- The dedicated legal-corpus Worker now routes `TARGET_LEGAL_ANSWER_PATH` through a runtime Target retriever. Runtime assembly resolves active governed releases, revalidates every item against legal D1, hydrates legal D1/R2 evidence, resolves lineage, and confines candidate/reasoning calls to private service bindings; missing bindings fail closed with 503.
- Revalidated candidates carry stable rendition, revision, Provision Concept, language-family, and textual-authority identities. Merge/dedup is immutable and uses that tuple rather than provider IDs or item locators.
- Untrusted selector output cannot assign a requirement absent from the candidate and interpretation plan. A forged-selection test now proves fail-closed Source Unavailability before evidence hydration.
