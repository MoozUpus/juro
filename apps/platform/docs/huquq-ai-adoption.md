# huquq-ai adoption audit

Audit date: 2026-08-13
Upstream: `toxirerkinov70-commits/huquq-ai`
Pinned commit: `1bce500c69b8213373d8ce0b40d56be7d83f6aec`
Commit author/date: Toxir Erkinov, 2026-08-02T19:31:32+05:00
License: MIT, Copyright (c) 2026 Toxir Erkinov

This is a clean TypeScript/Cloudflare adaptation. JURO does not vendor the upstream repository, runtime, data, generated corpus, frontend or infrastructure. The upstream MIT notice is preserved here and next to every adapted implementation group.

## Pre-adoption audit

| Check | Result | Scope and evidence |
| --- | --- | --- |
| Commit integrity | Pass | Audit clone was pinned to the full SHA above; no floating branch was used. |
| License | Pass | Root `LICENSE` is MIT and names Toxir Erkinov, 2026. |
| Secrets | Pass | Repository scan of tracked files found no private keys, provider tokens or committed dotenv secrets. Runtime/config examples were not copied. |
| Dependencies | Pass with limitation | All direct pins in `requirements.txt` were checked with `pip-audit --no-deps`; no known vulnerability was reported for a pinned direct dependency. Full transitive resolution did not finish within the audit window, so no upstream Python dependency is adopted into JURO. |
| Security design | Selective adoption only | Upstream arbitrary application/runtime, auth, billing, SQLite auth, Qdrant Docker deployment, Gemini, local corpus and crawler persistence are excluded. JURO retains its own auth, tenant isolation, idempotency, provider cost controls, SSRF/robots checks and Cloudflare runtime. |
| Code quality | Pass for selected concepts | Intent, rewrite, retrieval/rerank, grounding and test patterns are small and independently testable. They were reimplemented against strict schemas and fail-closed boundaries. |
| Data provenance | Excluded | No upstream corpus, JSONL, Markdown, screenshots or evaluation answers are copied. JURO evaluation cases contain only prompts and expected Lex metadata. |

## Adoption matrix

