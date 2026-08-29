# Codex Security scan — 3a30042c

## Result

| Field | Verified value |
| --- | --- |
| Scan ID | `aacf0487-aae5-4c8f-a527-8f3efc70cb76` |
| Immutable target | `3a30042c096f5aca91c3852a6998b7ddcd452025` |
| Result | 0 Critical, 0 High, 6 validated Medium findings |
| Remediation source | `695693f3ecbc04a800c8cc81e8486d22c03e5230` |
| Evidence source | `1ee3047b643136c08fcadcacce61776d19cded18` |
| Deployment state | NOT DEPLOYED |

The scan result is not represented as clean: six candidates survived validation
and were fixed in the branch candidate. The fixes have source, focused tests,
full non-legislation regression coverage and exact-source CI evidence. They do
not become production controls until the reviewed Platform release is deployed
and replayed.

## Validated findings and remediation

| Severity | Boundary | Remediation | Verification |
| --- | --- | --- | --- |
| Medium | Workspace viewers could reach case, action-plan, document-analysis and comparison mutation handlers that resolved membership without consistently requiring an editor role | Added `requireWorkspaceContentEditor` and `workspaceForContentEditor`; affected write routes now fail closed for read-only members while read routes retain membership access | Case lifecycle, platform core, document-analysis boundary, Builder version and comparison regressions |
| Medium | A collaborator with document download capability could request a hidden attachment directly unless the request used the inline path | Attachment visibility is now checked for every collaborator attachment download, independent of `inline=1` | Document Builder access-boundary regression |
| Medium | Restricting a lawyer profile did not synchronously revoke existing case grants, and some operational lawyer routes trusted the old grant without rechecking profile state | Suspend, block and archive transitions revoke active grants; consultations, time tracking and document verification require both profile states to remain `public_approved` | Lawyer marketplace lifecycle regression |
| Medium | Document Builder attachments and signed PDFs could move directly into the private bucket after structural validation without the checksum-bound quarantine/malware gate used by document analysis | New shared quarantine path verifies R2 checksum, scanner response size/schema and returned source hash, promotes only a clean object, records scan metadata and deletes quarantine/orphan objects on failure | Builder upload, attachment and signed-file regressions |
| Medium | DOCX comparison uploads relied on ZIP structural validation without caller-specific expansion limits suitable for this synchronous route | Upload and process paths enforce an 8-second verification budget, at most 500 entries, 25 MiB expanded bytes and a 40× expansion ratio; invalid archives fail before private storage or processing | Archive-inspector and document-comparison regressions |
| Medium | Guest AI calls bypassed the provider cost circuit and were not represented in provider-usage accounting | Guest execution checks the provider circuit before every attempt and records system-scoped success, retry, fallback and failure usage without tenant identity or prompt content | Guest AI route-boundary and provider-usage regressions |

## Verification

- Selected non-legislation Platform regression: 774 passed, 0 failed.
- Rendered Worker HTML: 35 passed, 0 failed after the bounded worker-instance
  reuse correction in `1ee3047b`.
- Platform type-check, lint, production build, deployable-artifact validation and
  all emitted-asset budgets passed locally.
- GitHub Actions run `33227714329` passed on exact evidence source `1ee3047b`:
  Website 3m50s and Platform 8m14s, including tests, the Cloudflare matrix,
  dependency audit and licence policy.
- Draft PR: <https://github.com/MoozUpus/juro/pull/64>.

## Release and residual boundaries

- The remediation candidate is not deployed. Production remains on its
  separately recorded Worker checkpoint; no current production claim is based
  on these six fixes.
- No destructive malware, abuse-volume or cross-tenant request was sent to
  production. Verification used source review, isolated tests, deployable
  artifacts and CI.
- Fresh authenticated Lawyer and Admin route loops still require real,
  authorized sessions. No identity or privileged session was fabricated.
- Remote URL document import remains disabled and still requires its dedicated
  SSRF/DNS-rebinding release gate before enablement.
- Legislation-corpus and Advice.uz database work is excluded from this
  continuation by current user direction.

