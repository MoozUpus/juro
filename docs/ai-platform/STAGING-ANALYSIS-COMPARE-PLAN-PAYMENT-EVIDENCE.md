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

The controlled browser tab reported no console errors or warnings after the
completed demo-payment flow.

## Verified negative / safety states

- The lawyer marketplace returned zero available specialists instead of showing a
  fictitious professional.
- The current Free test entitlement disabled lawyer handoff and consultation
  submission instead of accepting an unauthorized request.
- The admin AI-quality queue returned
  `AI_QUALITY_REVIEW_ACCESS_WRITE_FAILED` when the active account lacked the
  required reviewer assignment plus fresh MFA. This is the intended server-side
  protection, not a client-side defect to bypass.

## Still outside this evidence

1. The direct Lex.uz/Advice.uz Worker path remains unavailable or too slow in
   staging. Successful source-card rendering and citation-to-case verification
   therefore remain pending.
2. A full client-to-approved-lawyer handoff needs a deliberately provisioned
   synthetic approved lawyer and a paid/eligible synthetic client account; the
   test run did not manufacture either.
3. AI-quality decisions require a real active `legal_reviewer` staff assignment
   and fresh TOTP in the same staging session. Owner staging-beta acceptance is
   recorded separately and is not substituted for reviewer audit events.
4. A read-only Wrangler D1 verification attempt received Cloudflare API error
   `10000` despite the local login displaying D1 scopes. No database mutation
   was attempted; the credential/session needs repair before CLI-only staging
   administration can be relied upon.
