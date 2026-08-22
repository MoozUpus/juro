# Legal publication handoff

Status: **awaiting owner-supplied data and approval**. This document is an
execution checklist, not legal approval and not a substitute for review by the
project owner's qualified counsel.

## Owner-supplied inputs

Do not infer any of these values from a domain registration, email account,
repository metadata or a demo identity. The owner must provide and approve:

1. `OPERATOR_LEGAL_NAME` — the exact public legal name of the platform operator.
2. `OPERATOR_EMAIL` — the public contact address for policy requests and
   complaints.
3. `OPERATOR_ADDRESS` — the exact public operator address.
4. The effective/publication date and approved version label.
5. Explicit approval of both the RU and UZ editions of each document:
   - Terms;
   - Privacy Policy;
   - Cookies Policy;
   - AI Usage Rules;
   - Personal Data Processing Notice.

## Repository publication procedure

1. Replace every `{OPERATOR_*}` placeholder in
   `apps/platform/content/app-legal.ts` with the exact owner-approved values and
   apply any owner/counsel-approved RU/UZ text changes.
2. Update each document's visible `updated` value in both locales.
3. In `apps/platform/lib/legal/policies.ts`, issue a new immutable
   `POLICY_VERSION`, change the new definitions from `draft` to `approved`, and
   set the ten RU/UZ SHA-256 values to the digests of the final canonical
   content. Never rewrite or relabel an already accepted historical version.
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

