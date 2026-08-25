# Legal answer pipeline

```text
authenticated question
  -> policy, tenant and quota checks
  -> locale / mode selection
  -> server-side direct Lex.uz retrieval
  -> bounded verified source packet
  -> OpenAI primary generation
  -> eligible Anthropic fallback only when needed
  -> structured-output validation
  -> citation IDs filtered against the source packet
  -> exact quote/article/source reconstruction by JURO
  -> persisted answer and source cards
```

The provider never receives authority to create a source record. It can select
only IDs already present in the server-built packet. JURO discards unknown,
duplicate, malformed, stale, or referentially incomplete citations and rebuilds
the displayed metadata from verified server records. Legal claims that require
evidence cannot become confirmed when their citation boundary fails.

Private user documents are owner-scoped factual context, not official law. They
must never be relabelled as Lex.uz or used to establish a generally applicable
legal rule. Cross-tenant access fails before retrieval and again at persistence
and citation-read boundaries.

When sources are unavailable, the safe outcomes are clarification, a limited
non-authoritative answer, or abstention with lawyer-review guidance. The system
must not manufacture a statute, article, URL, quote, effective date, or legal
deadline to complete an answer.

Operational telemetry records only fixed event names and bounded enums. It does
not include the question, answer, document text, email, user ID, matter ID,
source URL, or free-form error content.
