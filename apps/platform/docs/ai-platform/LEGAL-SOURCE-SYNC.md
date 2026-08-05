# Legal source synchronization

> Staging alert checkpoint — 2026-08-05: migration `0089` adds content-free,
> immutable-identity operational alert jobs for every unalerted failed corpus
> run and for a Lex/Advice corpus that has never succeeded or is older than
> seven days. The five-minute fenced scheduler evaluates a bounded backlog,
> writes one idempotent email outbox row per failure/freshness epoch, and reuses
> the server-side Resend operations channel. No legal text, URL, user, workspace
> or recipient is persisted in the alert table. Schema and Worker are deployed
> from exact commit `1aadfc6`; a controlled alert-delivery rehearsal and
> received test email remain pending. Production is unchanged.

> Local fail-closed candidate — 2026-08-05: migration `0091` requires a corpus
> success to match every fetched item to its current activated, staff-published
> verified version. New or changed pending-review content becomes `partial` and
> cannot update legal-database freshness. The migration is tested locally but
> is not applied to staging or production.

> Local candidate — 2026-08-05: the nightly scheduler can discover at most 40
> recent canonical Lex documents from the official RU and UZ RSS feeds. It
> reads `robots.txt` first, honors the declared 20-second `Crawl-delay` through
> the Cloudflare scheduler wait API, bounds each response to 512 KiB, rejects
> redirects/non-RSS/malformed XML and claims the daily D1 run before any remote
> request. Discovered URLs enter the existing private-R2, `pending_review`,
> human-publication boundary; discovery never verifies or exposes a source to
> AI. The staging configuration enables this flag, while development and
> production keep it off. The code is deployed from commit `1aadfc6`, but no
> controlled live discovery/Queue/reviewer cycle is claimed by that fact alone.

Status: bounded Lex and Advice acquisition/normalization slices are implemented and proven in owner-only staging. Publication, retrieval, and AI use remain fail-closed pending explicit legal review. Advice and the staff source API are enabled only in staging; development and production remain disabled.

## Allowed sources

The acquisition classifier accepts only exact canonical HTTPS document routes:

- Lex: `https://lex.uz/{ru|uz}/docs/{numericId}`;
- Advice Russian: `https://advice.uz/ru/documents/{positiveNumericId}`;
- Advice Uzbek Latin: `https://advice.uz/oz/documents/{positiveNumericId}`.

`www` is canonicalized away. The canonical ID must equal the final URL suffix. Stale Advice `/questions` routes, Cyrillic `/uz/documents`, queries, fragments, credentials, nonstandard ports, unrelated paths, private addresses, cross-source redirects, and changed-document redirects are rejected. The D1 insert guard independently enforces the same current URL/locale/ID relationship.

## Acquisition policy

Each request is an idempotent legal_source_fetch_requests row plus an identifiers-only legal.sync outbox envelope. The five-minute scheduled dispatcher is locked and fenced. The legal-source Queue consumer runs with maximum concurrency one and a dedicated dead-letter queue.

Before retrieving a document the worker:

1. fetches the source host robots.txt with a bounded text/plain-compatible Accept header;
2. parses user-agent, Allow, Disallow, and Crawl-delay rules;
3. fails closed on unavailable, invalid, disallowed, or excessive-delay policy;
4. atomically reserves a D1 host crawl window for a supported Crawl-delay; a busy
   window becomes a retryable queue result rather than a Worker timer;
5. follows only bounded same-source HTTPS redirects;
6. validates content type, content encoding, byte limit, and canonical identity;
7. hashes the exact bytes and persists the raw object to private R2 under a content-addressed key.

Current supported Crawl-delay maximum is 60 seconds. Lex currently declares 20 seconds. Advice currently permits the selected public document routes without a positive Crawl-delay; JURO still applies a minimum one-second host window before every Advice document request. The window key is scoped to environment and host, so a serial queue batch cannot bypass the policy and a Worker never waits/sleeps for it. A separate default-off Advice sitemap discovery capability may submit at most 20 canonical document URLs from the public robots-declared sitemap. The Lex discovery candidate reads only the exact official `https://lex.uz/ru/rss` and `https://lex.uz/uz/rss` feeds, balances RU/UZ results, and submits at most 40 exact canonical document URLs. Neither discovery path fetches arbitrary links; every candidate returns through this exact acquisition boundary.

## Normalization

`legal.sync` creates a `pending_review` version and a low-confidence human review item, then enqueues `legal.parse`. The parser uses parse5, excludes hidden/site chrome, recognizes ordinary semantic HTML, activates a Lex-specific block adapter only when official `lx_elem` blocks are present, and requires the exact `.page-document-content` container for Advice. It never falls back to the whole Advice body. `ACT_TITLE` is the authoritative Lex document title. Wrapper elements are not emitted as duplicate blocks.

The normalized JSON is schema-validated, content-addressed, and written to private R2. D1 stores only its object key and hash evidence. A parser error creates safe failure/review evidence and never creates a false success.

## Publication boundary

Acquisition and parsing never make a source legally verified. A version remains pending_review until a protected legal reviewer examines immutable raw and normalized evidence and records an explicit decision. Only the publication service may create reading sections/chunks and activate current evidence. Automatic publication and automatic Vectorize indexing are absent.

AI routes filter for exact verified source state, verified timestamp, and content hash. Fetched or pending-review sources are not eligible.

## Staging proof

`STAGING-0036-EVIDENCE.md` records the live Lex slice. `STAGING-0038-ADVICE-EVIDENCE.md` records migration `0038`, the current Worker/config, RU and Uzbek-Latin Advice probes, private R2 hashes, idempotency, integrity, review-only boundary, and unchanged production identity.

## Next legal-knowledge slices

- authenticated reviewer browser QA with an owner-approved reviewer identity;
- approved publication to immutable sections/chunks;
- multilingual RU/UZ source version model;
- broad historical/priority-area Lex corpus backfill beyond the recent RSS window;
- explicit policy/load approval and a controlled live staging run before enabling the implemented bounded Advice sitemap discovery flag;
- lexical plus semantic retrieval with tenant-independent public-source filters;
- server-side citation existence/status/effective-date verification;
- staging midnight Asia/Tashkent synchronization is deployed and recorded in `STAGING-0053-SCHEDULED-CORPUS-SYNC-EVIDENCE.md`; source-health alerts remain pending;
- reproducible 250-scenario RU/UZ legal evaluation with human-reviewed ground truth.

None of these remaining items is represented as working until its own staging evidence passes.
## Historical retrieval contract

An explicit `legalContextDate` switches retrieval from the current activation to
verified or archived publications whose reviewed version interval contains that
date. Semantic retrieval is intentionally disabled for this path because the
current Vectorize indexes contain only current activations. Every selected
historical row is reloaded from D1 and revalidated against publication,
lifecycle, section and chunk hashes before it can enter an AI prompt.

Dates are not inferred from fetched HTML. Missing `effective_at` metadata causes
the source to be excluded, so the AI must clarify rather than invent historical
applicability.
