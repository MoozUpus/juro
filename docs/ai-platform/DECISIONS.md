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

Only an operations-capable staff member with fresh MFA can view or change the flags, and mutation remains CSRF-protected. The browser never supplies environment or actor identity. Environment comes from server runtime configuration and malformed values are rejected rather than silently treated as production or staging. Migration `0084` and the matching Worker were deployed in protected staging under `STAGING-0079-0088-EVIDENCE.md`; production is unchanged.

## D-116 — legal quality review is explicit, versioned and content-minimized

Status: accepted and locally verified
Date: 2026-08-05

The AI-quality queue exposes metadata only. Full question, answer and feedback
content requires a distinct auditable view. Legal decisions append immutable
versions; corrected/golden text is deletion-coupled, while retained evidence
contains only hashes, classification and opaque identifiers. Access is limited
to a legal reviewer with active TOTP and MFA verified within 15 minutes. The
application and migration `0087` both enforce this boundary. It was deployed in
protected staging under `STAGING-0079-0088-EVIDENCE.md`; production is unchanged.
## 2026-08-05 — AI runtime settings are allowlist-only and immutable

Decision: expose only deployment-allowlisted model choices and a fixed response
tone enum through an administrator/fresh-MFA console. Store changes as additive,
hash-chained D1 versions and bind the selected config hash into each chat or
document-analysis instruction hash. Keep jurisdiction, official-source rules,
privacy, retention, tenant authorization and injection defenses protected in
code/config. A missing table may use deployment defaults during expand rollout;
a present invalid chain fails closed. Migration `0088` was applied in protected
staging under `STAGING-0079-0088-EVIDENCE.md`; production is unchanged.

## D-121 — legal applicability is reviewer evidence, not model inference

Status: accepted and locally verified
Date: 2026-08-05

An effective or expiry date used to select an Uzbekistan legal-source version must come from an explicit legal-reviewer decision. New approvals therefore require a calendar date, stored as the start of that day in `Asia/Tashkent`, with optional later expiry. The evidence is immutable, session/MFA-bound and required by D1 before approval. The AI provider cannot infer or rewrite this interval.

When a successor is activated, the predecessor ends at the earlier of its reviewed expiry or the successor effective date. Historical retrieval accepts that derived boundary only after revalidating both applicability records and the immutable replacement lifecycle. Legacy approvals without applicability evidence remain usable only in their existing current-publication path; no historical date is fabricated for them. Migration `0090` is deployed in protected staging under `STAGING-0089-0090-EVIDENCE.md`; production is unchanged.

## D-122 — legal freshness requires verified activated coverage

Status: accepted and deployed to protected staging
Date: 2026-08-05

A successful fetch is acquisition evidence, not legal-freshness evidence. Full
corpus `success` requires all discovered entries to be fetched without error and
to match their current staff-published, activated, verified versions. Changed or
new pending-review versions close as `partial` and cannot refresh the database
timestamp. D1 enforces the counters and immutable terminal evidence; application
freshness, health and alert readers repeat the predicate. Migration `0091`
preserves legacy rows and is deployed to protected staging under
`STAGING-0091-VERIFIED-CORPUS-FRESHNESS-EVIDENCE.md`.

## D-123 — evaluation citations require canonical live evidence

Status: accepted and locally verified
Date: 2026-08-05

An allowlisted hostname or self-declared result field is not citation proof.
The release validator accepts only exact canonical Lex/Advice document URLs,
same-document redirects and terminal 2xx HTML/XHTML. Strict bounded Zod input
rejects provider-invented or malformed evidence. Internal citations require a
separate staging-DB proof and fail closed in the standalone CLI. This gate does
not replace named human legal review of all real evaluation outputs.

## D-124 — verified corpus freshness deployed only to staging

Migration `0091` and exact commit `81de7bb` are deployed to protected staging
after verified private backup and isolated restore. Production remains
unchanged. See `STAGING-0091-VERIFIED-CORPUS-FRESHNESS-EVIDENCE.md`.

## D-125 — legal evaluation requires persisted-run evidence

Status: accepted and locally verified
Date: 2026-08-05

