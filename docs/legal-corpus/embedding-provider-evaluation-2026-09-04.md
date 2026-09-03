# Embedding provider evaluation: OpenAI versus Gemini

Date: 2026-09-04

Status: research note; not an architecture decision or authorization to upload corpus text

## Recommendation

Do not select a provider from vendor benchmarks alone. Run a sealed JURO bake-off
now, before the first full-corpus dense build. The current custom staging index has
zero vectors and the failed Ticket 25 attempt incurred zero provider tokens, so
this is the lowest-cost point at which to compare providers.

The provisional production baseline should remain OpenAI
`text-embedding-3-large` at 1,536 dimensions until a challenger passes the same
quality, privacy, latency, Batch-lifecycle and Cloudflare Gateway gates. It is
the least disruptive and least expensive option, and JURO already proved its
online embedding path through the accepted staging design. This is an
operational preference, not evidence that OpenAI has better Uzbek retrieval.

The strongest quality challenger is Google `gemini-embedding-2` at 1,536
dimensions. Google publishes materially better and more current multilingual
evidence than OpenAI currently exposes, and explicitly supports Uzbek in its
multilingual embedding language family. If it wins JURO's locked legal
retrieval suite and its complete Batch path works through the authenticated
Cloudflare Gateway, its small absolute corpus-cost premium should not prevent a
switch. Do not start new work on `gemini-embedding-001`: Google has named
`gemini-embedding-2` as its replacement and gives `001` an earliest shutdown
date of 2028-05-14.

In short: **OpenAI is the safer implementation choice today; Gemini Embedding 2
is the more promising multilingual-quality choice on paper; only the JURO
bake-off can determine which is better for this project.**

## Decision matrix

| Criterion | OpenAI `text-embedding-3-large` | Gemini `gemini-embedding-2` | Consequence for JURO |
| --- | --- | --- | --- |
| Current official multilingual evidence | OpenAI calls it its most capable model for English and non-English tasks, but its current model page provides no language list or per-language/legal score | Google reports 69.9 MTEB Multilingual and support across more than 100 languages; Google's earlier `001` paper reports a direct comparison against OpenAI | Gemini has the stronger published signal, but not a JURO result |
| Uzbek | No explicit current official support list or Uzbek score found | Google's multilingual embedding list includes Uzbek; no Latin/Cyrillic or Uzbek legal score is published | Both Uzbek scripts and cross-script retrieval remain empirical unknowns |
| Russian and English | Covered only by the broad English/non-English claim | Both appear in Google's supported multilingual list; Russian appears in MIRACL, but Uzbek does not | Gemini's documentation is more explicit; JURO still needs language-stratified evaluation |
| Retrieval mode | One embedding API with no documented query/document task selector | Text retrieval uses different query and document instructions | Gemini requires a new, immutable query/document transform contract |
| Input limit | 8,192 tokens per input | 8,192 text tokens | Both exceed the accepted roughly 512-token chunk target |
| 1,536 dimensions | Explicit `dimensions` is supported | Explicit 128–3,072 dimensions; 1,536 is recommended | Both fit Vectorize without changing its 1,536-dimension ceiling |
| Normalization | JURO already performs finite Float32 validation and L2 normalization | Reduced-dimension Embedding 2 output is automatically normalized | Keep JURO normalization and verification for provider-independent determinism |
| Offline Batch price | Effective $0.065/M input tokens from $0.13/M standard and the documented 50% Batch discount | $0.10/M input tokens | OpenAI is 35% cheaper per token; tokenizer differences prevent an exact corpus comparison yet |
| Async capacity | 50,000 embedding inputs and 200 MB per Batch; queued-token limits range from 3M to 4B by account tier | 2 GB files, 100 concurrent jobs; published embedding queued-token limits are 0.5M/5M/10M for Tiers 1/2/3 | Gemini may require many more submission waves for a roughly 604M-token corpus |
| Model lifecycle | Current and not marked deprecated, but the model page exposes no separately dated embedding snapshot or shutdown commitment | GA; no shutdown announced for Embedding 2 | Neither removes the need for drift probes and immutable release identity |
| Existing JURO integration | Accepted model, key/Gateway design, prototype, serialization and tests already exist | Requires a new credential, provider adapter, transform, token accounting and full Gateway preflight | OpenAI has substantially lower implementation risk |

