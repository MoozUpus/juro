# Scripted investor demo

## Guardrails

- The seeded `investor-client@juro.uz` and `investor-lawyer@juro.uz` rows are
  dataset fixtures, not sign-in credentials. Use owner-accessible Client and
  Lawyer accounts only with records explicitly marked `SYNTHETIC DEMO`.
  Administrative access uses the approved operator account
  `muzaffarbekmurodoff@gmail.com` with fresh MFA and must remain limited to
  those synthetic records.
- OTP/session setup is an operator step; the seed deliberately creates no
  credentials or sessions. Never promise that a seeded mailbox is accessible.
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
- Room `a7dfaa3f-9104-4891-9ff9-01456bbaf835` for consultation
  `1d3bcda6-0d69-451d-829e-86a4d32db2f9` is already ended. Reopening it is a
  terminal-state demonstration and must not request devices. A new live-call
  rehearsal requires a distinct fresh `SYNTHETIC DEMO` request and confirmed
  consultation; never reset or reopen the ended room as if it were active.

## Rehearsal

1. Open `https://juro.uz/`, switch System → Light → Dark and return to System. Show the public product, trust surface and lawyer marketplace.
2. Sign in to `https://app.juro.uz/` with the owner-accessible Client account
   selected for the rehearsal. Confirm that every record used in the sequence
   carries the explicit `SYNTHETIC DEMO` marker.
3. Open the saved AI conversation and explain that its seeded answer intentionally asks for clarification and contains no invented legal citation. For a live question, open and verify an official Lex.uz source before treating the response as grounded.
4. Open the synthetic document, case and plan. Do not upload real material during the demo.
5. Open the lawyer marketplace and the published `Lawyer Demo · JURO` profile.
6. Open the linked request, accepted offer, client/lawyer chat and consultation.
   The proven accessible flow uses request
   `5a2ec6d4-1807-411d-b2b5-ef6f199620ed`; do not substitute real case data.
7. Switch to `https://lawyer.juro.uz/` with the owner-accessible assigned Lawyer
   account. Show the dedicated dashboard and 90-day trial.
8. Open Requests → the synthetic request. Show the active grant and only the permitted client/case records.
9. Open Matters/Tasks, start and stop a timer, then export the time CSV.
10. Run Conflict Check against synthetic names. Explain that the query is retained only as a hash and that a result is a prompt for human review, not a final legal conclusion.
11. Open Knowledge, show case/client linking, folders, tags and favorites. Create only a synthetic note.
12. Open AI/document review/monitoring from the professional navigation. Any legal change shown live must retain its official source; do not invent a monitoring event for the rehearsal.
13. Choose the call branch explicitly:
    - For the already ended consultation above, open the exact room only to show
      the localized terminal state. Verify that no device-check action appears
      and do not request camera or microphone access.
    - For a live-call rehearsal, create and confirm a distinct fresh
      `SYNTHETIC DEMO` consultation first. Run device preflight, join from both
      participant accounts, and demonstrate two-way audio/video, mute/camera
      controls, synchronized timer, selected-source public-tab share, explicit
      share stop, bounded reconnect and clean one-sided end-call state.
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

Re-applying `apps/platform/scripts/investor-demo-seed.sql` is idempotent for the
fixed version-1 fixture identities and core records; it does not create mailbox
access or browser sessions. Mutable actions created during rehearsal must be
reviewed and reset explicitly. The seed does not erase production data,
overwrite arbitrary records or reset the accessible request/consultation above.
