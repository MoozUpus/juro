# UX/UI audit

**Scope:** public site, citizen/business platform, lawyer persona, admin routes,
and shared legal/document workflows. Static audit updated 2026-08-25; final
authenticated production browser matrix is recorded separately in the QA report.

## Outcome

The ecosystem already has a coherent JURO identity, responsive shell, clear
citizen/business/lawyer personas, evidence cards, and integrated case/document
workflows. The current release work concentrated on trust gaps that visual polish
cannot hide: signed-share transport, tenant/capability boundaries, answer-source
integrity, privacy-safe activation telemetry, and truthful production status.

Commit `244b2e40` closes a reproduced auth-localization mismatch. Switching RU
↔ UZ on login or registration now localizes both the visible form route and a
safe protected `returnTo`/`return_to` destination. A UZ choice can no longer
silently return the user to `/ru/...` after authentication. Account type,
reauthentication and other safe query context remain intact; external targets
are removed rather than propagated.

## User journey assessment

| Journey | Current state | Remaining UX evidence |
| --- | --- | --- |
| Public value → registration | Clear RU/UZ/EN value and scenario CTAs; consent-gated aggregate funnel added | Re-measure post-release activation; no baseline is claimed yet. |
| Registration → first question | OTP/MFA and persona-safe destination; first-question event recorded only after accepted persistence | Authenticated mobile/keyboard timing sample. |
| Question → source-backed answer | Clarification, source panel, fallback and fail-closed states exist | Fresh production legal-quality sample; historical 314/314 is not current QA. |
| Answer → plan/case | Server-created plan/case and source relationships exist | Validate long-answer and many-deadline visual density. |
| Upload → analysis/comparison | Quarantine, deterministic comparison and legal enrichment are separated | Real upload/browser matrix and human review remain release evidence tasks. |
| Lawyer discovery → request | Directory, profile, request, acceptance, consented access, consultation states are connected | Payment remains demo/not approved; copy must preserve that boundary. |
| Lawyer work | Dedicated lawyer host/persona and assigned workflow | Production role-specific browser traversal after deployment. |
| Admin operations | Status, audit, costs, AI quality and legal-source surfaces exist behind capabilities | Fresh-MFA mutation paths should be sampled without changing unrelated state. |

## Findings

### Resolved in this release line

- HTTP public hosts now redirect before application routing.
- Standalone signed-share downloads use explicit signed authorization rather than
  a broadly reusable bearer path.
- Server role/persona destination wins over stale client return state.
- Auth language switching keeps the protected destination in the selected RU/UZ locale.
- Product analytics is an exact, content-free vocabulary rather than arbitrary
  event payloads.
- Public funnel telemetry requires explicit analytics consent and sends no URL,
  identifier, content, or credentials.
- Lawyer professional controls now share the 44 px interaction floor already
  applied to confirmed Client workflows. Production proves the exact CSS asset
  and fail-closed re-authentication boundary; signed-in Lawyer visual traversal
  still requires a real protected session.

### P1 follow-up

- CSS remains fragmented across 56 files, with multiple local color, spacing,
  radius, and feedback patterns. Consolidate opportunistically behind visual
  regression tests.
- Static scan found 165 declarations matching 11 px or smaller and 63 possible
  sub-44 px minimum dimensions. These are review candidates, not 228 confirmed
  defects; icon geometry, decoration, and non-interactive metadata must be
  separated from controls before changing them. The confirmed Lawyer
  professional-action subset is closed in Worker 157. Worker 158 also closes
  the confirmed non-corpus Admin retry, Knowledge Base and cost-checkbox source
  targets. Authenticated Lawyer and Admin rendering remains a separate evidence
  gate, and legal-source review controls were excluded from this iteration.
- Compatibility aliases make the route tree large. Keep canonical redirects and
  analytics until safe retirement is proven.

### External/operational blockers

- Cloudflare account billing showed an overdue balance of $381.29 during this
  audit; service continuity is an owner action, not a code change.
- Zone SSL mode was Full during baseline. It is now explicit Full (Strict) after
  certificate/origin classification and production/staging traffic validation.
  Cloudflare's 31-rule Free Managed Ruleset is `Always active`, and the scoped
  analytics rate rule is active. Custom rules remain 0/5 intentionally; an
  unrelated rule was not added merely to change the count.
- Bounded Chrome lab evidence now exists for the production login, public home
  and lawyer catalogue, including LCP and CLS. It is route-specific lab
  evidence rather than field CrUX or INP coverage, so it is not generalized to
  the full product.