Sources: [OpenAI model](https://developers.openai.com/api/docs/models/text-embedding-3-large),
[OpenAI embeddings API](https://developers.openai.com/api/reference/ruby/resources/embeddings/methods/create),
[OpenAI Batch](https://developers.openai.com/api/docs/guides/batch),
[Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings),
[Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
[Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), and
[Vectorize limits](https://developers.cloudflare.com/vectorize/platform/limits/).

## Quality evidence and its limits

Google reports a 69.9 MTEB Multilingual mean for `gemini-embedding-2`, compared
with 68.4 for `gemini-embedding-001`. Its earlier Gemini Embedding report was
evaluated over a large multilingual benchmark spanning more than 100 tasks and
250+ languages. That Google-authored paper directly reports Gemini Embedding
`001` at 68.32 versus OpenAI `text-embedding-3-large` at 58.92 on the
multilingual task mean, and 67.71 versus 59.27 on its retrieval task-type mean.
The Gemini API also publishes a dimension study for `001`: its MTEB score was
68.17 at 1,536 dimensions versus 68.16 at 2,048 and 67.99 at 768. That is useful
evidence that 1,536 can retain aggregate quality, but Google does not publish an
equivalent 1,536-dimensional, per-Uzbek result for Embedding 2.
[Google DeepMind performance](https://deepmind.google/models/gemini/embedding/)
and [Gemini Embedding research](https://deepmind.google/research/publications/157741/).

The `001` paper is a head-to-head vendor evaluation, but these scores are still
not a head-to-head answer for JURO:

- They are vendor-authored aggregate benchmarks, not an independent legal
  retrieval acceptance test.
- MTEB combines languages, domains and task types. An aggregate mean can hide a
  failure in a low-resource language or one writing system.
- MIRACL has Russian but not Uzbek. It therefore cannot validate Uzbek Latin,
  Uzbek Cyrillic, or cross-script/transliteration behavior.
- Neither vendor publishes a result for Uzbek statutes, provision-level
  applicability, article citations, abbreviations, exact document identity, or
  JURO's sparse+dense RRF.
- OpenAI's current official model page provides a broad non-English capability
  claim but no comparable current benchmark breakdown. Absence of a published
  score is not evidence of weak quality; it means quality cannot be ranked from
  the current official documentation.

Google's supported-language list includes `uz`, `ru`, and `en`, but does not
separately promise Uzbek Latin and Uzbek Cyrillic quality. Treat “supported” as
API compatibility, not a retrieval-quality guarantee.
[Google multilingual embedding languages](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/google-models#language_support).

## Input, tokenization and transformation

JURO's accepted 512-target structural policy produced a maximum 712-token
structured OpenAI input in the Ticket 23 sample and a sample-extrapolated
603,779,160 OpenAI-token complete-corpus projection. That number uses the
current OpenAI-side tokenization contract. It is not a Gemini token count.

Both `text-embedding-3-large` and `gemini-embedding-2` allow 8,192 input tokens,
so the accepted chunks should have ample headroom. Nevertheless, a Gemini build
must count the final, post-dedup structured inputs with the selected Gemini
model and fail before upload on any over-limit input. Google's `countTokens`
method runs the named model's tokenizer; a rough characters-per-token estimate
is not safe for Uzbek capacity or billing.
[Gemini token counting](https://ai.google.dev/api/tokens).

Gemini also changes the semantic input contract. For Embedding 2, Google
strongly recommends asymmetric retrieval formatting:

- query: `task: search result | query: {content}`;
- document: `title: {title} | text: {content}`.

It offers distinct query instructions for question answering and fact checking.
JURO would need to select one development-only formulation policy, freeze it
before the locked suite, include it in embedding reuse and Search Release
identity, and apply it consistently at corpus and query time. Reusing OpenAI
document vectors or mixing Gemini query/document transformations is invalid.
[Gemini retrieval instructions](https://ai.google.dev/gemini-api/docs/embeddings#task-types).

## Dimensions, Vectorize and representation stability

Cloudflare Vectorize accepts at most 1,536 float32 dimensions and an index's
dimension count cannot change. Both candidates can produce exactly 1,536
dimensions, so either fits the accepted cosine index shape. Embeddings from
different providers or model generations do not share a vector space; a Search
Release must pin the provider, model, dimensions, normalization and transform,
and its document and query embeddings must match.
[Vectorize index contract](https://developers.cloudflare.com/vectorize/best-practices/create-indexes/).

Google automatically normalizes Embedding 2 vectors at truncated dimensions;
OpenAI's API reference does not make an equivalent normalization guarantee.
JURO should still retain its existing finite-value check, deterministic Float32
conversion, L2 normalization and norm/cosine validation for either provider.
That makes the stored artifact contract explicit rather than dependent on
provider behavior.

`gemini-embedding-2` is GA and currently has no announced shutdown.
`gemini-embedding-001` has a 2028-05-14 earliest shutdown and Embedding 2 is the
named replacement; their spaces are explicitly incompatible. OpenAI's current
page lists `text-embedding-3-large` as current and not deprecated, but does not
show a separately dated embedding snapshot or a minimum support date. For both
providers, store fixed multilingual probe inputs and vector hashes/statistics,
block builds and queries on unexpected drift, and require a new release plus
re-evaluation for any model change.
[Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations).

## Cost and throughput

The table below intentionally applies each published rate to the existing
603,779,160 **OpenAI-token projection only to show scale**. It is not a Gemini
quote; exact Gemini tokens must be measured after cross-temporal deduplication.

| Candidate | Batch input rate | Illustrative raw cost | With JURO's 25% authorization margin |
| --- | ---: | ---: | ---: |
| OpenAI `text-embedding-3-large` | $0.065/M | $39.25 | $49.06 |
| Gemini `gemini-embedding-2` | $0.10/M | $60.38 | $75.47 |

The maximum raw difference at this projection is only about $21.13. For a
high-stakes legal search system, a real recall or exactness gain is worth far
more than that. Conversely, paying more based only on an aggregate vendor score
would not be justified.

Throughput may matter more than unit price. OpenAI documents tier-dependent
queued-token limits of 3M, 20M, 100M, 500M and 4B for
`text-embedding-3-large`; JURO's actual account tier must be read at launch.
Google publishes only 0.5M, 5M and 10M embedding tokens enqueued at once across
Tiers 1–3. At 10M, a 604M-token corpus would need at least 61 completion waves
before tokenization and dedup corrections. Both target 24-hour turnaround, not
instant completion. No schedule should be promised until a quota and
representative-throughput preflight passes.

The existing OpenAI failure was `credit_balance_exhausted`, not proof of an API
or model throughput ceiling. A ChatGPT subscription does not fund either
provider's API account.

## Batch durability and privacy

OpenAI Batch is directly documented for `/v1/embeddings`: 50% lower cost,
24-hour turnaround, at most 50,000 embedding inputs and 200 MB per input JSONL,
with a separate queued-token pool. Expired batches expose completed results and
charge only completed requests. Batch files default to 30-day expiry. OpenAI
does not use API inputs for training by default, but `/v1/files` and
`/v1/batches` are not Zero Data Retention eligible and application state lasts
until deletion. JURO must therefore keep its existing explicit result
reconciliation and verified input/output/error File deletion.
[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)
and [OpenAI Files](https://developers.openai.com/api/reference/typescript/resources/files/methods/create).

Gemini paid-tier inputs are not used to improve Google's products. Google says
paid inputs and outputs may still be logged for abuse monitoring for a limited,
unspecified period unless the project receives ZDR treatment. Files are stored
for 48 hours, while successful Batch results are downloadable for six weeks by
default. Batch creation is not idempotent, so a repeated creation request
creates another job. A Gemini implementation would need deterministic job
submission fencing, exact per-row reconciliation, result deletion where the API
permits it, and evidence of actual artifact expiry/deletion.
[Gemini ZDR](https://ai.google.dev/gemini-api/docs/zdr),
[Gemini Files](https://ai.google.dev/gemini-api/docs/files), and
[Gemini Batch](https://ai.google.dev/gemini-api/docs/batch-api).

The Gemini documentation currently contains an inconsistency: the Batch guide
opens with a note saying the feature is only for `generateContent`, while the
Embeddings guide recommends Batch and current examples/reference material show
embedding Batch operations. This does not prove the feature is unusable, but it
raises the bar for a real preflight before corpus upload.

## Cloudflare operational compatibility

Cloudflare AI Gateway lists provider-native integrations for OpenAI, Google AI
Studio and Google Vertex AI. Its OpenAI documentation says to replace the
OpenAI base URL with the Gateway base URL; its Google AI Studio documentation
similarly exposes a provider-native base URL. Vectorize is provider-neutral once
JURO supplies valid 1,536-dimensional float32 vectors.
[Cloudflare providers](https://developers.cloudflare.com/ai-gateway/usage/providers/),
[OpenAI through AI Gateway](https://developers.cloudflare.com/ai-gateway/usage/providers/openai/),
and [Google AI Studio through AI Gateway](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/).

Cloudflare's public provider pages do not explicitly prove every Files/Batch
upload, create, poll, result-download and deletion path needed by either design.
That remains an unknown, not permission to bypass the Gateway. Each candidate
must pass Ticket 24's authenticated, cache-disabled and payload-logging-disabled
end-to-end preflight. Gemini additionally requires a new Google credential and
distinct staging/production secret setup; no existing OpenAI secret should be
repurposed.

## Required bake-off

Use the same frozen, non-final development corpus and judgments for both
providers, then run the locked release suite only after choosing all transforms.
The bake-off should:

1. Deduplicate structured document inputs first and sample the same hashes for
   every provider.
2. Stratify queries and relevant provisions by `uz-Latn`, `uz-Cyrl`, `ru`,
   `en`, same-language, cross-language, cross-script/transliteration, typo,
   citation/article, applicability and difficult hard-negative cases.
3. Compare dense-only recall/MRR and the actual sparse+dense RRF Candidate
   Packet. Do not use vendor benchmark scores as JURO observations.
4. Test Gemini's search, question-answering and fact-checking instructions only
   on the development set; freeze the winner before the locked suite.
5. Measure exact provider tokens, duplicate/reuse rate, Batch completion and
   partial-failure behavior, online query p50/p95/p99, Vectorize visibility,
   and exact cost.
6. Require the existing release gates: recall@5 at least 0.90, recall@10 at
   least 0.95, MRR at least 0.85, citation precision 1.00, article exactness at
   least 0.95, document exactness at least 0.97, and zero integrity,
   reconciliation or configuration errors.
7. Reject a provider if its complete Batch lifecycle cannot traverse the
   authenticated Cloudflare Gateway without corpus payload logging/caching, or
   if its available quota cannot meet the migration calendar honestly.

Select Gemini Embedding 2 only if its measured legal-retrieval benefit survives
RRF, meets every language/script stratum and operational gate, and justifies the
new integration. Otherwise retain OpenAI. Preserve the losing provider's
content-free results as evaluation evidence, but never mix vector spaces in one
release.

## Known facts, inferences and unresolved unknowns

**Sourced facts:** prices, input/dimension limits, Batch limits, supported
provider integrations, published aggregate benchmark scores, documented
language lists, task formatting, retention behavior and deprecation dates above.

**Inferences:** OpenAI is currently lower-risk because JURO already has its
contract and infrastructure; Gemini Embedding 2 is the stronger paper-quality
challenger; the roughly $21 raw projected corpus premium is secondary to legal
retrieval quality; Gemini's published queued-token limits could make migration
slower.

**Unknowns requiring measured evidence:** exact post-dedup Gemini tokens;
quality for Uzbek Latin and Cyrillic; cross-script/cross-language retrieval;
legal-domain precision and hard-negative behavior; the winning Gemini task
instruction; actual account quota and completion time; online query latency;
complete Cloudflare Gateway support for each provider's Batch/File lifecycle;
and approved privacy/data-residency posture for production legal text.
