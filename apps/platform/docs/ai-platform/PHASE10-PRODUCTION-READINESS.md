# Phase 10 production readiness

Updated: 2026-07-30
Status: not production-ready; no production approval requested.

## Preserved production state

- Worker `juro` remains at version `91774ed4-72e9-47bb-b93a-a4208d490b24`, deployed 2026-07-26;
- `juro-production` was not migrated or written;
- `juro-private-documents` was not changed;
- the Sites production application and `apps/website` were not changed;
- canonical `https://app.juro.uz/ru/individual/document-builder` still returns the expected unauthenticated `307` to login;
- production UI replacement has not occurred.

## Current production blockers

1. Staging lacks `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`; live AI chat, fallback, and document-analysis provider evidence do not exist.
2. No real malware scanner can promote quarantined uploads to safe; analysis remains fail-closed.
3. Legal-source coverage, Advice ingestion, historical revisions, hybrid retrieval, citation revalidation, and the 250+50 legal evaluation gate are incomplete.
4. The 100-package/30-comparison document evaluation and required quality thresholds are incomplete.
5. Complete chat streaming/history/memory/voice, OCR, export/redline, cases/deadlines, lawyer marketplace/access, admin/support/status, billing, and data-lifecycle flows are incomplete.
6. Authenticated browser, accessibility, responsive, performance, load, recovery, and security matrices have not passed for the exact deployment.
7. The owner-approved rigged Jurobek asset is absent; 3D, verified rig/skin/clips, shirt/facial corrections, lip sync, and cleanup measurements do not exist.
8. Phase 9 closed beta and owner feedback have not occurred.
9. Final legal approval of production policy text is not recorded.

## Production change boundary when gates eventually pass

Functional deployment and UI replacement remain two separate change sets and approvals:

1. **Functional AI platform deployment:** environment resources, provider adapters, migrations, queues, data policies, and feature flags.
2. **Cinematic Legal Intelligence UI replacement:** canonical route composition, shared shell, visual tokens, motion, avatar surfaces, and rollback toggle.

Approval of either one does not authorize the other.

## Required pre-production evidence

- verified production backup/export and restore rehearsal;
- exact pending migration list and additive/expand-contract review;
- exact production artifact and secret-name/binding inventory without values;
- all required provider, legal, document, tenant, security, deletion, backup, accessibility, and performance gates;
- synthetic staging beta evidence and reviewed screenshots;
- current builder and legacy redirect regression;
- production change list, monitoring thresholds, rollback triggers, and kill switches;
- final policy approval record.

## Rollback design

- keep the existing UI as the default until a dedicated cinematic feature flag is approved;
- retain the prior production Worker version for immediate traffic rollback;
- disable avatar, cinematic motion, AI providers, upload/analysis, queues, and cron independently;
- use additive migrations so an application rollback can ignore new schema;
- restore D1 only for demonstrated corruption, from a verified pre-migration checkpoint;
- never delete the primary production R2 bucket as rollback;
- keep the canonical document-builder route in every regression suite.

## Approval state

Neither production approval is requested because the release gates above are open. When all staging gates pass, the final report must request separately:

- production deployment of the functional AI platform;
- replacement of the production UI with Cinematic Legal Intelligence.

Until then, the only reviewable deliverable is the protected staging prototype.
