# Legal publication handoff

Status: **owner particulars supplied; explicit RU/UZ content approval pending**.
This document is an execution checklist, not legal approval and not a
substitute for review by the project owner's qualified counsel.

## Owner-supplied inputs

The owner supplied the following publication candidate values on 23 August
2026. They are now present in the repository candidate, but that candidate
remains `draft` until the owner explicitly approves all five RU and UZ editions:

1. Public operator designations — `ООО «JURO»`, `«JURO» MChJ` and `«JURO» LLC`.
2. Public contact — `admin@juro.uz`.
3. Public address — `Tashkent, Uzbekistan`.
4. Candidate effective/publication date — 23 August 2026 (`23 августа 2026` /
   `2026-yil 23-avgust`).
5. Candidate version label — `2026-08-23.1`.
6. Still required: explicit approval of both the RU and UZ editions of each
   document:
   - Terms;
   - Privacy Policy;
   - Cookies Policy;
   - AI Usage Rules;
   - Personal Data Processing Notice.

## Repository publication procedure

1. Completed for the candidate: replace every `{OPERATOR_*}` placeholder in
   `apps/platform/content/app-legal.ts` with the supplied values.
2. Completed for the candidate: update each document's visible `updated` value
   in both locales.
3. Completed for the candidate: issue `POLICY_VERSION=2026-08-23.1` and set the
   ten RU/UZ SHA-256 values to the candidate canonical-content digests. The
   definitions intentionally remain `draft` until explicit approval. After
   approval, change only this new version to `approved`, recompute its digests
   because status is canonical content, and never rewrite or relabel an already
   accepted historical version.
4. Update `apps/platform/tests/policy-acceptance.test.ts` for the new version and
   status. Preserve the assertions that registration records the exact locale,
   content digest, acceptance method and auth evidence.
5. Verify that the protected policy registry creates a new versioned row while
   existing `user_acceptances` continue to reference the historical document
   version and digest.
6. Run the focused policy tests, full Platform suite, type-check, lint,
   production build and artifact validation before deployment.
7. Deploy only after green CI, then inspect all ten RU/UZ policy renderings in
   authenticated Chrome and record the deployed Worker version.

## Completion evidence

The legal-publication gate is closed only when all of the following are true:

- repository search returns no `{OPERATOR_LEGAL_NAME}`, `{OPERATOR_EMAIL}` or
  `{OPERATOR_ADDRESS}` placeholder in shipped policy content;
- all ten final RU/UZ policy documents have a new immutable version and matching
  canonical SHA-256 digest;
- the visible draft/pre-incorporation disclosure has been replaced only after
  owner approval;
- a new registration records the approved mandatory Terms, Privacy and Personal
  Data versions without changing older acceptance evidence;
- local validation, GitHub CI, production deployment, HTTP smoke and Chrome
  rendering evidence pass;
- the final evidence record identifies who supplied/approved the public values
  without placing private credentials or unrelated personal data in the repo.
