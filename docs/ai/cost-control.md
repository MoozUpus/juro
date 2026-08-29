# AI cost control

## Pricing contract

JURO records append-only provider usage and resolves cost through effective-dated
price versions. A usage row without a matching version remains explicitly
`unpriced`; zero stored cost must never be interpreted as free usage.

The production price versions for the current standard, short-context routes are:

| Provider/model/operation | Input per 1M | Cached input per 1M | Output per 1M | Official source |
| --- | ---: | ---: | ---: | --- |
| OpenAI `gpt-5.6-sol` / Responses | $5.00 | $0.50 | $30.00 | [OpenAI API pricing](https://platform.openai.com/pricing) |
| OpenAI `gpt-5.6-terra` / Responses | $2.50 | $0.25 | $15.00 | [OpenAI API pricing](https://platform.openai.com/pricing) |
| OpenAI `text-embedding-3-large` / embeddings | $0.13 | — | — | [OpenAI model pricing](https://developers.openai.com/api/docs/models/text-embedding-3-large) |
| Anthropic `claude-sonnet-4-6` / Messages | $3.00 | $0.30 cache hit | $15.00 | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) |

These values apply to the routes JURO currently invokes: standard OpenAI
Responses without a selected Batch/Flex/Priority tier and global Anthropic
inference without `inference_geo=us`. A route change requires a new price
version, not mutation of history.

## Deterministic conversation compaction

Candidate `c7c6d35e` stops resending every retained branch turn verbatim on
each authenticated legal-chat request. From the already bounded 12-turn query,
JURO keeps the latest three turns as recent context, converts up to five older
turns into redacted deterministic summaries, and explicitly counts any
remaining turns as omitted. Stored structured summaries are schema-validated;
malformed legacy results fall back to bounded, redacted visible text. The
summary is untrusted conversational context and never replaces the current
verified Lex source packet.

No additional model call, migration, prompt-content telemetry or request-global
mutable state is introduced. The content-free completion/failure metrics record
turn counts plus legacy/current serialized character counts and their reduction.
On the synthetic 12-turn long-history fixture, provider-bound characters fell
from 15,931 to 6,155 (61.36%). This is a character-volume proxy, not provider
tokens, billing, answer quality or a production cost result. Real token/cost and
quality benefit, including the overall 30% target, remains `UNVERIFIED` until a
controlled comparable sample exists.

## Privacy-bounded Anthropic prompt cache

Candidate `d1da89a1` marks only the code-owned Anthropic system-instruction
block with an explicit five-minute `ephemeral` cache breakpoint. The current
question, conversation history, memory, retrieved sources and document payload
remain in the separate user message and are not marked for caching. OpenAI
continues to use its provider-reported automatic cached-input accounting.

Anthropic reports uncached input, cache reads and cache writes as disjoint
counters. JURO normalizes their sum as total input, retains cache reads and
cache writes separately, and prices a five-minute cache write at 1.25 times
the effective ordinary Anthropic input rate under the
[official prompt-caching contract](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
Integer quarter-rate arithmetic keeps per-request micro-USD rounding
deterministic. Migration
`0163_anthropic_prompt_cache_accounting.sql` adds only non-negative token-count
columns to immutable usage events and daily aggregates; it stores no cached
text or user content. The Admin console exposes cache-write token count beside
the existing hit/share signals.

This is an unpublished optimization candidate. A marked prefix below the
provider's model-specific minimum can legitimately produce zero cache reads
and writes, so real cost/latency improvement remains unverified until a
comparable post-release sample exists.

## Observed baseline

The last-30-day production usage snapshot taken on 2026-08-25 contained 58
requests across chat/document providers plus two embedding requests. Historical
rows were unpriced. Applying the table above only as a shadow estimate to their
recorded successful-token counts gives approximately **$0.84** total:

- Anthropic Sonnet: $0.0417;
- OpenAI `gpt-5.6-sol`: $0.3749;
- OpenAI `gpt-5.6-terra`: $0.4192;
- embeddings: $0.0005.

This is a reconstructed cost baseline, not a provider invoice. Failed requests
with zero recorded tokens contribute no estimated token cost, which may understate
billed work if a provider charged tokens before failure.

## Measurement readiness

The protected Admin cost console evaluates the rolling window that begins no
earlier than the first effective price version. It reports successful and failed
requests, price coverage, estimated cost per priced success and progress toward
a minimum sample of 30 priced successful calls. The state is fail-honest:

- `no_data` when the measurement window has no calls;
- `incomplete_pricing` when any successful call has no effective price;
- `insufficient_sample` until 30 fully priced successes exist;
- `ready` only after the sample threshold is met with no unpriced success.

`ready` means only that a cost sample can be compared. It does not prove the
target 30% reduction or preservation of answer quality; that decision still
requires matched routing/quality evidence under the model-evaluation scorecard.

The production snapshot on 2026-08-28 after the current prices became effective
contained four priced successes, two zero-token failures, zero unpriced
successes and `$0.104549` estimated cost. Coverage was 100%, but the sample was
only 4/30, so the reduction target remains `UNVERIFIED`.

## Control-center metric contract

Candidate `a08698df` extends the protected Admin cost console from provider/day/
feature totals to the following content-free views over the same bounded window:

- cost by technical user and workspace identifiers, without email, phone,
  prompt, answer, document text or filename;
- cost by subscription plan, with guest/system and unassigned scopes kept
  explicit;
- provider failure count/rate and average recorded provider-call latency;
- request cache-hit rate: successful calls with positive input tokens and
  positive cached-input tokens / successful calls with positive input tokens;
- cached-input token share: cached input tokens / all successful input tokens;
- Deep escalation count/rate among completed authenticated legal-chat runs;
- provider-fallback count/rate among those same completed authenticated runs.

Plan attribution is deliberately labelled as the **current workspace plan at
read time**. The usage ledger does not store an immutable historical plan
version on each provider event, so the console must not imply that an older
call occurred under the workspace's current plan. Guest AI and document
analysis are excluded from the authenticated legal-chat escalation denominator.
These metric definitions are implemented and locally tested in the candidate;
they are not production observations until an explicitly approved release.

## Controls and alerts

- Preserve per-request token dimensions, provider/model/operation, result, and
  pricing status without prompt or document content.
- Block release if the current route has no effective price version.
- Alert on unpriced requests, daily/provider budget approach, failure spikes,
  fallback spikes, or cost-per-success regression.
- Route ordinary questions through the balanced default on the less expensive
  chat model; reserve deep reasoning and its larger token allowance for an
  explicit user choice. Fast remains the compact lowest-budget option.
- Treat caching as a measured optimization, never as an assumed discount.
- Review official pricing before each production release and create a new
  effective-dated version when it changes.

Production currently has no effective provider cost-guard policy. The Admin
console must show this as **not configured**, never as a closed/healthy automatic
circuit. An operator must approve the daily provider budget and rolling failure
threshold before creating an immutable production policy; no arbitrary threshold
is inferred from historical spend.

## Scoped daily and monthly budgets

Candidate `f312a930e9e93a690a71ad963ea0ff59ab1a4ab6` adds immutable,
effective-dated budgets for either a technical user or an allowlisted AI
feature. Each operator-entered policy uses integer micro-USD daily/monthly
limits and one explicit action: alert only, disable optional Deep calls, or
block calls in the scope. UTC calendar days and months define the periods.

The integrated features are authenticated legal chat, guest chat, document
analysis, and private-document indexing/search. The internal legal-corpus
ingestion path is intentionally unchanged. Policy checks occur immediately
before provider-bearing work and scoped budget errors do not trigger a paid
fallback.

Crossing a configured limit creates immutable daily/monthly evidence, an
idempotent identifiers-only alert job and an opaque email outbox row. Successful
usage without an effective price creates a separate warning with no invented
cost; it is not treated as proof of limit exhaustion. Technical user IDs may be
shown only inside the protected operations console, shortened where practical.
No prompt, answer, document text, filename, email, phone or recipient address is
stored in scoped budget tables.

This is a D1 request-boundary guard, not a provider billing hard cap. Concurrent
in-flight requests can overshoot a threshold, and provider billing still needs
reconciliation. Migration `0162_scoped_ai_cost_budgets.sql` is not deployed and
remains excluded from production migration configuration. Production still has
no operator-entered scoped policy, and the 30% cost-reduction target remains
`UNVERIFIED`.
