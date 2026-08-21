# Scripted investor demo

## Guardrails

- Use only the three `investor-*@juro.uz` identities and the records marked `SYNTHETIC DEMO`.
- OTP/session setup is an operator step; the seed deliberately creates no credentials or sessions.
- Do not enter real personal, client, document or case data.
- Payment steps are simulation only. The call is real WebRTC media but is not recorded.

## Rehearsal

1. Open `https://juro.uz/`, switch System → Light → Dark and return to System. Show the public product, trust surface and lawyer marketplace.
2. Sign in to `https://app.juro.uz/` as `investor-client@juro.uz`. Confirm the persistent synthetic-demo disclosure.
3. Open the saved AI conversation and explain that its seeded answer intentionally asks for clarification and contains no invented legal citation. For a live question, open and verify an official Lex.uz source before treating the response as grounded.
4. Open the synthetic document, case and plan. Do not upload real material during the demo.
5. Open the lawyer marketplace and the published `Lawyer Demo · JURO` profile.
6. Open the linked request, accepted offer, client/lawyer chat and confirmed consultation.
7. Switch to `https://lawyer.juro.uz/` as `investor-lawyer@juro.uz`. Show the dedicated dashboard and 90-day trial.
8. Open Requests → the synthetic request. Show the active grant and only the permitted client/case records.
9. Open Matters/Tasks, start and stop a timer, then export the time CSV.
10. Run Conflict Check against synthetic names. Explain that the query is retained only as a hash and that a result is a prompt for human review, not a final legal conclusion.
11. Open Knowledge, show case/client linking, folders, tags and favorites. Create only a synthetic note.
12. Open AI/document review/monitoring from the professional navigation. Any legal change shown live must retain its official source; do not invent a monitoring event for the rehearsal.
13. Open the confirmed consultation call. Run device preflight, join from both participant accounts, verify two-way audio/video, screen sharing, reconnect and end-call state.
14. Open Billing. Show the trial, 1% consultation entry, 5% configured corporate transfer entry, sandbox disclosure, status filter and CSV export. Run a demo payment and a refund if required; no real charge occurs.
15. Open the public lawyer profile and show that self-publication carries no unearned Verified badge.
16. Sign in through `https://admin.juro.uz/` as `investor-admin@juro.uz` with fresh MFA. Show trial controls, fee matrix, demo transaction, immutable audit evidence and the pending synthetic deletion request. Do not approve deletion during the standard demo.
17. Finish at `https://status.juro.uz/` and state the current verified service status, not a remembered status.

## Reset

Re-applying `apps/platform/scripts/investor-demo-seed.sql` is idempotent for the fixed version-1 identities and core records. Mutable actions created during rehearsal must be reviewed and reset explicitly; the seed does not erase production data or overwrite arbitrary records.
