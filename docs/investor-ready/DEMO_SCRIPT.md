# Scripted investor demo

## Guardrails

- Use the seeded `investor-client@juro.uz` and `investor-lawyer@juro.uz`
  identities only with records marked `SYNTHETIC DEMO`. Administrative access
  uses the approved operator account `muzaffarbekmurodoff@gmail.com` with fresh
  MFA and must remain limited to those synthetic records.
- OTP/session setup is an operator step; the seed deliberately creates no credentials or sessions.
- Do not enter real personal, client, document or case data.
- Payment steps are simulation only. The call is real WebRTC media but is not recorded.
- Treat `QA_MATRIX.md` as the hard rehearsal gate. Selected-source remote screen
  rendering, explicit share stop, bounded live reconnect and one-sided remote
  teardown are verified in two authenticated Chrome profiles. Recheck the
  current matrix and production status before each presentation; do not infer a
  new pass from this historical evidence. Native Chrome page zoom is
  intentionally outside the QA scope by user instruction.
- Before a two-profile rehearsal, confirm that the ChatGPT Chrome extension is
  stably connected to both selected Chrome profiles. A tab listing alone is not
  sufficient: navigation and DOM inspection must also succeed after any Windows
  scale transition.

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
13. Open the confirmed consultation call. Run device preflight, join from both
    participant accounts, and demonstrate the rehearsed two-way audio/video,
    mute/camera controls, synchronized timer, selected-source public-tab share,
    explicit share stop, bounded reconnect and clean one-sided end-call state.
    Never represent a stale rehearsal as evidence for the current session if a
    participant, permission or network check fails.
14. Open Billing. Show the trial, 1% consultation entry, 5% configured corporate transfer entry, sandbox disclosure, status filter and CSV export. Run a demo payment and a refund if required; no real charge occurs.
15. Open the public lawyer profile and show that self-publication carries no unearned Verified badge.
16. Sign in through `https://admin.juro.uz/` as the approved administrator
    `muzaffarbekmurodoff@gmail.com` with fresh MFA. Show trial controls, fee
    matrix, demo transaction, immutable audit evidence and the pending synthetic
    deletion request. Do not approve deletion during the standard demo.
17. Finish at `https://status.juro.uz/` and state the current verified service status, not a remembered status.

## Reset

Re-applying `apps/platform/scripts/investor-demo-seed.sql` is idempotent for the fixed version-1 identities and core records. Mutable actions created during rehearsal must be reviewed and reset explicitly; the seed does not erase production data or overwrite arbitrary records.