| huquq-ai component | JURO implementation | Status | Tests | Reason / adaptation |
| --- | --- | --- | --- | --- |
| Intent categories in `services/intent.py` | `lib/ai/legal-query-planner.ts` | Adopted | `tests/legal-query-planner.test.ts`, `tests/ai-chat-slo-contract.test.ts` | Deterministic conversation/legal/document/calculation/out-of-scope routing; uncertain input is legal; greetings skip provider, Lex and charging. |
| Follow-up rewrite | `rewriteLegalFollowUp()` | Adopted | `tests/legal-query-planner.test.ts` | Last six relevant user turns only; PINFL, passport, card, phone, email and long numeric identifiers are redacted. |
| Aliases and query preparation | `planLegalResearch()` | Adopted | `tests/legal-query-planner.test.ts` | RU/UZ, article, act, domain and document/plan detection; LLC/ООО/МЧЖ aliases; primary query plus at most two expansions. |
| Retrieval salvage and article detection in `services/retrieval.py` | `lib/legal/direct-retrieval.ts` | Adopted with replacement | `tests/direct-legal-retrieval.test.ts` | One bounded salvage query and base-act-first rerank. Local BM25/dense/RRF is replaced by direct Lex search/fetch/parse. |
| Article-level chunks in `parser/lex/chunk.py` | Request-scoped `LegalSourceSpan[]` | Adopted with replacement | `tests/direct-legal-retrieval.test.ts`, `tests/legal-ai-gateway.test.ts` | Spans are made in memory from one fetched page, capped, hashed and destroyed after the request. They are never indexed or persisted as text. |
| Parser structure | `lib/legal/source-parser.ts` | Adopted with replacement | `tests/legal-source-parser.test.ts` | Extracts title/revision/section/chapter/article/paragraph and removes Lex navigation, buttons, audio/link controls, scripts and duplicates. |
| `answer_is_grounded()` | `validateAnswerContract()` in `lib/ai/legal-ai-gateway.ts` | Adopted and strengthened | `tests/legal-ai-gateway.test.ts` | Every legal claim needs an exact high-quality Lex span ID; numeric claims must occur in that span. |
| `filter_cited_sources()` | Gateway used-source filtering | Adopted and strengthened | `tests/legal-ai-gateway.test.ts` | Sources not used by a surviving claim are removed; generated or non-Lex URLs are rejected. |
| Coverage checks | Claim-to-span coverage validation | Adopted and strengthened | `tests/legal-ai-gateway.test.ts` | Unsupported claims are deleted and a fully unsupported answer becomes an explicit clarification. |
| Agent tools | `lib/ai/legal-agent-tools.ts` | Adopted with JURO boundary | `tests/legal-agent-tools.test.ts` | Six typed tools; only canonical HTTPS Lex fetch; plan/template outputs require user confirmation and do not mutate. |
| Streaming progress and compact sources | Existing AI route plus `AiLawyerClient.tsx` | Adopted | `tests/ai-chat-slo-contract.test.ts` | Source-free progress events precede only a validated final answer; cards show metadata, never raw excerpts. |
| Hard questions and grounding tests | `evaluation/legal-evaluation-corpus.ts` | Adopted and expanded | `tests/legal-evaluation-corpus.test.ts`, `tests/legal-chat-release-gate.test.ts` | 314 unique RU/UZ cases cover domains, false citations/articles, injection, follow-up, UI noise, provider retry/failure and source unavailability. |
| Qdrant dense/sparse behaviour, RRF, embeddings | `lib/legal-corpus/{qdrant,qdrant-indexing,embeddings,retrieval}.ts` | Reimplemented, disabled | `tests/legal-corpus-{qdrant,qdrant-indexing,embeddings,retrieval}.test.ts` | Server-only TypeScript adapter; upstream Python/Docker is not copied. Every ID is D1-rehydrated; activation awaits benchmark/private infrastructure. |
| Local Lex corpus, Markdown/raw HTML history | None | Excluded | parser/retrieval boundary tests | Full legal text exists only in current request memory. |
| Gemini adapter | None | Excluded | provider routing tests | JURO policy permits only OpenAI primary/retry and Anthropic fallback. |
| FastAPI/Python, Docker, auth, billing, SQLite, frontend | None | Excluded | repository boundary and build | JURO keeps its existing Next.js/Cloudflare/auth/billing architecture. |
| Upstream corpus and eval answers | None | Excluded | evaluation schema validation | Provenance is not imported; JURO stores expected Lex URL/article metadata only. |

## JURO architecture after adoption

The existing direct-live path remains unchanged while all corpus flags are off.
The disabled indexed candidate path is `D1 BM25 + Qdrant dense/sparse → RRF → D1
version/scope rehydration → exact-span packet → grounded generation/citation validation`.

OpenAI Web Search is discovery-only after direct retrieval misses. It is restricted to `lex.uz` and `www.lex.uz`; every returned URL goes back through JURO's canonical URL, HTTPS, SSRF, redirects, robots, content-type, parser and quality gates. Advice.uz discovery and fetch are permanently disabled before network access even if an obsolete flag says otherwise.

## Adapted files

- `lib/ai/legal-query-planner.ts`
- `lib/ai/legal-ai-gateway.ts`
- `lib/ai/legal-agent-tools.ts`
- `lib/legal/direct-retrieval.ts`
- `lib/legal/live-lex-retrieval.ts`
- `lib/legal/source-parser.ts`
- `evaluation/legal-evaluation-corpus.ts`
- `evaluation/legal-chat-release-gate.ts`
- `app/api/platform/ai/route.ts`
- `app/_platform/AiLawyerClient.tsx`
- corresponding tests under `tests/`

No source file is a verbatim upstream copy. The behavioral concepts were rewritten for JURO's schemas, Cloudflare request limits, provider policy and legal-source restrictions.
