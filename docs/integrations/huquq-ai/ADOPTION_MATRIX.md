# Huquq AI adoption matrix

Audit target: `toxirerkinov70-commits/huquq-ai@1bce500c69b8213373d8ce0b40d56be7d83f6aec`.
Every reviewed component has an explicit decision. `REJECT` means the capability is
deliberately not adopted, not that it was unreviewed.

| # | Huquq AI component | Source path | Purpose | JURO equivalent / target | Decision | License | Risk | Test / control |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | FastAPI app and middleware | `backend/app/main.py`, `middleware.py` | HTTP runtime, CORS, limits | Next.js + Cloudflare Worker | REJECT | MIT | Replacing auth/runtime | Existing Worker boundary tests |
| 2 | SQLite models and sessions | `db/sqlite.py`, `models.py` | auth, history, plans | JURO D1 and tenant-owned models | REJECT | MIT | Cross-tenant/IDOR | Existing authorization tests |
| 3 | Phone/Google auth, OTP | `routers/auth.py`, `services/auth.py`, `otp.py`, `google.py` | authentication | JURO session/auth implementation | REJECT | MIT | Credential/session regression | Auth boundary tests |
| 4 | Billing/orders/plans/usage | `routers/orders.py`, `services/plans.py`, `usage.py` | demo commerce | JURO billing foundation | REJECT | MIT | Unauthorised payment change | No source code copied |
| 5 | Intent classifier | `services/intent.py` | inexpensive intent route | `lib/ai/legal-query-planner.ts` | ADAPT | MIT | Misroute | `legal-query-planner.test.ts` |
| 6 | Follow-up and article parsing | `services/query.py` | query context, exact article | planner + `legal-language.ts` | REIMPLEMENT | MIT concepts | RU/UZ false match | `legal-language.test.ts` |
| 7 | Document aliases | `services/aliases.py` | code/name detection | planner aliases + language normalizer | REIMPLEMENT | MIT concepts | Incorrect act | Unit tests |
| 8 | Coverage detection | `services/coverage.py` | good/partial/weak/no coverage | `legal-ai-gateway.ts` validation | ADAPT | MIT | Nearby norm as answer | Gateway tests |
| 9 | Dense embedding search | `services/embedding.py` | semantic candidates | Vectorize + OpenAI embeddings | ADAPT | MIT concepts | stale/unverified text | semantic retrieval tests |
| 10 | BM25 sparse search | `services/sparse.py` | lexical relevance | `hybrid-ranking.ts` BM25 rerank | REIMPLEMENT | MIT concepts | ranking drift | hybrid-ranking tests |
| 11 | Hybrid search and RRF | `services/retrieval.py` | fuse dense/sparse hits | `hybrid-ranking.ts`, verified retrieval | REIMPLEMENT | MIT concepts | duplicates/order | RRF unit tests |
| 12 | LLM reranker | `services/rerank.py` | final relevance ranking | deterministic BM25 now; provider reranker needs evaluation | REJECT | MIT | cost/ungrounded rerank | Feature-gated limitation |
| 13 | Grounded generation | `services/generate.py` | context-only legal answer | `legal-ai-gateway.ts` + providers | ADAPT | MIT concepts | fabricated citations | Gateway tests |
| 14 | Gemini LLM client | `services/llm.py` | generation/tools | OpenAI primary, Anthropic fallback | REJECT | MIT | provider policy conflict | Provider-routing tests |
| 15 | Tool calling | `services/tools.py`, `agentic.py` | legal search/live tools | `legal-agent-tools.ts` | ADAPT | MIT concepts | SSRF/unbounded calls | Tool boundary tests |
| 16 | Agent modes | `services/agents.py` | legal-domain presets | JURO AI lawyer modes | ADAPT | MIT concepts | non-working UI mode | UI/route tests |
| 17 | Attachments | `services/attachments.py` | file analysis | JURO private R2/quarantine pipeline | ADAPT | MIT concepts | malware/tenant leak | Document-analysis tests |
| 18 | Drafting | `services/drafting.py` | blanks, legal grounds | JURO Document Builder integration | ADAPT | MIT concepts | invented facts | Suggested-document tests |
| 19 | Registry/chunk store | `services/corpus.py` | article data access | D1 reviewed sources/chunks | REIMPLEMENT | MIT concepts | corpus in Git | Source evidence tests |
| 20 | Lex discover/fetch/extract | `parser/lex/{discover,fetch,extract}.py` | official-source acquisition | JURO discovery/fetch/parser | ADAPT | MIT concepts | robots/SSRF/UI noise | Legal source tests |
| 21 | Article chunking | `parser/lex/chunk.py` | article-first chunks | JURO source sections/chunks | ADAPT | MIT concepts | lost context | Parser/index tests |
| 22 | Diff/watch/update | `parser/lex/{diff,watch}.py`, `run_update.py` | change detection | scheduled sync/metadata monitor | ADAPT | MIT concepts | mass bad update | Sync/lifecycle tests |
| 23 | Index and vocab tools | `scripts/index.py`, `build_vocab.py` | index maintenance | D1/Vectorize indexing | ADAPT | MIT concepts | stale index | Source-indexing tests |
| 24 | Backup/export/import | `scripts/{backup,export_corpus,import_corpus}.py` | snapshot/restore | JURO backup procedures | ADAPT | MIT concepts | unrehearsed restore | Operations docs + D1 verification |
| 25 | Scheduler | `backend/app/scheduler.py` | daily/weekly/monthly tasks | Cloudflare Cron + Queues | REIMPLEMENT | MIT concepts | duplicate crawl | Scheduled-sync tests |
| 26 | Chat/search/update routes | `routers/{chat,search,updates}.py` | API surface and SSE | JURO canonical API routes | REIMPLEMENT | MIT concepts | auth/routing break | Route tests |
| 27 | Vanilla frontend, CSS | `frontend/*` | chat/source UX | JURO React UI-kit | REIMPLEMENT | MIT concepts | brand/accessibility | Browser QA pending |
| 28 | Source screenshots/logo/mark | `docs/*.png`, `frontend/logo.svg` | upstream identity | JURO branding only | REJECT | assets/brand not assumed | IP confusion | Not copied |
| 29 | Legal texts/local corpus | source `data/` history | retrieval content | request-scoped Lex or reviewed JURO records | REJECT | external data rights | republishing source text | Source gates |
| 30 | Docker/Caddy/Compose | Docker/Compose/Caddy files | self-hosting | Cloudflare Workers/D1/R2 | REJECT | MIT | architecture replacement | Wrangler validation |
| 31 | Eval questions/runner | `eval/*` | regression discipline | JURO evaluation corpus | ADAPT | answers not copied | false ground truth | `LEGAL_REVIEW_REQUIRED` |
| 32 | Pytest/API tests | `tests/*` | legal regression patterns | TypeScript node tests | REIMPLEMENT | MIT concepts | shallow parity | Legal/security tests |
| 33 | README/legal docs | `README.md`, `docs/legal/*` | documentation | JURO integration docs | REIMPLEMENT | MIT concepts | unsupported claims | This documentation |

No Huquq AI runtime file is copied verbatim into JURO. The only literal upstream text
stored here is the MIT licence notice at `third_party/licenses/huquq-ai-MIT.txt`.
