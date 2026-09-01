# JURO security audit

Status: **PARTIAL — four base-revision findings remediated in the v113 candidate; production verification remains open**

Evidence cutoff: **2026-09-01**

Scanned revision: `beae3e05d7552b999c0fb7bcba14ee615c04906a`

Security scan ID: `fb8621fe-664a-4364-86df-e357d586a2b3`

## Result

The source-only Standard scan of `apps/platform` reported one high- and three medium-severity findings. All four have corresponding fixes and focused regression tests in the v113 working tree. The scan remains `PARTIAL`: 68 of 1,594 scoped files were fully reviewed, the working tree changed after the base snapshot, and no live Cloudflare, D1, R2, authenticated-browser, or penetration testing was performed.

| Finding on the scanned revision | Severity | v113 remediation | Candidate status |
| --- | --- | --- | --- |
| A D1 reader could enumerate a six-digit login OTP from its salt and raw SHA-256 verifier | HIGH | New login OTPs always use the server-held identity keyring for a domain-separated HMAC, independent of the profile-identity rollout mode. New keyed rows retain no usable SHA verifier; pre-release legacy rows remain readable only through the compatibility path until their ten-minute expiry. | FIXED IN CANDIDATE |
| An attacker-created OTP challenge could impose an email-wide replacement lock | MEDIUM | Failed-attempt state remains scoped to the challenged row. After the normal resend cooldown, a replacement can be issued and the predecessor is invalidated. Email and IP issuance budgets remain in force. | FIXED IN CANDIDATE |
| Lawyer profile photos bypassed the common actual-byte limiter before `arrayBuffer()` | MEDIUM | `POST /api/platform/lawyer-profile/photo` now receives an exact 2 MiB Worker-level streaming bound. The route-level size check remains defense in depth. | FIXED IN CANDIDATE |
| Signed-PDF access codes used raw SHA-256 beside the stored public token | MEDIUM | New codes use a key-versioned, domain-separated HMAC and constant-time comparison. Legacy SHA rows remain compatible only for already-active shares, whose maximum lifetime is 24 hours. | FIXED IN CANDIDATE |

`FIXED IN CANDIDATE` does not mean deployed or production-verified. The findings remain open for the scanned base revision and close operationally only after exact-head CI, deployment, and post-deploy verification succeed.

## Focused verification

- 25/25 focused OTP, challenge-evidence, request-body, and signed-share tests passed.
- The replacement-challenge test exhausts one OTP under concurrency, then proves a new challenge can be issued after cooldown and the predecessor is invalidated.
- The keyed OTP test proves verification does not depend on a retained SHA value while email-evidence divergence checks remain active.
- The signed-share test covers correct and incorrect keyed verifiers, bounded legacy compatibility, and fail-closed creation without the keyring.
- The request-body test proves the common policy assigns exactly 2 MiB to the lawyer-photo route; existing stream tests cover missing and understated `Content-Length`.

The full repository and Worker/runtime suites are recorded separately in [`../qa/test-report.md`](../qa/test-report.md). A green build or focused suite is not a production-security certificate.

## Reviewed controls without a reportable finding

- Sampled document and file downloads preserved owner, workspace, collaborator, and lawyer-grant checks; no demonstrated IDOR was established in those routes.
- Public lawyer profile and photo routes required approved publication state.
- Reviewed internal admin handlers required both a fixed-time service-token check and a live environment-bound admin session, followed by capability checks.
- The reviewed Markdown renderer skipped raw HTML, restricted links, disabled images, and rendered through React components.
- Queue and scheduled paths sampled exact queue selection, schema checks, leases, retry or dead-letter handling, and feature gates.
- Public document URL import was disabled in every checked environment. Its separate DNS-validation and fetch steps still require rebinding hardening before the feature can be enabled.

These statements apply only to the sampled paths and do not imply full route coverage.

## Open security gates

| Priority | Gate | Why it remains open | Required evidence |
| --- | --- | --- | --- |
| P1 | Exact-head security verification | The canonical scan targets the pre-fix base revision | Review the v113 diff, pass exact-head CI, and retain the sealed base-scan evidence plus remediation tests |
| P1 | Production rollout | No v113 Worker is deployed | Deploy through the normal rollback-gated workflow, then verify OTP issuance, share verification, the 2 MiB boundary, logs, and error rates without exposing credentials |
| P1 | Complete platform coverage | Only 68/1,594 scoped files were fully reviewed | Continue route-by-route security review, prioritizing authentication, tenant authorization, file access, billing, and privileged operations |
| P1 | End-to-end admin boundary | The separate `juro-admin` Worker was outside this scan | Review that Worker's cookie, CSRF, routing, token-injection, and capability enforcement against the live service binding |
| P2 | Profile identity protection | Checked environments still select `IDENTITY_PROTECTION_MODE=legacy` | Plan and verify the separate profile-email and phone protection rollout with migration, rollback, and live evidence |
| P2 | Authenticated AI body limits | Some sensitive routes use `request.json()` directly | Validate outer limits and runtime impact, then apply bounded parsing where the hypothesis is confirmed |

## Scope boundary

At the owner's direction, this audit did not inspect or operate the legislation database, local legal corpus, Lex.uz or Advice.uz ingestion, vectors, embeddings, or corpus staging capacity. Those exclusions are not counted as security passes or completed work.
