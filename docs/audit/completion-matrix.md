# JURO Definition of Done matrix

Status: **artifact-complete; execution incomplete**

Evidence cutoff: **2026-09-01**

This matrix is the canonical index for the execution brief. A present document can still carry `PARTIAL`, `OPEN`, or `EXCLUDED`; file presence never upgrades the underlying product claim.

## Mandatory artifacts

| Required path | Present in v113 | Evidence status |
| --- | --- | --- |
| `docs/audit/domain-route-inventory.md` | yes | PARTIAL |
| `docs/audit/full-platform-audit.md` | yes | NOT READY |
| `docs/audit/ux-ui-audit.md` | yes | PARTIAL |
| `docs/audit/mobile-audit.md` | yes | PARTIAL |
| `docs/audit/accessibility-audit.md` | yes | PARTIAL |
| `docs/audit/security-audit.md` | yes | PARTIAL; 4 base findings fixed in the undeployed candidate, with per-head PR scan required |
| `docs/audit/performance-audit.md` | yes | PARTIAL |
| `docs/audit/seo-audit.md` | yes | PARTIAL |
| `docs/audit/broken-links-report.md` | yes | VERIFIED for the captured public crawl |
| `docs/design/design-system.md` | yes | PARTIAL |
| `docs/design/component-inventory.md` | yes | VERIFIED for the named commit |
| `docs/ai/model-routing.md` | yes | VERIFIED in source; live health separate |
| `docs/ai/model-evaluation.md` | yes | PARTIAL |
| `docs/ai/cost-control.md` | yes | VERIFIED in source/tests; live policy separate |
| `docs/ai/legal-answer-pipeline.md` | yes | VERIFIED in source; answer quality separate |
| `docs/ai/citation-policy.md` | yes | VERIFIED in source/tests |
| `docs/sources/legal-corpus.md` | yes | EXCLUDED, not implemented by v113 |
| `docs/sources/lexuz-provider.md` | yes | VERIFIED in source; live availability separate |
| `docs/sources/advice-scenarios.md` | yes | EXCLUDED and disabled |
| `docs/sources/uz-web-fallback.md` | yes | PARTIAL |
| `docs/qa/test-report.md` | yes | PARTIAL |
| `docs/deployment/production-readiness.md` | yes | NOT READY |
| `docs/deployment/rollback-plan.md` | yes | ACTIVE for recorded releases |
| `docs/deployment/final-changelog.md` | yes | LIVING, not final completion |

## Definition of Done evidence

| Group | Gate | Evidence | Status |
| --- | --- | --- | --- |
| Ecosystem | Domain and route inventory | `domain-route-inventory.md` | PARTIAL |
| Ecosystem | Cross-domain navigation and return targets | route inventory plus focused host-routing tests | PARTIAL |
| Design | Shared tokens and component contracts | `docs/design/*` and platform design-system source | PARTIAL |
| Design | Responsive/mobile matrix | `mobile-audit.md` | PARTIAL |
| Functionality | Core automated suites | `docs/qa/test-report.md` | VERIFIED for tested revision |
| Functionality | Every CTA and authenticated role journey | no one-revision production matrix | OPEN |
| Functionality | Saving, reload, loading, and failure states | route-specific tests and limited browser evidence | PARTIAL |
| AI | OpenAI primary and Anthropic fallback | `docs/ai/model-routing.md` | VERIFIED in source |
| AI | Provider cost, quota, and circuit controls | `docs/ai/cost-control.md` | VERIFIED in source/tests |
| AI | Citation/source grounding | `docs/ai/citation-policy.md` | VERIFIED in source/tests |
| AI | Reviewed RU/UZ answer-quality matrix | `docs/ai/model-evaluation.md` | OPEN |
| Security | Auth, CSRF, tenant/object access | sealed partial base scan, v113 remediation tests, and per-head diff-scan gate | PARTIAL |
| Security | Privacy, logging, prompt-injection boundaries | canonical security and AI documents | PARTIAL |
| Security | Production penetration/IDOR evidence | no complete current-revision record | OPEN |
| Quality | Unit/integration/runtime tests | `docs/qa/test-report.md` | VERIFIED for tested revision |
| Quality | Visual/accessibility matrix | bounded Chrome and automated evidence | PARTIAL |
| Quality | Performance budgets | `performance-audit.md` | PARTIAL |
| Quality | Exact-revision production smoke | current branch is not deployed | OPEN |
| Quality | Rollback plan | `rollback-plan.md` | VERIFIED for recorded releases |
| Excluded | Legislation database, corpus, Advice ingestion, vectors | owner scope decision | EXCLUDED |

## Release rule

The project must remain `NOT READY for the full execution brief` while any required non-excluded gate is `OPEN` or while production evidence belongs to a different revision.
