# Decisions

## D-119 — legal corpus alerts are content-free immutable epochs

Status: accepted and locally verified
Date: 2026-08-05

A failed full-corpus run and a stale-source interval are operational evidence,
not legal content. JURO stores them in a separate additive table rather than
weakening the provider-cost alert schema. Each environment/source/type/epoch is
unique; failed alerts must reference an actual matching failed run, alert
identity is immutable and records cannot be deleted. The queue contains only an
opaque alert ID, and the existing server-only Resend worker resolves bounded
copy at delivery time. No source text, URL, tenant, user, workspace or recipient
is persisted in the alert. Absence of a prior successful run and age of at least
seven days both warn, while every previously unalerted failed run is recovered
in a bounded batch after scheduler downtime. Migration `0089` remains local
pending separately authorized staging backup/migration/deploy and email proof.

## D-118 — Lex discovery uses official RSS and remains review-only

Status: accepted and locally verified
Date: 2026-08-05

The public Lex surface exposes no working sitemap at the conventional RU, UZ or
root paths, but publishes official RU and UZ RSS feeds. JURO therefore discovers
only recent candidates from those two exact feeds; it does not crawl search
results or arbitrary page links. The scheduler claims a unique environment/day
run before remote access and honors `robots.txt` `Crawl-delay` using the Worker
scheduler wait API. Strict byte, media, XML, locale and canonical URL bounds
apply. Discovery is evidence acquisition only: every candidate stays
`pending_review` and cannot enter AI retrieval until explicit legal publication.
The feature is off in development and production; the staging configuration
candidate still requires an authorized deployment and controlled evidence.

## D-111 — Knowledge Base publication requires fresh MFA and D1 actor evidence

Status: accepted and locally verified
Date: 2026-08-04

Knowledge Base draft and publication operations are restricted to a dedicated
staff capability held by administrators and legal reviewers. Both page and API
require active TOTP-backed staff assignment and MFA verified within 15 minutes;
the request body cannot select the actor. D1 triggers append actor/content/status
evidence for article/version creation, draft edits, publication and lifecycle
changes. Published versions are immutable, and articles, versions and evidence
are archived or superseded rather than deleted. Existing 0077 seed versions are
not rewritten to invent historical actors. Their hash is explicitly marked
`body-v1`; all new authoring versions use `full-v2` over titles, summaries, both
localized bodies and related slugs.

## D-110 — product help is published as immutable bilingual versions

Status: accepted and locally verified
Date: 2026-08-04

Help articles use one version that contains equivalent RU and UZ bodies, a
canonical content SHA-256 and an ordered related-article set. Public reads select
only the latest published version and contain no tenant data. Helpfulness is a
separate authenticated, tenant-derived, idempotent projection with append-only
metadata audit; it never copies case, chat or document content. Published
versions are immutable, so corrections create a later version rather than
rewriting text already shown to users. Staff authoring is a separate protected
surface from public reads, and no draft is exposed through the public API.

## D-103 — case navigation is URL-addressable and workspace-scoped

Status: accepted and staging-deployed
Date: 2026-08-04

Every material case section has a stable localized URL, but all sections share
one tenant boundary. The server resolves the authenticated user's active
workspace, verifies the case belongs to it, and scopes each joined domain again
by workspace/case; private user-owned domains additionally bind the user. This
supports refresh, back/forward and direct links without copying case data into
client state or creating separate weaker APIs. Workspace members are labelled
honestly as workspace-level access until a separate case-role model is approved;
lawyer grants remain explicit, auditable and revocable.

## 2026-07-31 — consent-gated lawyer handoff

A lawyer receives only an anonymized request before a conflict check. A clear conflict result does not itself grant access to a case. A separate, explicit customer consent creates a durable grant; the customer may revoke it. This prevents accidental disclosure during lawyer selection and keeps the disclosure event auditable.

## 2026-07-31 — one durable grant per request

`lawyer_access_grants.lawyer_request_id` is unique. The current product policy does not re-open a revoked request: a new grant requires a new request and a new conflict check. This favors a clear audit chain over implicit reactivation.
## 2026-07-31 — mobile profile remains a first-class destination

The mobile shell uses the approved five destinations: dashboard, AI lawyer, cases, documents and profile. Secondary navigation remains in the accessible top-bar drawer. This preserves fast access to profile/security settings without overloading the bottom bar.

## 2026-07-31 — verified publication precedes legal-source embedding

