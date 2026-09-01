# JURO AI model evaluation

Status: **PARTIAL; harness verified, reviewed production quality not certified**

Evidence cutoff: **2026-09-01**

## Result

The repository contains deterministic RU/UZ legal-answer and document-analysis evaluation tooling, strict artifact schemas, source/citation gates, persisted review evidence, and regression tests. This proves the evaluation mechanism exists; it does not prove that the current production providers passed the complete human-reviewed matrix.

## Evidence map

| Evaluation area | Evidence | Status |
| --- | --- | --- |
| Legal scenario materialization and validation | `apps/platform/evaluation`, `scripts/materialize-legal-evaluation.ts`, `scripts/validate-legal-evaluation.ts` | VERIFIED in source/tests |
| Persisted legal review evidence | admin AI-quality evaluation endpoint and `LEGAL-EVALUATION.md` | VERIFIED in source; deployed review receipt separate |
| Document evaluation | `DOCUMENT-EVALUATION.md` and evaluation scripts | PARTIAL |
| Provider schema/fallback behavior | provider and legal-chat tests | VERIFIED in tests |
| RU/UZ human legal review | strict reviewer envelope exists | OPEN for current production candidate |
| Live citation reachability and correctness | direct Lex validators exist | OPEN as a complete current run |

## Acceptance boundary

A release-quality evaluation must bind each result to the exact prompt packet, provider, model, AI run, source packet, reviewer decision, language-quality score, timestamps, and immutable evidence digest. Synthetic fixtures can prove deterministic validation behavior but cannot prove a legal conclusion is correct.

Detailed source: [`apps/platform/docs/ai-platform/LEGAL-EVALUATION.md`](../../apps/platform/docs/ai-platform/LEGAL-EVALUATION.md).
