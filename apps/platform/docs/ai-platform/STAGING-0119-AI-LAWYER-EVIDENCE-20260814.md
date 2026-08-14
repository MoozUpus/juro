# AI Lawyer reliability and source-grounding staging evidence

Date: 2026-08-14 (Asia/Tashkent)

Scope: `apps/platform` staging only. Production was not deployed or migrated.

## Staging release identity

- Exact-candidate Worker version: `e201be50-1c16-42aa-8031-3a379c6b7c06`
- Deployment created: `2026-08-13T21:41:19.571047Z`
- Staging D1 database: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`)
- Applied migration: `0119_ai_provider_operational_flags.sql`
- Post-apply migration check: no migrations to apply

## Database recovery evidence

- Pre-migration Time Travel bookmark: `000011c3-00000000-000050c6-38bdcf04a4ee2c2cc652fe407715d5b8`
- Pre-migration export: `.tmp/staging-d1-backups/pre-0119-20260813T181935Z.sql`
- Pre-migration export SHA-256: `5879b38632b758a0858f5a6e118c25133646888312819f9a776822a3fe1eff76`
- Pre-migration isolated restore: 230 tables, 511 indexes, 307 triggers, 119 migrations, `quick_check=ok`, 0 foreign-key violations
- Post-migration export: `.tmp/staging-d1-backups/post-0119-20260813T194404Z.sql`
- Post-migration export SHA-256: `46eb5a7fba42212c087cd779ee9c98ef8cdad2407218b058408b853ee0eeea19`
- Post-migration isolated restore: 230 tables, 511 indexes, 307 triggers, 120 migrations, `quick_check=ok`, 0 foreign-key violations

## huquq-ai adoption boundary

The compatible mechanisms were reviewed from upstream commit `1bce500c69b8213373d8ce0b40d56be7d83f6aec` by Toxir Erkinov under the MIT license. The adoption record and attribution are in `docs/huquq-ai-adoption.md`.

Adopted concepts include query planning and rewriting, direct-act hints, bounded retrieval salvage, legal-span ranking and chunking, compact source cards, and claim-to-span grounding guards. Qdrant, embeddings, a local legal corpus, Python/FastAPI/Docker infrastructure, Gemini, and the upstream product/auth/billing surfaces were not adopted.

## Reliability and source-grounding behavior

- Direct live retrieval is limited to canonical `lex.uz` sources; Advice.uz network retrieval and ingestion are disabled.
- The provider-neutral gateway uses OpenAI as primary, permits one safe OpenAI retry, and then permits Anthropic fallback while keeping one retrieval packet and idempotency identity.
- Attempts and cost telemetry remain separate by provider attempt.
- Raw provider deltas and unvalidated excerpts are not exposed. A preliminary
  answer becomes visible only after a complete candidate finding passes the
  same question-relevance, exact Lex span, source-quality and hash gates used
  by the final response.
- Visible legal claims are rebuilt from validated claim-to-span mappings and
  server-controlled citation cards. The final result remains the only durable,
  chargeable response.

## Automated verification

- Focused planner, direct-retrieval and gateway regression suite: 46/46 passed.
- `npm run type-check` and `npm run lint`: passed after the final UZ fix.
- Full `npm test`: passed; Cloudflare suite 182/182.
- Separate `npm run test:cloudflare`: 182/182 passed.
- `npm run evaluate:legal:materialize`: 314 scenarios, RU 157, UZ 157, 50 ambiguous, 12 legal areas.
- Scenario SHA-256: `e10b6b80d62326d8d43d4cc3d5e6cf3f0d2a31c06a26f1fe339e468bf7be9239`
- Instruction SHA-256: `75bea1b54e60b5a0594439425288deac93c25a002ef69645b47159bbf15a995c`
- Final staging build and `validate:artifact:staging`: passed.
- Artifact budgets: CSS 507.7/550 KiB, initial JS 293.4/320 KiB, largest lazy chunk 208.1/240 KiB, fonts 454.7/512 KiB, images 564.4/640 KiB, Worker 5641.8/6144 KiB.

The human-review release gate remains fail-closed. `npm run evaluate:legal:validate` correctly rejected validation because no external `--packet`, reviewed `--results`, and staging-persisted `--evidence` artifacts exist. No review result was fabricated.

## Task change manifest

The worktree contained unrelated uncommitted changes before this objective. They were preserved. The following paths were created or touched for this AI-lawyer/source-policy work; a listed path can therefore still contain pre-existing user changes outside this objective.

Application and operations:

- `app/_platform/AiLawyerClient.tsx`
- `app/_staff/DirectLegalSourceHealthPanel.tsx`
- `app/_staff/FeatureFlagConsole.tsx`
- `app/_staff/LegalSourceHealthPanel.tsx`
- `app/_staff/LegalSourceReviewInbox.tsx`
- `app/api/platform/ai/route.ts`
- `lib/operations/alert-email.ts`
- `lib/operations/operational-feature-flags.ts`
- `lib/platform/case-create.ts`

Gateway, provider and official-source runtime:

- `lib/ai/anthropic-provider.ts`
- `lib/ai/legal-agent-tools.ts`
- `lib/ai/legal-ai-gateway.ts`
- `lib/ai/legal-chat-schema.ts`
- `lib/ai/legal-query-planner.ts`
- `lib/ai/provider.ts`
- `lib/ai/runtime-settings.ts`
- `lib/document-builder/ai/openai.ts`
- `lib/legal/crawl-window.ts`
- `lib/legal/direct-citation-store.ts`
- `lib/legal/direct-retrieval.ts`
- `lib/legal/live-lex-retrieval.ts`
- `lib/legal/openai-lex-discovery.ts`
- `lib/legal/source-acquisition.ts`
- `lib/legal/source-discovery.ts`
- `lib/legal/source-fetch.ts`
- `lib/legal/source-health.ts`
- `lib/legal/source-parser.ts`
- `lib/legal/source-review.ts`
- `lib/legal/source-trust.ts`

Evaluation, configuration and documentation:

- `docs/ai-platform/AI-RELIABILITY-SLO.md`
- `docs/ai-platform/AI-SAFETY.md`
- `docs/ai-platform/LEGAL-EVALUATION.md`
- `docs/ai-platform/STAGING-0119-AI-LAWYER-EVIDENCE-20260814.md`
- `docs/huquq-ai-adoption.md`
- `drizzle/0119_ai_provider_operational_flags.sql`
- `drizzle/meta/_journal.json`
- `evaluation/legal-chat-release-gate.ts`
- `evaluation/legal-evaluation-contract.ts`
- `evaluation/legal-evaluation-corpus.ts`
- `scripts/platform-tasks.mjs`
- `scripts/validate-legal-evaluation.ts`

Tests:

- `tests/ai-chat-slo-contract.test.ts`
- `tests/direct-legal-retrieval.test.ts`
- `tests/direct-source-health.test.ts`
- `tests/document-analysis-route-boundary.test.ts`
- `tests/legal-agent-tools.test.ts`
- `tests/legal-ai-gateway.test.ts`
- `tests/legal-chat-release-gate.test.ts`
- `tests/legal-evaluation-corpus.test.ts`
- `tests/legal-query-planner.test.ts`
- `tests/legal-source-acquisition.test.ts`
- `tests/legal-source-discovery.test.ts`
- `tests/legal-source-fetch.test.ts`
- `tests/legal-source-health.test.ts`
- `tests/legal-source-normalization.test.ts`
- `tests/legal-source-parser.test.ts`
- `tests/legal-source-review.test.ts`
- `tests/legal-source-trust.test.ts`
- `tests/live-lex-runtime-boundary.test.ts`
- `tests/openai-lex-discovery-boundary.test.ts`

## Authenticated browser QA

Authenticated exact-candidate checks passed at 1280x800 and 390x844 with no
horizontal clipping. The mobile composer, source card and single bottom
navigation path remained available. `Qisqa`/`Batafsil` were operated with
Enter and restored without a pointer; the send button exposes `Yuborish` and
the composer exposes `Nima bo‘ldi? Enter — yuborish`.

Observed answer/source behavior:

- RU and UZ LLC-opening questions resolved to Article 11 of the exact live
  Lex.uz RU/UZ acts.
- UZ participant rights and duties resolved to `9-modda` and `10-modda`, not
  the nearby share-transfer article.
- UZ charter approval resolved to `11-modda`; both `nimalar ko‘rsatilishi
  kerak` and the natural variant `nimalar bo‘lishi kerak` resolved to
  `14-modda`, never the fragmented `4-modda`.
- The standalone UZ wording `Jamiyat ustavi uchinchi shaxslar uchun qachon
  kuchga kiradi?` resolved to the general rule in `14-modda`, not the narrower
  capital-increase rule in `19-modda`.
- The same-conversation UZ follow-up `Qanday hujjatlar kerak?` retained the LLC
  context and resolved to `12-modda. Jamiyatning taʼsis hujjatlari` in 3947 ms
  to preliminary and 7779 ms to complete response.
- Every visible legal source card in this QA used Lex.uz. No Advice.uz or
  model-authored URL was shown.

## Exact-candidate latency evidence

The content-free D1 window contains the 20 consecutive authenticated
`legal_chat` requests made after the exact-candidate deployment, from
`2026-08-13T21:42:17.947Z` through `2026-08-13T21:45:56.533Z`. All 20 completed
through OpenAI and all 20 completed within 30 seconds.

- Nearest-rank p50 first useful: **2287 ms**
- Nearest-rank p95 first useful: **3649 ms**, passing the 5000 ms target
- Nearest-rank p50 complete useful: **3915 ms**
- Nearest-rank p95 complete useful: **6632 ms**, passing the 30000 ms target
- Individual first-useful pass count: 19/20; the single 7379 ms tail sample is
  outside the individual threshold but does not move nearest-rank p95 above it
- Complete-response pass count: 20/20; maximum 10090 ms

The first-useful measurement is the server-owned grounded preliminary, not a
header, research progress event, raw provider token or unvalidated excerpt.
Browser polling was retained as UI evidence but was not substituted for the
server SLO ledger.

## Production status

Production was not deployed, migrated, or approved. The remaining production prerequisites are:

1. Complete and approve the external human review for the materialized 314-case packet and attach staging-persisted evidence.
2. Re-run all exact-candidate gates if code, configuration, model selection or bindings change.
3. Obtain explicit production approval. No production deployment is authorized by this evidence.
