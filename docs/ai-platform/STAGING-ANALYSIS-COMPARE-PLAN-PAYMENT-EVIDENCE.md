# Staging synthetic E2E evidence: analysis, compare, plan and payment

Date: 2026-08-06  
Environment: `staging.app.juro.uz`  
Scope: authenticated staging browser run using only pre-existing synthetic test
documents and the synthetic `Staging QA` case. No production data, real payment
method, legal outcome, customer document, or provider credential was used.

## Verified browser flows

| Flow | Evidence | Boundary preserved |
|---|---|---|
| Document analysis | A completed synthetic analysis exposed normalized findings, risks, questions and proposed revisions. A reviewer accepted a revision and used the explicit confirmation action. The application created `Нормализованная версия 2`. | The result correctly marked legal bases unavailable rather than inventing citations while direct-source retrieval was unavailable. |
| Exact comparison and redline | A synthetic PDF and DOCX version were submitted through the comparison route. The completed result exposed a precise redline, material-change summary and export actions. | The page labelled legal AI assessment and citations as temporarily unverified; no legal conclusion was represented as confirmed. |
| Comparison to case | The completed comparison was saved to the existing synthetic case. The UI confirmed `Сравнение связано с делом`. | Case selection was explicit; no object identifier was supplied in a URL or trusted without server validation. |
| Plan to case tasks | The plan action `Подтвердить и добавить шаги в задачи` was used. The case then displayed `Подтверждённые задачи: 4 реальные записи дела` with planned statuses. | Tasks were not created merely by viewing the plan; the user confirmation was required. |
| Demo checkout | The staging Individual plan checkout showed a price snapshot and an explicit staging-only consent. The sandbox payment was deliberately completed through `Тест: оплатить`; the order then showed `Оплата подтверждена`, `Оплачен` and persisted payment/ledger status. | No card form, acquirer transaction, external charge or production entitlement was used. This validates only the server-recorded staging demo-payment path. |
| Post-payment entitlement | After a full-page reload, the consultations route no longer displayed the Free-plan restriction and its request form was enabled. | The route continued to state that no slots were available and that it does not invent availability; no fictional lawyer or appointment was created. |

The controlled browser tab reported no console errors or warnings after the
completed demo-payment flow.

## Regression commands after the browser run

| Command | Result |
|---|---|
| `npm run type-check` | passed |
| `npm run lint` | passed |
| Targeted Node test set for analysis, comparison, action plan, checkout and reviewer protection | 92 passed, 0 failed |
| `npm run test:rendered` | 30 passed, 0 failed |
| `CLOUDFLARE_ENV=staging npm run validate:artifact` | passed: bindings, migrations, manifest and Worker handlers consistent |

The artifact validator intentionally defaults to `development`; its initial
environment mismatch was rerun with the explicit staging target above. No
source, binding, migration or deployed artifact was changed by that check.

## Verified negative / safety states

- The lawyer marketplace returned zero available specialists instead of showing a
  fictitious professional.
- The consultation route correctly reported zero available specialists instead of
  inventing availability. Its form was enabled only after the canonical paid
  staging entitlement had been verified.
- The admin AI-quality queue returned
  `AI_QUALITY_REVIEW_ACCESS_WRITE_FAILED` when the active account lacked the
  required reviewer assignment plus fresh MFA. This is the intended server-side
  protection, not a client-side defect to bypass.

## Still outside this evidence

1. A Russian authenticated direct-source smoke completed with two source cards
   whose links both passed the exact `lex.uz`/`advice.uz` allowlist. A subject
   matter UZ smoke did not complete within the bounded browser window and the
   in-page Stop control did not visibly settle before the tab was navigated
   away. UZ retrieval completion and citation-to-case verification therefore
   remain pending. No citation was fabricated in either incomplete UZ attempt.
2. A full client-to-approved-lawyer handoff needs a deliberately provisioned
   synthetic approved lawyer and a paid/eligible synthetic client account; the
   test run did not manufacture either.
3. AI-quality decisions require a real active `legal_reviewer` staff assignment
   and fresh TOTP in the same staging session. Owner staging-beta acceptance is
   recorded separately and is not substituted for reviewer audit events.
4. A complete client-to-approved-lawyer handoff still needs a deliberately
   provisioned synthetic approved lawyer. The test run must not fabricate one
   merely to satisfy a browser assertion.

## Staging entitlement repair

The first checkout run uncovered a fixture defect rather than a payment failure:
the synthetic paid plan used the non-canonical code `staging_individual`, while
the entitlement classifier intentionally recognizes the canonical `individual`
plan. The server therefore correctly treated that unrecognized code as Free on a
later route load.

- A private pre-change D1 backup was stored under
  `d1/juro-staging/20260806T165059Z/pre-entitlement-plan-code-repair-full.sql`.
  Its SHA-256 was
  `d52e195b000cd4d292f8faf1063cf3765bb37ec624c1f0d0a2756f6dfbe0e2e7`;
  an isolated restore reported `quick_check=ok` and zero foreign-key
  violations.
- The staging-only seed fixture now creates `individual`. The test suite asserts
  that this code exercises the canonical paid entitlement path.
- The one active synthetic staging subscription and its synthetic plan were
  changed from `staging_individual` to `individual` through two deterministic
  D1 updates. Cloudflare D1 rejects raw `BEGIN IMMEDIATE` statements through
  the CLI, so no manual transaction wrapper was used. The post-change read
  returned one active `individual` subscription and one `individual` plan, with
  no foreign-key violations.
- No schema was changed, no migration was added, no production database was
  contacted and no production deployment was performed.

Focused regression for the seed and checkout service: **15 passed, 0 failed**.
The authenticated browser check after the repair reported no console errors or
warnings.

See `STAGING-ENTITLEMENT-REPAIR-EVIDENCE.md` for the dedicated recovery record.
