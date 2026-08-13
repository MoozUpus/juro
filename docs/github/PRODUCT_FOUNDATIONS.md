# JURO product foundations

[← Back to the repository overview](../../README.md)

This note explains the product decisions that make JURO more than a legal-question interface. It is intentionally evidence-led: each statement below points to a repository surface or names a limit that the repository does not establish.

## The product contract

JURO is designed to keep a legal workflow connected from the initial question or document to an appropriate next step. In practice, that means four distinct boundaries:

1. **Start with legal context.** A question, uploaded document or case should remain the starting point of the workflow rather than becoming an isolated chat turn.
2. **Keep evidence inspectable.** The legal answer path is designed around query-scoped retrieval from public source pages and source cards. It does not claim an official Lex.uz or Advice.uz API.
3. **Continue protected work.** Documents, cases and generated files belong in the protected platform rather than the public site.
4. **Make human escalation explicit.** Lawyer hand-off is a partial workflow. It is not a promise of representation, a completed consultation or a substitute for checking conflicts and permissions.

<img src="engineering-commitments.svg" width="100%" alt="JURO product engineering contract from question and source evidence to protected work and partial human hand-off">

## What is enforced in repository surfaces

| Product principle | Repository evidence | Explicit boundary |
|---|---|---|
| A source card should be tied to the answer that produced it. | [`direct-citation-store.ts`](../../apps/platform/lib/legal/direct-citation-store.ts) stores direct citations with an AI run and source-access mode. | A public page is not automatically a verified conclusion. |
| Retrieval should preserve canonical source context. | [`direct-retrieval.ts`](../../apps/platform/lib/legal/direct-retrieval.ts) contains the direct-source retrieval and citation eligibility path. | This is query-scoped public-page retrieval, not an official provider API claim. |
| A legal analysis finding requires a reference. | [`document-analysis/schema.ts`](../../apps/platform/lib/document-analysis/schema.ts) rejects certain legal findings, risks and missing clauses without citations. | The document-review product surface remains **PARTIAL** until fresh authenticated end-to-end evidence is complete. |
| Saved work should be handled behind platform boundaries. | [`apps/platform`](../../apps/platform) holds the protected handlers, document storage runtime and Cloudflare bindings. | The repository makes no GDPR, ISO, SOC 2 or comparable certification claim. |
| Operational claims should be reproducible. | Root scripts and [CI](../../.github/workflows/ci.yml) run linting, type checks, tests, builds and artifact validation. | A green check is not itself a production or legal-quality guarantee. |

## Product posture: information, work and escalation

The public experience is the beginning of the product, not a claim that an AI response settles a legal matter. When source evidence supports a response, the user should be able to inspect the source path. When the evidence is limited, the product should say so. Where the workflow requires human help, the product may expose a controlled hand-off path.

This separation matters for partners, legal professionals and technical reviewers alike:

- **For users:** legal information, documents and next actions can stay connected.
- **For lawyers:** hand-off and document context are product workflows, not an automatic transfer of responsibility.
- **For teams:** the protected platform separates stored work from the public marketing surface.
- **For reviewers:** claims about live, working, partial and planned surfaces are maintained in the [status matrix](../../README.md#current-status).

## How to inspect the implementation

Start with the main [repository overview](../../README.md), then follow the implementation maps most relevant to your review:

| Review focus | Starting point |
|---|---|
| Product routes and surface ownership | [Route inventory](../ai-platform/ROUTE-INVENTORY.md) |
| Current product audit and boundaries | [Current-state audit](../ai-platform/CURRENT-STATE-AUDIT.md) |
| Source-aware retrieval decisions | [Hybrid legal retrieval](../ai-platform/HYBRID-LEGAL-RETRIEVAL.md) |
| Cloudflare resources and deployment responsibility | [Cloudflare resource inventory](../ai-platform/CLOUDFLARE-RESOURCE-INVENTORY.md) and [deployment guide](../DEPLOYMENT.md) |
| Security and disclosure expectations | [Security audit](../ai-platform/SECURITY-AUDIT.md) and [SECURITY.md](../../SECURITY.md) |

Run the repository's published quality gates before treating a code change as ready for review:

```sh
npm run lint
npm run type-check
npm test
npm run build
npm run validate:artifact
```

## What this note does not claim

This document intentionally does not claim a legal-answer accuracy score, a complete body of legislation, an official third-party legal-source API, a production payment service, client counts, users, revenue, certifications or guaranteed legal outcomes. Those would require separately published, reproducible evidence and product approval.