The release CLI must receive a separate content-free evidence export from the
fresh-MFA staging legal-review endpoint. The exporter binds each scenario to the
actual completed D1 run, exact prompt, stored structured output and immutable
`correct` review event, plus the SHA-256 of the complete results envelope;
result JSON alone is insufficient. The export retains
hashes and opaque identifiers, not answer, question, workspace or email. This is
local code only and does not satisfy the still-open 314-run human-review gate.

## D-126 — document quality evidence must be derived from persisted staging state

Status: accepted and locally verified
Date: 2026-08-05

The document release CLI no longer accepts a reviewed-results JSON with
self-declared remote IDs. It requires the exact artifact manifest plus a
content-free, MFA-authenticated evidence export. Additive migration `0092`
records immutable review/export events and binds them to current D1 file, scan,
analysis-result hash, provider run, critical-risk and comparison state. The
100-package/30-comparison execution and quality thresholds remain open; this
decision changes no staging or production resource by itself.

## D-127 — case restore does not silently reopen legal work

Status: accepted and locally verified
Date: 2026-08-05

Completion, archive visibility and reopening are distinct user decisions.
Restoring an archived case returns it to `completed`; a separate `reopen`
transition is required to resume work. Migration `0093` records authoritative
unfinished task/step counts and immutable transition evidence. It remains local
and expand-only; the direct-projection contract fence is deferred until the new
Worker is active in staging.

## D-128 — AI document prefill is explicit, server-derived and deletion-coupled

Status: accepted and locally verified
Date: 2026-08-05

An AI suggestion never creates a document directly and the browser cannot pick
a template or inject an arbitrary questionnaire field. The server derives both
from the authenticated tenant-owned assistant message, the user reviews values,
and one explicit confirmation creates the real Builder draft. Idempotency keys
are transient and stored only as SHA-256.

Provenance intentionally excludes field values and cascades with the deletable
message/document/account graph. This preserves privacy deletion while retaining
enough scoped evidence for replay and conflict detection. Migration `0094` is
local only; staging requires a new backup/isolated restore and explicit rollout.

## D-129 — Builder checkpoints use private R2 and restore by new revision

Status: accepted and locally verified
Date: 2026-08-05

Full Builder checkpoints are sensitive user content and are not duplicated in
a D1 audit table. The server snapshots already-persisted document state into a
conditional private R2 object; D1 retains tenant/revision/object identity only.
List APIs expose metadata, never snapshot content.

Restore never rewrites the source checkpoint. After object verification it
projects the snapshot as the next revision and appends immutable restore
evidence. An old approved or signed state is not restored as legal evidence: a
non-draft snapshot returns as `Готов` and must pass current review/signature
controls again. Migration `0096` is deployed to protected staging; production
is unchanged and authenticated owner restore proof remains open.

## D-130 — unchanged-content legal transitions checkpoint before mutation

Status: accepted and locally verified
Date: 2026-08-05

Finalization, approval, internal signing and signed-PDF upload change
status/evidence but not the persisted legal text. Their immutable checkpoint is
created and verified before the transition. Storage failure aborts the
transition before output-object writes. A signed object is removed if its
atomic D1 registration batch fails. A pre-existing exact revision checkpoint
is reused.

Accepted suggestions and analysis corrections alter legal text and therefore
use the separate projected transaction in D-131.

## D-131 — content-changing Builder versions use projected R2 write intents

Status: accepted and locally verified
Date: 2026-08-05

The server writes and verifies the projected complete snapshot before applying
an accepted collaboration proposal or corrected Analysis version. One D1 batch
then claims the unique document revision, applies the legal text, attaches the
ready immutable version and closes its metadata-only write intent. A D1 failure
leaves the Builder unchanged; the scheduled reconciler handles stale orphan
objects without bucket-list guessing.

Analysis correction return is explicit, active-owner scoped and valid only for
the unchanged Builder revision captured by the original handoff. Migration
`0097` and the matching route/UI remain local pending separately authorized
staging backup, migration, deploy and authenticated lifecycle proof.

## D-132 — staging malware scanning uses a private pinned ClamAV Container

Status: deployed and staging-verified
Date: 2026-08-05

