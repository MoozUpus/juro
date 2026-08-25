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
- Product analytics is an exact, content-free vocabulary rather than arbitrary
  event payloads.
- Public funnel telemetry requires explicit analytics consent and sends no URL,
  identifier, content, or credentials.

### P1 follow-up

- CSS remains fragmented across 56 files, with multiple local color, spacing,
  radius, and feedback patterns. Consolidate opportunistically behind visual
  regression tests.
- Static scan found 165 declarations matching 11 px or smaller and 63 possible
  sub-44 px minimum dimensions. These are review candidates, not 228 confirmed
  defects; icon geometry, decoration, and non-interactive metadata must be
  separated from controls before changing them.
- Compatibility aliases make the route tree large. Keep canonical redirects and
  analytics until safe retirement is proven.

### External/operational blockers

- Cloudflare account billing showed an overdue balance of $381.29 during this
  audit; service continuity is an owner action, not a code change.
- Zone SSL mode was Full rather than Full (Strict), and no custom WAF/rate rules
  were observed. Tightening them needs certificate/origin and traffic validation.
- Core Web Vitals could not be measured because the required Chrome DevTools
  performance connector was unavailable. Artifact budgets are green but are not
  an LCP/INP/CLS claim.
