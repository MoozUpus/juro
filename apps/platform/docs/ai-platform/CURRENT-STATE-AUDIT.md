# JURO platform — current-state audit

Audit date: 2026-07-26  
Scope: `app.juro.uz` and the `apps/platform` lineage in `MoozUpus/juro`  
Mode: read-only production inspection; no production data, schema, bindings, secrets, or deployments were changed.

## Executive summary

JURO currently has a working Cloudflare-hosted MVP with:

- email OTP and cookie sessions backed by D1;
- private R2-backed document storage;
- a substantial document builder with drafts, templates, collaboration, invitations, comments, proposals, approvals, shares, signed-file flows, and exports;
- basic workspaces, cases, action plans, consultations, billing configuration, privacy requests, document review, deterministic document comparison, and monitoring preferences;
- RU/UZ platform content and canonical document-builder routes.

The current implementation is not yet the target AI LegalTech platform described in the owner specification. Important screens are route shells, AI and document review are synchronous and incomplete, the legal-source ingestion system does not exist, and several identity, tenant, file-security, and collaboration controls fail the staging gate.

Production was not modified during this audit.

## Source-of-truth finding

There are two materially different source states:

| Source | Verified revision | Finding |
|---|---:|---|
| Sites checkout for `app.juro.uz` | `86843ca9ff0be33a97c8a6b22005d0d47e25ff53` | Most complete known production source; migrations `0000`–`0010`; used for this audit |
| GitHub `MoozUpus/juro` `main` | `eb5a5ca82d0059e7be04e34e9adcce2f7e3fb8ca` | Older platform snapshot; migrations only through `0004`; must not be deployed over the Sites source |

The comparison found 116 files present only in the Sites source, 50 materially changed files, one GitHub-only file, and 179 identical files. The GitHub feature branch `feature/juro-ai-platform` and draft PR #3 exist, but the complete Sites source has not yet been synchronized into them.

Until synchronization is complete and reviewed, the Sites checkout is the implementation baseline and GitHub `main` is not safe as a deployment source.

## Runtime and dependency baseline

The audited application root is the Sites checkout, corresponding to the platform application rather than the public marketing website.

Key versions:

- Next.js `16.2.12`;
- React `19.2.6`;
- TypeScript `5.9.3`;
- Vinext `0.0.50`;
- Vite `8.0.13`;
- Wrangler `4.92.0`.

No dependency downgrade is proposed.

## Verified production behavior

| Check | Result |
|---|---|
| `https://app.juro.uz/` | `307` to `/login` |
| `/ru/individual/document-builder` as guest | `307` to login with preserved `returnTo` |
| legacy `document-builder-test` route | `308` to canonical `document-builder` |
| `/api/platform/dashboard` without a session | `401` |
| `/api/document-builder/bootstrap` | reports live D1 and R2 bindings |
| `/uz/auth/login` | `404`; required target route is absent |
| `status.juro.uz` | `502`; no working public status page |
| security headers | CSP, HSTS, no-store, and noindex behavior present |

The working document-builder route and legacy redirects are protected regression requirements.

## Cloudflare state

Verified through the Sites project:

- project: `juro-app`;
- project ID: `appgprj_6a5f404b623081919cbfa1e3c85d412a`;
- production URL: `https://app.juro.uz`;
- `.openai/hosting.json` binds D1 as `DB` and R2 as `BUCKET`;
- the running bootstrap endpoint confirms both bindings are available.

Not independently verified:

- production D1 control-plane name or ID;
- production R2 control-plane bucket name;
- actual production D1 schema and migration ledger;
- dev/staging D1, R2, Queues, Vectorize, Analytics Engine, AI Gateway, or Cron resources;
- Cloudflare secret inventory.

Wrangler is not authenticated in this environment. Generated build configuration contains local placeholder resource names and IDs and is not evidence of production resource identity. No claim is made that the requested staging resources exist.

The Worker currently implements only `fetch`. It has no `scheduled` or `queue` handlers and no Queue, Vectorize, Cron, or Analytics Engine bindings.

## Data and migrations

