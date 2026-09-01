# v105 durable document-analysis milestone

## Scope

- Emit `document_analyzed` only for the winning D1 transition from `persisting` to `completed`.
- Emit after the normalized result, usage ledger, analysis state, index outbox, and audit batch succeeds.
- Use only closed locale/account-type dimensions; never emit document names, hashes, content, IDs, risks, or sources.
- Exclude `already_completed` replay and Analytics Engine failures from the product workflow.

## Exclusions

- No legislation/corpus changes.
- No production deploy or browser session.
- `clarification_completed` remains open until its user-completed state is unambiguous.
