# Legal publication handoff

Status: **owner-approved and published in production**. The first genuine
production registration under this version remains to be observed; no fake
user was created merely to manufacture acceptance evidence.

## Owner-approved inputs

On 23 August 2026 the owner supplied the publication particulars and then
explicitly approved the RU and UZ editions of Terms, Privacy Policy, Cookies
Policy, AI Usage Rules and Personal Data Processing Notice version
`2026-08-23.1` for publication:

1. Public operator designations — `ООО «JURO»`, `«JURO» MChJ` and `«JURO» LLC`.
2. Public contact — `admin@juro.uz`.
3. Public address — `Tashkent, Uzbekistan`.
4. Effective date — 23 August 2026 (`23 августа 2026` /
   `2026-yil 23-avgust`).
5. Policy version — `2026-08-23.1`.

This record identifies the project owner's approval; it is not independent
legal advice or a substitute for review by qualified counsel.

## Publication execution

1. Commit `eb93badc` replaced the shipped `{OPERATOR_*}` placeholders, updated
   both visible dates and prepared the ten RU/UZ candidate digests.
2. After the explicit approval, commit `b15e3ea7` changed only the new version
   to `approved`, recomputed all ten canonical-content SHA-256 values and
   replaced the visible draft disclosure with an approved-version disclosure.
3. Focused policy tests passed 3/3; type-check, lint, rendered HTML 33/33, core
   1070/1070, Cloudflare 201/201 and the production artifact/performance budgets
   passed locally.
4. GitHub CI `32637355533` passed Website in 57 seconds and Platform in 5 minutes
   52 seconds for approved commit `b15e3ea7`.
5. The reviewed production deploy script passed dry-run and deployed Platform
   Worker `c90f5dd6-459c-4358-9ccd-3316a45e6aab` at 100% traffic. The immediate
   rollback is `ecabef2f-cd37-40f0-9e20-66803b753f3b`.
6. All ten live RU/UZ routes returned HTTP 200 with `noindex`, version
   `2026-08-23.1`, the approved badge and their exact digest. Chrome rendered
   each locale without horizontal overflow and without the retired placeholder
   disclosure.
7. A single atomic production D1 insert published exactly ten append-only
   `policy_documents` rows with `status=approved`, effective start
   `2026-08-22T19:00:00.000Z` (23 August in Tashkent) and publication timestamp
   `2026-08-23T11:58:04.643Z`. Pre/post Time Travel bookmarks are retained in
   the production evidence record.
8. Existing `user_acceptances` were unchanged: version `2026-07-24` RU remains
   4 rows, and `2026-07-26.draft.1` remains 18 RU plus 18 UZ rows. New
   registrations will reference the pre-published approved rows by exact ID,
   locale, version, status and digest.

## Remaining live acceptance observation

The registration-path regression test proves that a new email-OTP registration
records the approved mandatory Terms, Privacy and Personal Data versions with
their exact digests and separate marketing consent. A genuine production signup
must still be observed before that browser-level acceptance row is marked
`VERIFIED`; it must use a real owner-accessible mailbox and remain explicitly
synthetic/demo if created for QA. Historical acceptance evidence must not be
rewritten, relabelled or deleted.