- Drizzle schema currently describes 53 application tables.
- Local application of migrations `0000`–`0010` to an empty SQLite database succeeded.
- The resulting local database had 79 tables and zero foreign-key violations.
- No destructive `DROP` was found in the existing migrations.
- This local result does not prove compatibility with the actual production schema.
- Migration `0004` copies sensitive operational tables into `__backup_*` tables in the same D1. These are not independent backups and have no tested restore procedure.
- `migrations_dir` is not committed in Wrangler configuration.

No production snapshot or migration was performed because the control plane is not authenticated and an independent backup could not be verified.

## Existing feature truth table

| Area | Status | Evidence / limitation |
|---|---|---|
| Email OTP | Partial | Resend adapter, 6 digits, expiry, cooldown, hashes; rate, Turnstile, atomicity, and session rules incomplete |
| Sessions | Partial | hashed tokens and secure cookies; no rotation, device model, 24h mode, single-device revoke, or security-event revocation |
| Onboarding | Partial | profile flow exists; routes, account types, consent versioning, and target redirect differ |
| Workspaces | Partial | D1 membership/invitations exist; business URL does not include workspace ID and tenant gaps remain |
| Document builder | Substantial | connected D1/R2 implementation; critical invitation and workspace-isolation issues require fixes |
| Cases / plans | Partial | D1 records exist; object routes render a shared/general client rather than a complete case workspace |
| AI lawyer | Prototype | synchronous OpenAI intake; no streaming, structured Zod contract, legal retrieval, fallback, memory, or usage ledger |
| Document analysis | Prototype | synchronous OpenAI request with a 10 MB form upload; no Claude, scan, OCR, queue, or rich result schema |
| Comparison | Partial | deterministic comparison and export; not semantic Claude comparison |
| Legal knowledge | Not implemented | no Advice/Lex ingestion, versions, hybrid retrieval, citation validator, sync jobs, or editor |
| Lawyer marketplace | Not implemented | consultation records are not the required directory/conflict/access-grant workflow |
| Billing | Adapter-ready only | configuration and records exist; checkout explicitly returns `PAYMENT_ADAPTER_REQUIRED` |
| Monitoring | Preferences only | verified updates can be displayed; source ingestion adapter is absent |
| Admin / support / status | Not implemented | no protected admin suite, support workflow, or operational status site |
| Voice / realtime calls | Not implemented | must remain feature-flagged, without simulated completion |

## Configuration and documentation drift

- The Sites production environment inventory returned no configured environment entries.
- Source code references `APP_URL`, `EMAIL_FROM`, `PUBLIC_SITE_URL`, and `RESEND_API_KEY`; source references are not proof that production values are configured.
- Required OpenAI, Anthropic, session/encryption, OTP pepper, Cron, Turnstile, TOTP, signed-URL, and model variables are not present in the verified Sites environment inventory.
- `docs/production-runbook.md` claims environment setup that could not be verified.
- App policy copy still contains visible `{OPERATOR_LEGAL_NAME}`, `{OPERATOR_EMAIL}`, and `{OPERATOR_ADDRESS}` placeholders.
- The repository README describes starter/prototype behavior and is not an accurate operational guide.

## Baseline verification

Executed against revision `86843ca`:

```text
npm run type-check
  PASS

npm run lint
  PASS

npm audit --omit=dev --audit-level=high
  0 vulnerabilities

npm test
  production build and artifact validation: PASS
  rendered route/security tests: 16 PASS
  unit/integration tests: 91 PASS
  total: 107 PASS
```

A targeted source/client scan found no provider key values or private keys. The existing suite is a baseline, not evidence that the target Definition of Done is met.

## Phase 0 gate

The baseline is reproducible, but Phase 0 remains open until:

1. the production Sites source is synchronized into the GitHub feature branch;
2. a Cloudflare control-plane inventory is completed after safe local authentication;
3. a real production D1 export/snapshot and restore plan are verified before any production migration;
4. the design audit and threat model are committed;
5. the two critical builder isolation defects and OTP race are covered by failing regression tests before implementation.