Docker is not required on the local workstation. The staging Worker uses
Cloudflare Containers with the pinned official image
`docker.io/clamav/clamav@sha256:4de20bd9ab45a4b763c5412b769217ef5082572ebc8a63aff1a77943419e5dd8`.
The Worker streams a quarantined R2 object directly to `clamscan` over a private
service binding. The container has no public IP and egress is disabled; it never
receives an AI-provider credential and it does not expose an HTTP endpoint.

The queue is attached only in staging. Scanner, upload and analysis paths are
fail-closed: an unavailable, malformed or inconsistent scanner response leaves
the object quarantined and prevents any AI request. A staging-only EICAR probe
ran successfully on 2026-08-05 and removed its synthetic D1 and R2 state. The
probe switch is now `false`.

The image digest must be deliberately refreshed through review and staging
verification when ClamAV signatures need updating; production remains unchanged.

## D-133 — Corpus crawl-window retries are recovered through the existing outbox

Status: accepted and locally verified
Date: 2026-08-06

Official Lex.uz and Advice.uz URLs remain subject to their published
robots/rate policy. A retry can become stranded when a queue delivery budget is
exhausted while a fenced host crawl window is still active: the source-fetch
request and job run stay retryable, while the immutable outbox row is already
marked `dispatched` and therefore is not claimed by ordinary dispatch.

The five-minute scheduled handler recovers at most one stale, retryable
scheduled-corpus outbox row per invocation. It retains the original job ID and
idempotency key, clears only the expired dispatch state, and then lets the
ordinary leased outbox publisher deliver it. This neither bypasses host
windows nor mutates a fetch request, source version or review status. A late
queue delivery is fenced by the existing job lease. Production is unchanged
until a separately approved deployment.

## D-134 — Lex PDF representations are secondary immutable evidence, not automatic verification

Status: accepted and locally verified
Date: 2026-08-06

Some canonical Lex.uz document pages expose the legal text through an official
`/pdffile/:id` representation rather than through an extractable HTML article.
After an extractable-HTML parser failure, JURO may derive that representation
only from the same canonical Lex document identifier. The PDF request remains
constrained by the exact Lex host, canonical identifier, `robots.txt`, the
durable crawl window, a content-type and magic-byte check, and the normal byte
limit.

The immutable private R2 PDF object is linked from normalization metadata while
the original HTML evidence and canonical citation remain unchanged. Extraction
uses the existing bounded PDF parser and creates a separate idempotent
`legal.parse` recovery job only for a previously rejected Lex normalization.
This recovery does not alter source/version verification, activation or
publication state. A pending source review is still required before a source
can support a verified legal answer. Production remains unchanged until a
separate approved deployment.

## D-135 — Official source authority is distinct from index publication

Status: accepted and staging-verified
Date: 2026-08-06

`lex.uz` and `advice.uz` are JURO's allowlisted official source domains. Their
authority is not questioned in the user interface. Separately, JURO only makes
a legal finding "confirmed" after the exact fetched snapshot has been parsed,
linked to a source version and published through the existing staff audit trail.
This prevents a fetch, parser or indexing failure from being presented as a
verified article while preserving the owner's source-authority policy.

When the published index lacks a relevant fragment, the UI says that the
official-source index is not yet published for that finding; it must not imply
that Lex.uz or Advice.uz themselves are untrusted. Production remains
unchanged.

## D-136 — query-scoped direct official sources replace the owned legal corpus

Status: accepted locally and deployed to staging; authenticated browser smoke pending
Date: 2026-08-06

The current execution objective supersedes D-118 through D-135 where they
require a JURO-owned Lex.uz/Advice.uz corpus, per-source reviewer approval,
RSS discovery, or Vectorize retrieval. AI chat now obtains only query-scoped,
allowlisted official pages. A direct result is technically validated through
canonical URL, bounded fetch, robots policy, parsed title/excerpt and content
hash; it is not sent through a new legal-review queue.

Migration 0106 stores only the source card metadata and a maximum 1,200
character excerpt for the completed AI run. The legacy corpus tables, R2 data,
queue and indexes are retained as dormant rollback assets; no deletion or
production change is included in this decision.

The owner has accepted the existing 314 legal, 100 document and 30 comparison
reviewer decisions as a private staging-beta acceptance. This records beta
authorization only, does not invent test execution evidence, and grants no
access to another person.

