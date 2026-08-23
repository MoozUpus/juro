# JURO investor-ready ecosystem

Status snapshot: release candidate on `codex/investor-ready-ecosystem`. Production evidence is recorded only after the relevant migration, deployment, HTTP and Chrome checks pass. Commercial production is not claimed while the app registration policies remain a disclosed pre-incorporation draft awaiting owner-approved operator details and final RU/UZ legal editions.

## Ecosystem map

| Surface | Canonical host | Purpose | Runtime |
| --- | --- | --- | --- |
| Public | `juro.uz`, `www.juro.uz` | Product, trust/legal pages and public lawyer marketplace/profile | `apps/website` |
| Client | `app.juro.uz` | Individual and business workspaces | `apps/platform` |
| Lawyer | `lawyer.juro.uz` | Role-gated professional workspace | `apps/platform`, host-aware Worker routing |
| Administration | `admin.juro.uz` | Fresh-MFA staff operations and moderation | `apps/platform`, isolated admin handoff |
| Status | `status.juro.uz` | Narrow public status surface | `apps/platform`, route-restricted host |

Only `lawyer.juro.uz` is canonical. Repository tests reject every noncanonical professional host.

## Lawyer route surface

The dedicated host resolves clean routes to existing role-aware platform modules: `/dashboard`, `/ai-chat`, `/document-builder`, `/document-review`, `/monitoring`, `/requests`, `/consultations`, `/clients`, `/matters`, `/calendar`, `/messages`, `/documents`, `/tasks`, `/knowledge`, `/billing`, `/demo-payments`, `/application`, `/profile`, `/security`, `/help`, `/settings` and `/status`. Authentication routes use the same identity system while server-side host and role checks prevent a client workspace from being exposed as a lawyer workspace.

## Implemented release-candidate changes

- Consent-based lawyer self-publication with immutable publication evidence and a 90-day trial.
- Trial reminders at 30, 7, 1 and 0 days; configurable post-expiry admin actions; no automatic profile deletion.
- Lawyer profile deletion request with an explicit admin decision and audit evidence.
- Participant-scoped consultation call rooms, short-lived TURN credentials, signalling, device preflight, screen sharing and reconnect handling.
- Configurable demo billing: 1% consultation fee, rule-based 2%/5% case-transfer fee, installment protection against double charging, transaction/audit history, status filter and CSV report.
- Professional time tracking, conflict search and private knowledge base. Conflict queries are stored only as SHA-256 evidence; results are restricted to accessible matters and the lawyer's own internal records.
- Object-targeted notifications, so lawyer request, consultation and admin deletion notifications open the specific record.
- A versioned, idempotent, fully synthetic three-account investor dataset. It creates no OTP, session, credential, uploaded file or invented legal-source record.

## Data and security boundaries

- Client/lawyer case access is derived from an active `lawyer_access_grant`; no global user directory is exposed.
- Calls accept only consultation participants and store signalling metadata, never call media.
- The browser receives short-lived ICE credentials only. The long-lived Cloudflare Calls key must remain a Worker secret.
- Demo payments are permanently marked `provider=demo` and `is_simulation=1`; they cannot activate production entitlements or move real money.
- Knowledge sources accept official `lex.uz` URLs only. Internal notes remain private and are not represented as legislation.
- Admin controls remain bound to staff assignment, local session, CSRF and fresh MFA.

## Migrations

| Migration | Purpose |
| --- | --- |
| `0146_lawyer_trial_publication.sql` | Self-publication, trial, reminders and deletion decisions |
| `0147_lawyer_billing_fee_matrix.sql` | Versioned fee policy/rules and demo transaction evidence |
| `0148_lawyer_call_rooms.sql` | Call rooms, participants and immutable signalling |
| `0149_investor_demo_dataset.sql` | Demo-account registry and immutable dataset events |
| `0150_notification_object_targets.sql` | Typed notification deep links |
| `0151_lawyer_professional_tools.sql` | Time, conflict and knowledge records |
| `0152_investor_demo_builder_documents.sql` | Synthetic document-builder records for the investor dataset |
| `0153_investor_demo_document_content.sql` | Populated synthetic investor document content |
| `0154_monitoring_task_sources.sql` | Official-source retention for monitoring-created tasks |
| `0155_platform_audit_hash_constraints.sql` | D1-safe immutable audit hash constraints |
| `0156_lawyer_message_workspace.sql` | Request-scoped replies, one persisted pin and bounded typing presence |

The production platform D1 migration pattern includes `0146` through `0156`. The separate legal-corpus Worker intentionally remains bounded through `0145` because these application tables are outside its runtime.

## Verification contract

A green build is not a production claim. The release requires, in order: type-check/lint/tests, production artifact validation, D1 backup and restore check, migration apply, secret readiness, deployment, HTTP/status smoke and authenticated Chrome QA. Browser/device exclusions are recorded in `QA_MATRIX.md` as `NOT TESTED` rather than inferred from Chromium emulation.
