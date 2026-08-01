# Migration 0058 — lawyer professional-directory facts

Status: locally implemented and verified; not applied to staging or production.

`0058_innocent_ben_grimm.sql` additively expands the existing
`lawyer_profiles` table. It adds optional professional facts: experience, price
description, availability, next availability, advocate declaration, firm, and
biography. It creates a bounded directory index and D1 triggers which reject an
experience outside `0–99`, unknown availability values, and unknown advocate
states.

The connected server API permits profile creation/editing only for a
server-confirmed `lawyer` account. Creation is always `pending`; self-service
cannot set public approval or a verified advocate status. The directory continues
to include only public-approved profiles.

Local evidence:

```text
npm run type-check          PASS
npm run lint                PASS
npm test                    PASS (375 core + 89 Cloudflare tests)
npm run validate:artifact   PASS
```

The migration-safety suite applies the complete local chain, verifies the added
columns, and proves direct invalid profile-state updates are rejected. Before
staging application, create a fresh Time Travel bookmark and a checksum-verified
portable export in private `juro-staging-backups`; verify `0058` alone is pending;
then apply `0058` and the dependent `0059` in journal order, then repeat
integrity/export checks. Rollback is application-first: restore the prior Worker
and leave the additive fields unused. Production is not authorized.
