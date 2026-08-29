# AI chat modernization

Status: implemented

## Scope

Modernize authenticated personal/business AI chat and guest AI chat. Voice mode and production retrieval activation are out of scope.

## Legal Answer contract

- Render substantive answers through product-owned localized sections: `Главное` / `Asosiysi`, `Что говорит закон` / `Qonunda nima deyilgan`, and `Что делать дальше` / `Keyingi qadamlar`.
- Conditionally render `Важно учесть`, `Сроки`, `Что подготовить`, and `Дополнительные материалы`; omit empty sections.
- Detailed mode expands every relevant section.
- User messages are compact bubbles; Legal Answers are document-like reading surfaces.
- Legal propositions carry descriptive inline Citation chips; exact excerpts remain in the evidence view.
- Markdown formats content inside sections but cannot define the section hierarchy.
- Unsupported conclusions use a dedicated Insufficient-Evidence Result that explains what was checked, what is missing, and asks focused questions.
- Conditional Answers present supported branches and only material clarification questions.
- Narrow follow-ups omit irrelevant sections instead of repeating the complete prior answer.

## Workspace interaction

- Use a chat-first desktop layout with remembered collapsible history, a dominant centered answer, and a contextual evidence rail that opens after a cited answer without moving focus.
- On narrow screens, expose facts and sources through a sticky control and accessible tabbed sheet; never auto-open it.
- Keep the composer clean by moving answer format, analysis depth, and event date into compact settings while making an active historical date conspicuous.
- Correct long-answer scrolling, textarea growth and IME submission, source-dialog focus ownership/restoration, live-region scope, Markdown typography, dark contrast, spacing, and 44px targets.

## Source Ladder

1. Search the Indexed Official Corpus first.
2. Stop when indexed Official Coverage is `good`; otherwise perform Live Official Search.
3. Stop when combined official coverage is `good` or `partial`; perform Secondary Web Research only for `weak` or absent coverage.
4. Secondary Web Research is supporting context only and cannot establish legal rules, deadlines, calculations, or mandatory actions.
5. Guest chat uses the same response contract and Source Ladder without private documents, memory, or persisted conversation history.

## Reranking and performance

- Use deterministic ranking for strong act/article identifier matches and the model reranker only for ambiguous or competing candidates.
- Establish per-tier latency/outcome telemetry before setting staging latency targets.
- Remove redundant work through early request deduplication where safe, exact/near-query deduplication, request-scoped caching, batched hydration, and cancellation propagation.
- Preserve bilingual retrieval relevance and leave production corpus/dense flags unchanged.

## Confirmed TDD seams

- Localized rendered Legal Answer and Insufficient-Evidence Result DOM behavior.
- Observable Source Ladder escalation and secondary-source authority boundary.
- Selective reranking behavior through the legal research interface.
- Guest/authenticated response and source-method parity.
- Responsive/accessibility DOM behavior for evidence access, controls, and dialogs.

## Acceptance

- RU/UZ golden-answer tests.
- Retrieval-order, escalation, and relevance regression tests.
- Responsive screenshot evidence and keyboard/dialog, contrast, target-size checks.
- Focused tests and type-checking during implementation.
- Lint, type-check, build-relevant validation, and the full test suite at completion.

## Validation record

- RU/UZ Legal Answer, safe Markdown, responsive interaction, Source Ladder, selective reranking, guest parity, and batched hydration regression tests pass.
- Platform lint and type-check pass without warnings; the development application build and rendered-artifact tests complete.
- The complete discovered platform test set passes: 1,297 tests. Rendered Worker/HTML validation passes: 32 tests.
- Desktop and narrow guest surfaces were captured in `guest-desktop.png` and `guest-narrow.png`; the local guest feature was disabled, so the captures validate shell layout, responsive fit, and dark-theme contrast rather than a generated result.
- Artifact JS, font, image, and Worker budgets pass. Aggregate client CSS is 559.3 KiB against the repository's 550.0 KiB limit; the fixed 498.8 KiB baseline leaves insufficient current-build headroom for the new Legal Answer styling. The guard was not relaxed.