Only a current, staff-approved, published and verified Lex/Advice version may enter the Vectorize pipeline. The queue carries only the version identifier; the consumer reloads lifecycle state, uses a deterministic vector id, and records index bookkeeping only after Vectorize accepts the upsert. Published legal text remains immutable: the narrow migration permits only this deterministic index bookkeeping while the version remains current and verified.

## D-095 — retain fail-closed document quarantine until a real scanner is entitled

Status: accepted and staging-enforced
Date: 2026-08-01

Cloudflare CLI verification for the owner staging account returned that Cloudflare Containers are unauthorized and require the Workers Paid plan. No installed scanner service or approved external scanner adapter is available. Therefore a document-upload finalization cannot mark a file `analysis_safe`, cannot enqueue it for OCR/analysis, and must persist `MALWARE_SCANNER_UNAVAILABLE` in the private quarantine flow.

This is a security boundary, not a temporary success status. It prevents R2 document bytes reaching OpenAI, Anthropic, or an extractor before an actual scanner passes the file. It will be replaced only after an entitled, privacy-approved scanner is wired to a tenant-scoped queue consumer and succeeds in staging with safe and malicious test samples.

## D-096 — legal-source corpus freshness requires a full corpus run

Status: accepted and staging-observed
Date: 2026-08-01

Single-source ingestion runs demonstrate bounded acquisition but do not prove that the legal corpus is current. Source-health therefore reports freshness only from successful `scheduled_corpus` or `manual_corpus` runs. The five-minute outbox scheduler is running successfully in staging; the first daily `0 19 * * *` corpus schedule is still pending its next UTC execution after deployment. The UI must show unknown rather than infer freshness from individual fetches.
## D-097 — lawyer reviews remain private until an MFA-gated moderation decision

Status: locally implemented; awaiting staging migration
Date: 2026-08-02

A completed service can create one private owner review. A `legal_reviewer` with a fresh local MFA session receives a separate `lawyer.reviews.moderate` capability. Each terminal decision is appended to `lawyer_review_moderation`, records a SHA-256 fingerprint of the original review text, and cannot be changed or deleted. A unique review fence prevents two decisions. Database-triggered status progression happens only after a decision record is inserted. Approval is not publication: no public lawyer profile consumes these reviews yet. A conservative contact-pattern screen prevents approving a review with a likely email, phone number, or PINFL-like value until a moderated text removes it.

## D-098 — AI cycles are a workspace entitlement, never a route constant

Status: accepted and locally verified
Date: 2026-08-02

The AI-chat route resolves the active, server-side workspace subscription before
reserving a chargeable answer cycle. Free workspaces retain the approved 20
cycles/month; verified active paid plans receive their explicit higher server policy
limits. The same resolved entitlement is returned in the private usage summary.
This prevents a paid workspace from being silently limited by a route-level free-plan
constant and prevents the browser from being the source of entitlement truth.

## D-099 — verified lexical retrieval includes official identifiers

Status: accepted and locally verified
Date: 2026-08-02

Verified legal retrieval continues to select only a current, published, staff-approved
and verified Lex/Advice source version. Its lexical candidate query now searches the
official act title and identifier, plus section canonical reference, article and
heading, before considering body text. Short numeric terms are retained only for
bounded act/article/clause identifiers (up to ten digits) and remain subject to the
existing source-lifecycle, jurisdiction, locale and citation-validation gates. This
improves direct official-reference queries without permitting an unverified source to
be cited as law.

## D-100 — legal lexical matching must not rely on SQLite ASCII case folding

Status: accepted and locally verified
Date: 2026-08-02

SQLite's built-in `lower()` and `NOCASE` behaviour do not provide dependable
Unicode case folding for Russian official text. Verified retrieval therefore binds
the bounded lower-case, title-case and upper-case variants of each legal keyword
to the existing official-metadata and section fields. This is a candidate-match
improvement only: source lifecycle, locale, verification, publication, current
activation and server-side citation checks remain mandatory.

## D-101 — synthetic evaluation inputs can enforce gates but never prove legal quality

Status: accepted and locally verified
Date: 2026-08-02

The reproducible RU/UZ evaluation corpus is a release-harness input set, not legal
ground truth. Its validator now rejects host/type disagreement, missing human review,
reviewer language scores below 95/100, and critical-deadline detection below 98%.
A passing evaluation still requires real reviewed outputs and verified existing
official URLs; the synthetic fixtures cannot create a legal-quality claim.

## D-102 — document-analysis input keeps trust boundaries explicit

Status: accepted and locally verified
Date: 2026-08-02

