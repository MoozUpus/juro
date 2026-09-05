# JURO Citation Policy

Status: **server-enforced publication policy**

Evidence cutoff: **2026-09-02 UZT**

## Core rule

A model cannot publish a legal citation merely by producing a plausible act, article, quotation, URL, or source identifier. JURO publishes a legal claim only after the server maps it to an allowed source and a high-quality exact source span from the request evidence packet.

## Source tiers

| Tier | Permitted use | Prohibited use |
| --- | --- | --- |
| Authoritative official legislation | legal basis, action, deadline, risk, and current/historical legal proposition when the exact span supports it | unsupported inference beyond the span |
| Trusted private user document | facts literally contained in that document | presenting the document as legislation or proof of a legal rule |
| Secondary reference | contextual factual note with its limited status visible | law, normative deadline, calculation rule, mandatory action, legal risk, or predicted outcome |

Anything outside an allowed tier is not publishable.

## Claim-to-span gate

- The source must pass class, verification-state, URL, content-hash, and quality checks.
- The span must be marked high quality, contain a valid text hash, and exclude source-page UI noise.
- Claim terms must materially overlap the span; every numeric token in the claim must appear in the span.
- Candidate source IDs absent from the server packet are discarded.
- Unsupported actions, risks, deadlines, and legal bases are removed, not softened into an uncited assertion.
- Citation cards are reconstructed from trusted server metadata.

## Missing evidence

When no usable verified source covers the proposition, JURO must not answer from general model knowledge. It returns a bounded clarification/insufficient-source state and may ask only for missing facts, dates, documents, or party actions. A clarification question must not smuggle in an unverified statute, article, deadline, or consequence.

## Display requirements

- Keep the visible claim close to its source card.
- Show act title, article/paragraph when available, canonical URL, access/verification time, and integrity metadata supported by the server contract.
- Distinguish current from historical applicability.
- Do not expose internal source IDs, provider prompts, tool names, credentials, or storage structure.
- Render model text through the safe Markdown component and block unvalidated external links.

## Verification and limitations

Focused gateway, citation, retrieval-safety, user-document boundary, and provider-schema tests enforce this policy. The policy does not certify the completeness of any external or local legal corpus. Database/corpus/vector operations and staging-capacity remediation are outside the current goal by owner instruction.
