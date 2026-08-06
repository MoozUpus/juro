# JURO completion matrix — staging beta

Last updated: 2026-08-06

This is an evidence ledger, not a release claim. `VERIFIED_WORKING` means the
listed implementation has prior staging evidence and remains protected by
regression tests; it does not mean production was changed.

| Module | Route / API | Current status | Evidence / implementation | Missing behaviour / next action | Security impact | Final status |
|---|---|---|---|---|---|---|
| Auth, OTP, sessions, workspace isolation | localized platform routes | VERIFIED_WORKING | Existing route/security suites and staging evidence through 0105 | Regression after direct-source release | Critical | preserved |
| AI chat provider and structured response | `/api/platform/ai`, `/api/guest/ai` | PARTIAL | OpenAI/Anthropic adapters, encrypted run records, rate/cost controls | Deploy direct Lex/Advice slice and run authenticated smoke | Critical | in progress |
| Official legal sources | AI chat source panel; `/api/platform/legal-sources/health` | PARTIAL | Staging migrations `0106` and `0107`, bounded direct source-health, private backup/restore evidence and authenticated synthetic smoke | Worker direct search egress is currently unavailable/slow for both providers; source-card success remains pending | Critical | deployed, QA blocked |
| Legacy legal corpus | legacy review/sync routes | DUPLICATE_OR_OBSOLETE | Existing tables, queue and indexes retained for rollback | No new staging writes; document later decommission only | High | dormant in staging config |
| Document Builder | `/:locale/:accountType/document-builder` | VERIFIED_WORKING | Existing Builder version and R2 guard migrations/tests; authenticated synthetic browser run created a versioned document and DOCX/PDF/ZIP in staging | Upload → analysis, compare → redline and plan → case remain separate staging regressions | Critical | staging browser smoke passed |
| Document analysis and compare | document-analysis routes | VERIFIED_WORKING | Authenticated synthetic analysis accepted an explicit revision and created `Нормализованная версия 2`; synthetic comparison completed, exposed redline and linked to a case | Direct-source cards/citations remain unavailable in the Worker path | High | staging browser smoke passed |
| Cases, plans and deadlines | cases and action-plan APIs | VERIFIED_WORKING | Explicit plan confirmation created four persisted synthetic case tasks; existing lifecycle/action-plan tests remain | Verify direct citations appear in case source tab after egress repair | High | staging browser smoke passed |
| Lawyer handoff / marketplace | lawyer routes | PARTIAL | Existing staged implementation and migration evidence | Full client→lawyer→case E2E remains to be rerun | Critical | in progress |
| Admin and demo payment | admin and payments/demo routes | PARTIAL | Staging sandbox checkout completed with server-recorded payment/ledger state and no real charge; AI-quality write was correctly rejected without fresh reviewer MFA | Demo-payment failure/cancellation regression; active reviewer role plus fresh TOTP for audited queue actions | Critical | demo-payment browser smoke passed; admin gated |
| Cinematic UI | app shell and priority clients | PARTIAL | Existing design migration work | Visual/mobile/accessibility regression after deployment | Medium | in progress |

## Owner beta confirmation

The owner has accepted the 314 legal-scenario, 100 document-analysis and 30
comparison reviewer decisions as **internal staging-beta acceptance**. This is
an authorization to exercise the system without granting access to additional
people. It is not a replacement for a future independent legal review, does
not assert that unexecuted scenarios passed, and is not used as an approval
gate for direct Lex.uz/Advice.uz pages. Under the current architecture,
allowlisted public pages are source-pre-approved and receive technical citation
validation at query time.

## Direct-source acceptance criteria

- no full official page, corpus, chunk or embedding is written by the direct
  path;
- one answer persists at most the source card metadata and a 1,200-character
  excerpt actually shown to the user;
- Lex is retrieved before Advice; only exact official document links are used;
- unavailable sources force a non-chargeable clarification state;
- legacy corpus tables, R2 objects, queue and Vectorize bindings are not
  deleted in this release and are configured dormant in staging.

See `STAGING-0107-DIRECT-SOURCE-HEALTH-EVIDENCE.md` for the backup, migration,
bounded health check and the exact direct-source smoke outcome.

See `STAGING-ANALYSIS-COMPARE-PLAN-PAYMENT-EVIDENCE.md` for authenticated
synthetic browser evidence and the exact outstanding gates.
