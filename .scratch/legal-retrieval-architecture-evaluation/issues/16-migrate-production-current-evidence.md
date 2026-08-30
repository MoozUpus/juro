# 16: Migrate production current evidence

**What to build:** Establish isolated production target resources and migrate the complete current corpus after fresh production backups, without enabling production AI Search or changing visible Legal Answers.

Blocked by: 15

Status: ready-for-agent

- [ ] Production platform D1, existing R2, Qdrant, configuration, and secret-name inventories pass the approved backup and isolated restore procedures immediately before mutation.
- [ ] Production legal D1, legal R2, private Worker, service binding, Gateway/project identity, and AI Search namespace are distinct from development and staging.
- [ ] Gateway logging and caches are disabled, no public legal-corpus route exists, and accepted disclosure/DPA plus ZDR/MAM evidence is recorded before real query embedding.
- [ ] Complete current evidence, identity, authority, applicability, relationships, eligibility, and R2 locators reconcile at 100% in production target storage.
- [ ] No production user request reaches AI Search during migration.
- [ ] Existing production feature flags, Source Ladder behavior, and rollback resources remain unchanged and healthy.