The document-analysis provider payload separates server-controlled analysis
parameters and verified legal sources from `untrustedDocument`. File name, MIME
metadata, OCR warnings, declared user side and extracted text remain intact as
evidence but are labelled untrusted for the model. The system instruction makes
their non-instructional status explicit. This is defense in depth: the safe-file
gate, server-only providers, no document tools, strict output schema, excerpt
validation and verified-citation replay remain mandatory.

## D-103 — every provider credential is rejected from deployable vars

Status: accepted and locally verified
Date: 2026-08-02

The Cloudflare artifact validator and its source-config test reject both
required and optional credential bindings from generated Wrangler `vars`.
This includes the legacy generic AI binding and future legislation/payment
credentials. Runtime values must remain Cloudflare secrets; model names and
other non-sensitive configuration remain ordinary environment variables.

## D-104 — current checkpoint outranks historical evidence summaries

Status: accepted and documented
Date: 2026-08-02

The AI-platform documentation retains chronological evidence but now starts its
implemented and limitation registers with an explicitly authoritative current
checkpoint. It prevents historical environment flags, secret inventories and
deployment versions from being mistaken for present state. A current checkpoint
may only record verified names, build/test output and deploy identifiers; it
does not convert unavailable browser, provider, scanner, legal-corpus or asset
gates into a claim of completion.

## D-105 — voice messages are an optional encrypted enhancement, not realtime voice

Status: accepted and locally verified
Date: 2026-08-04

The first voice slice records only after an explicit user action, limits a recording
to five minutes and 25 MB, uploads through a tenant-authorized API into a private
quarantine bucket, validates the full object before promotion, and sends it to the
server-side OpenAI transcription endpoint. Only an AES-GCM-protected transcript is
stored in D1. The original audio expires after 30 days and can be deleted earlier.
The user reviews and edits the transcript before the normal AI-chat request; the
recording is linked to the persisted message only inside the successful chat batch.
TTS is server-side and disclosed as synthetic AI speech. Realtime voice, WebGL and
the Jurobek avatar remain disabled until an approved rigged asset and separate
quality/performance gates exist. Text chat remains independent from voice support.

## D-106 — configure only secrets with real runtime consumers

Status: accepted and staging bindings verified
Date: 2026-08-04

The current platform uses one versioned `IDENTITY_KEYRING` contract for authenticated
encryption and keyed lookup evidence across identity, MFA, memory, deletion, guest AI
and voice transcripts. Opaque server-side sessions do not consume a `SESSION_SECRET`,
and Cloudflare Cron does not expose a public `CRON_SECRET` endpoint. Standalone secret
names from the original target architecture are therefore not added as unused dashboard
placeholders. A new secret is introduced only with a real server consumer, rotation
plan, deploy validator and tests. This keeps the runtime source of truth explicit and
avoids a false claim that unused secret names improve security.

## D-107 — task reminders cross the queue boundary as identifiers only

Status: accepted and staging verified
Date: 2026-08-04

The scheduler no longer writes task-reminder notifications directly. It creates an
idempotent `notification.dispatch` row in the existing durable outbox and publishes
only a versioned reminder identifier, workspace identifier and correlation evidence.
The consumer reloads the reminder, task, case and active workspace membership from
D1, rejects cross-workspace subjects neutrally, ignores stale versions and creates a
deterministic inbox notification in the same D1 batch that marks the reminder sent.
Retries and duplicate queue deliveries cannot create a second notification. No task
title, message body or other user content is placed in the queue envelope or logs.
Staging deployment `eef56269-2980-42b8-bc76-9a348f6d187b` attached the reviewed
consumer and a synthetic neutral-rejection probe confirmed end-to-end delivery.

## D-108 — public document links cross a strictly-public quarantine boundary

Status: accepted and locally verified
Date: 2026-08-04

A public-link import accepts only credential-free HTTPS URLs on port 443 and
uses the Workers `global_fetch_strictly_public` compatibility flag. The server
resolves and rejects non-public IPv4/IPv6 targets before every request, follows
at most three manual redirects, rechecks DNS after response headers, forwards no
authorization or browser credentials, requires a declared 1-byte-to-50-MB
identity-encoded body and streams it directly to private R2. R2 size/SHA-256,
magic-byte and archive checks must agree before the existing quarantine record is
created. Only origin and a SHA-256 of the canonical URL are persisted in audit;
the full URL is not logged. Imported content is user evidence, never an official
legal source, and remains unavailable to OCR or AI until a real malware verdict.

