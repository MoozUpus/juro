# JURO AI Cost Control

Status: **implemented controls; production financial completeness not independently certified here**

Evidence cutoff: **2026-09-02 UZT**

## Control stack

1. **Bounded requests:** chat and document analysis cap output tokens, provider attempts, and wall-clock budgets.
2. **Usage ledger:** successful and failed provider calls record content-free usage events with provider, model, operation, token counts, item counts, timestamps, and safe request identifiers.
3. **Price versions:** estimated cost is computed only when an effective provider/model/operation price record exists. Missing price evidence remains unknown rather than silently becoming zero.
4. **Daily aggregates:** usage is aggregated by environment, day, workspace/user scope, feature, operation, provider, and model.
5. **Policies and circuits:** versioned policies can open a provider circuit on a daily estimated-cost limit or rolling failure spike. Manual circuit control is also supported.
6. **Operational alerts:** circuit transitions create durable events and alert work rather than relying only on application logs.
7. **Server authority:** calls check the active circuit before reaching a provider. Staff mutation routes require protected capabilities and fresh MFA.

Implementation: `apps/platform/lib/ai/provider-usage.ts`, `provider-cost-control.ts`, `execution-budget.ts`, and the protected cost console.

## Required dashboard views

- requests and estimated cost by provider/model/feature/day;
- input, cached-input, and output tokens;
- success/failure and fallback rate;
- open circuits and reasons;
- policy thresholds and effective dates;
- unknown-price usage that cannot yet be costed;
- alert delivery state.

## Release gates

- Reject invalid, negative, or impossible token/cost evidence.
- Never count failed requests as successful token usage.
- Keep pricing and policy changes versioned and reviewable.
- Prove both automatic and manual circuit behavior in tests.
- Compare spend guardrails with latency/quality guardrails; the cheapest route is not acceptable if it produces unsafe or unusable answers.

## Current evidence limit

The repository contains the ledger, aggregation, policy, circuit, and alert contracts plus focused tests. This audit did not read private production billing records or mutate production cost policies, so no current spend total or savings claim is made.
