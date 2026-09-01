# JURO Citation Policy

Status: **normative application contract**

## Rules

1. A Citation is the visible connection between a legal proposition and validated evidence, not merely a URL or bibliography entry.
2. A legal rule, deadline, calculation, obligation, prohibition, or mandatory action requires validated official support.
3. The server owns source identifiers, canonical URLs, versions/status, excerpts, and freshness state. Provider-authored identifiers cannot promote a source.
4. Every model-selected Citation must refer to an allowed server source ID and an exact non-empty supporting excerpt.
5. Unsupported findings, risks, deadlines, plan steps, and citations are removed or cause fail-closed normalization.
6. If official coverage is partial, JURO separates supported outcomes and missing facts. If coverage is insufficient, it returns an Insufficient-Evidence Result.
7. Secondary Web Research may add context but cannot establish Uzbekistan law.
8. User documents and user-supplied URLs are evidence inputs, not official law.
9. A Citation must expose enough source identity and context for the user to inspect it without implying that JURO provides an official translation.
10. Citation validation failures are content-free operational/quality events; provider bodies and user legal text must not enter logs.

## Presentation

- What the Law Says connects each substantive proposition to its Citation.
- Main Point cannot be stronger than the cited support.
- What to Do Next distinguishes legally required action from practical suggestion.
- stale, superseded, unavailable, or unverified sources cannot be presented as current authority.
- an empty citation list is not compatible with a substantive confirmed Legal Answer.

This policy follows the [strict Source Ladder ADR](../adr/0001-strict-legal-source-ladder.md) and [adaptive Legal Answer ADR](../adr/0002-adaptive-legal-answer-structure.md). Population or repair of the legislation database and corpus is outside the v100 scope.