## D-109 — PDF structure and page limits are checked before OCR/provider access

Status: accepted and locally verified
Date: 2026-08-04

Every safe PDF entering the Workers AI extraction path is structurally parsed
before provider access. Password-protected, corrupt and over-500-page PDFs fail
closed with typed durable job errors; a bounded timeout remains retryable. ZIP
packages apply the same preflight to every PDF and enforce 500 known pages across
PDF members and image pages before submitting a provider batch. Exact DOCX page
count remains unknown without rendering and is not fabricated.

## D-112 — lawyer replies require their own immutable moderation evidence

Status: accepted and locally verified
Date: 2026-08-04

A public-approved lawyer may respond only to an already approved review linked
to that exact profile. The reply does not inherit the review's moderation: every
version starts pending and requires a separate fresh-MFA staff decision. Pending
or approved replies cannot be overwritten; rejection permits a new immutable
version. Public APIs project only the latest approved reply and omit actor,
workspace and moderation metadata. Notifications contain generic state text,
not the review or reply body; a moderation result is stored in the lawyer's own
default workspace, never in the client's workspace. This closes the product response path without
letting the lawyer self-publish or exposing private review context.

## D-113 — cost thresholds are versioned policy and circuit recovery is explicit

Status: accepted and locally verified
Date: 2026-08-04

Provider pricing and cost/failure thresholds are administrator-entered,
effective-dated policy rather than hard-coded product constants. The server
checks an open circuit immediately before covered OpenAI or Anthropic transport,
and an automatic threshold crossing atomically records one immutable event plus
one identifiers-only operational alert. Automatic evaluation may open but never
silently close a circuit; recovery requires a fresh-MFA operations action with
audit evidence. This creates an emergency stop without pretending D1 and the
external provider share a distributed transaction. Billing reconciliation and
remote alert/circuit rehearsal remain release gates.

## D-114 — public status is an operator-approved projection behind a narrow host

Status: accepted and locally verified
Date: 2026-08-05

JURO status does not infer provider, email or legal-product health from an
unrelated process check. Operations staff publish bilingual incidents through
the existing fresh-MFA boundary, and every state change is immutable and
forward-only. The public projection contains fixed product component names,
public copy, timestamps and an opaque incident reference; it excludes actor,
tenant, resource and infrastructure identifiers. A configured status hostname
is fenced in the Worker before application routing, so it cannot become a second
entry point to private platform routes. Automatic probes and domain attachment
remain separate staging gates rather than fabricated availability evidence.

## D-115 — operational feature stops are immutable environment-scoped decisions

Status: accepted and locally verified
Date: 2026-08-05

Emergency controls are not dashboard variables or client-side presentation flags. Every change is a per-environment append-only D1 version with a real staff actor, bounded reason, predecessor hash and canonical SHA-256 event hash. D1 enforces ordering and immutability; the application verifies the chain before it permits execution or another write. A disabled or corrupted chain fails closed before a provider call, new upload write, voice processing step or lawyer-request creation. Existing user data remains readable and deletable so an incident stop cannot trap personal content.

Only an operations-capable staff member with fresh MFA can view or change the flags, and mutation remains CSRF-protected. The browser never supplies environment or actor identity. Environment comes from server runtime configuration and malformed values are rejected rather than silently treated as production or staging. Migration `0084` and the matching Worker remain local until a separately authorized backup/migration/deploy cycle.

## D-116 — legal quality review is explicit, versioned and content-minimized

Status: accepted and locally verified
Date: 2026-08-05

The AI-quality queue exposes metadata only. Full question, answer and feedback
content requires a distinct auditable view. Legal decisions append immutable
versions; corrected/golden text is deletion-coupled, while retained evidence
contains only hashes, classification and opaque identifiers. Access is limited
to a legal reviewer with active TOTP and MFA verified within 15 minutes. The
application and migration `0087` both enforce this boundary; staging remains
through `0078` and production is unchanged.
## 2026-08-05 — AI runtime settings are allowlist-only and immutable

Decision: expose only deployment-allowlisted model choices and a fixed response
tone enum through an administrator/fresh-MFA console. Store changes as additive,
hash-chained D1 versions and bind the selected config hash into each chat or
document-analysis instruction hash. Keep jurisdiction, official-source rules,
privacy, retention, tenant authorization and injection defenses protected in
code/config. A missing table may use deployment defaults during expand rollout;
a present invalid chain fails closed. Migration `0088` remains local pending a
new staging backup/migration/deploy authorization; production is unchanged.