## D-137 — staging administration uses a separate Access-protected Worker and session

Status: accepted and staging-deployed; Access boundary verified, authenticated browser handoff smoke pending
Date: 2026-08-06

The protected staging admin domain is an independent Worker rather than another
platform route. It has no direct D1/R2/Queue/AI binding and can request only
strictly projected dashboard and lawyer-moderation data from
`juro-platform-staging` through a service binding authenticated by a shared
secret. A two-minute hash-only handoff ticket becomes an independent
fifteen-minute host-only admin session. Every protected request rechecks active
TOTP, current platform role and the source MFA session; logout revokes that
server record before cookie removal.

Cloudflare Access is a second boundary with a dedicated owner-only application.
This decision covers only `admin.staging.juro.uz`; it does not migrate or
expose production administration.

## D-138 — reviewer moderation reuses the protected platform service boundary

Status: accepted and staging-deployed
Date: 2026-08-07

The isolated staging admin Worker now renders the pending lawyer-review queue
and sends only bounded moderation commands to the existing platform Worker via
the private service binding. It remains intentionally without D1, R2, Queue,
AI or public-session bindings. The platform rechecks the separate admin-domain
session, fresh source MFA and current role on every request.

`lawyer_moderator` may list, approve or reject lawyer reviews and supply a
bounded redaction/reason. It cannot view the super-admin dashboard. A decision
and its workspace audit event are written atomically, PII-like replacement text
is rejected, and audit payloads contain identifiers and decision metadata only.
This release has no D1 migration and does not alter production.

## D-139 — correction requests are an explicit non-bookable marketplace state

Status: accepted and staging-deployed
Date: 2026-08-07

Professional profile moderation now distinguishes `changes_requested` from a
terminal rejection. The immutable per-revision moderation record keeps the
reviewer's bounded reason. To remain compatible with the existing D1 triggers,
the legacy profile status remains `pending` while `marketplace_status` becomes
`changes_requested`; public-directory projection is explicitly fail-closed and
cannot expose or book that state. A later material profile edit increments the
revision and returns a complete profile to `pending_review`, requiring a new
moderation record before publication.

This release is application-only. The related repair to the local Drizzle
journal records already-applied migrations `0106`–`0109` for SQLite test
parity; it does not modify remote D1 or production.

## D-140 — lawyer-profile status changes notify the lawyer atomically

Status: accepted for protected staging
Date: 2026-08-07

Profile lifecycle status is not communicated only through a later page reload.
The existing tenant-scoped `notifications` inbox is reused so no redundant
identity or moderation table is introduced. Profile creation, a complete
resubmission (including one caused by a replacement photo), and reviewer
approve/reject/correction decisions add a localized RU/UZ in-app notification
in the same D1 batch as the status revision and immutable audit evidence.

Notifications contain only the status and the reviewer's bounded reason when
applicable; they do not expose moderator identity, raw tokens, or private
profile data. Marketplace projection remains fail-closed regardless of whether
the notification is read. This is an application-only staging change and does
not modify production or remote D1 schema.

## D-141 — restricted lawyer-profile lifecycle is fail-closed and append-only

Status: accepted and deployed to protected staging only
Date: 2026-08-07

Migration `0110_lawyer_profile_lifecycle_controls.sql` introduces a dedicated
append-only lifecycle record for `suspended`, `blocked`, `archived` and
`restored` marketplace states. D1 rejects update or deletion of lifecycle
records, validates state-specific evidence, and rejects any marketplace change
away from a restricted state unless an exact lifecycle event is present in the
same transaction.

The private lifecycle endpoint is role- and fresh-MFA-gated: only a
super-admin can block a profile; moderation staff may suspend, archive or
restore it. Each transition atomically records the lifecycle event,
workspace audit event and localized in-app notification. A restricted profile
is locked against its own edits, cannot appear in public projection and cannot
be selected for a lawyer request. Restore produces a new reviewable profile;
it does not reinstate public availability.

This is an expand-only protected-staging release. Production D1, Worker,
Access configuration and public `juro.uz` remain unchanged. The protected
staff-UI smoke and an authenticated bilateral handoff remain release gates.
