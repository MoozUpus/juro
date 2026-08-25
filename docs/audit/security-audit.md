# Security audit — 2026-08-25

Status terms: `CLOSED` means the stated control has code, tests and the required
runtime evidence; `PARTIAL` means useful evidence exists but the stated review
boundary is incomplete; `OPEN` means a concrete control or proof is still
absent; `EXTERNAL` needs account-owner or provider action.

| Priority | Finding | Status | Evidence / action |
| --- | --- | --- | --- |
| P0 | Public Platform hosts accepted HTTP; a login response could set a session cookie over an insecure transport | CLOSED | Worker enforces 308 before routing; live POST probes passed on app/lawyer/admin/status |
| P1 | Signed-share four-digit verification had no durable attempt budget (CWE-307) | CLOSED | D1 guard: 5 failures per 15-minute window, 15-minute lock, 429 + Retry-After, atomic clear on success |
| P1 | Active signed-share public token and access code were stored in plaintext (CWE-312/CWE-922) | CLOSED | AES-GCM record-bound protection, key versioning, hash lookup, D1 mixed-state triggers; production had zero legacy rows |
| P1 | Cloudflare account shows overdue USD 381.29 and possible interruption | EXTERNAL | No billing acknowledgement or payment action was taken |
| P2 | Zone SSL mode is Full rather than Full (strict) | OPEN | Worker custom domains enforce HTTPS/HSTS; control-plane origin validation remains to harden |
| P2 | Anonymous public analytics ingestion had no request-rate bound (CWE-770) | CLOSED | Diff scan `3424a2a8-02aa-42b6-9de1-7b57963082ce` reported one Low/high-confidence finding. Active Cloudflare rule `b6afd1615e2042c898f2a446c7dbb525` now matches only `POST app.juro.uz/api/public/analytics`, allows 20 requests per IP per 10 seconds, then blocks for 10 seconds. Below-threshold and negative route probes passed after deployment |
| P3 | Broader custom zone WAF posture remains minimal | OPEN | The scoped analytics rate rule is active; custom rules remain 0/5 and no general managed-rule upgrade or unrelated policy is claimed |
| P3 | Whole-repository security review is not exhaustive | PARTIAL | Standard scan `df6f1247-116c-42b8-b233-a693efb52263` targeted immutable `e4f407a8b9fba0db8cac1a3cde681460ab58132f`, inventoried 1,898 tracked files and closed 8/8 planned threat surfaces with zero reportable findings. Independent delegated review, TAC and destructive production testing were unavailable, so this is not a blanket proof of absence |
| P3 | Website transitive PostCSS and Sharp advisories | CLOSED | Reachability validation found no production path that sends attacker-controlled CSS or images through these build-time dependencies. `apps/website` nevertheless pins PostCSS `8.5.23` and Sharp `0.35.3`; production `npm audit` is zero and website test, type-check, lint, licence and artifact gates pass. Exact diff scan `a2cb0d4a-7512-4b0a-aa5e-362681007619` covered `e4f407a8..81aaf408` and retained zero findings |
| P2 | Dormant remote URL document import could create an SSRF/DNS-rebinding boundary if enabled | OPEN | The flag is disabled in development, staging and production. It must remain disabled until a dedicated release gate revalidates the exact Cloudflare egress and DNS-rebinding behaviour |
| P2 | Voice provider retention and regional handling are not contractually proven in repository evidence | OPEN | No code vulnerability was established. Before treating voice as zero-retention, obtain and record provider/account controls and data-processing terms |
| P2 | Local plaintext price-gate exports remain after verified private R2 readback | OPEN | Exact directory `C:\Users\A S U S\AppData\Local\Temp\juro-production-price-config-f42c48fc-20260825T074158Z` remains because the execution policy blocked both recursive and exact-file deletion attempts. Private R2 is the verified recovery source; manual removal is still required |

## Confirmed boundaries

- Production secrets are Worker secret bindings; values were not read or
  persisted. `IDENTITY_KEYRING`, OpenAI, Anthropic, Turnstile, Resend, TURN and
  Admin secret names are present.
- Application pages and APIs use server session/tenant/role boundaries. Admin
  writes require staff capability plus fresh MFA. The dedicated Lawyer host is
  routed server-side.
- Platform pages emit CSP, HSTS on HTTPS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, strict referrer policy, route-scoped media
  permissions and `X-Robots-Tag: noindex`.
- D1/R2 application data remain private. The signed-share migration backup was
  removed locally after verified readback. The later price-configuration backup
  completed the same private R2 source/readback checks, but its exact local
  plaintext directory remains as the explicit open item above.
- Signed-share verification requires same-origin write proof and now adds a
  server-side D1 lock that cannot be bypassed by forged browser headers.

## Scan provenance

The standard scan targeted immutable commit
`3e1742931fdf7004d8a3e3a3c68ea9fc32ee9c53` and produced two medium,
high-confidence findings:
`csf_b31772bc568cf63a59f86f09` and
`csf_92918b4a812fb9a06348036b`. The fixes were implemented and independently
tested in `a3f22f87`. Because the scan target preceded the patch, remediation
evidence is the current diff/tests/production release, not a claim that the old
report itself became clean.

The product-analytics diff scan `3424a2a8-02aa-42b6-9de1-7b57963082ce`
completed 26/26 changed-file receipts and reported only Low finding
`csf_ca03e598897210bb9a46878d`. No tenant-isolation, content-privacy,
provider-retention or citation-integrity issue was found in that diff. The
finding is remediated in the Cloudflare control plane by the active scoped rule
above. A deliberate production burst was not fired from the shared operator IP;
the rule configuration, active status, exact ID and below-threshold route matrix
are the recorded verification boundary.

The later whole-repository Standard scan
`df6f1247-116c-42b8-b233-a693efb52263` targeted immutable commit
`e4f407a8b9fba0db8cac1a3cde681460ab58132f`. It closed all eight planned
review surfaces and retained zero reportable findings after validation. The
source review covered anonymous telemetry, auth/OTP/MFA and cross-domain
routing, tenant data access, private document/share/R2 paths, AI and official
legal-source provenance, lawyer collaboration, the admin control plane,
Queues/deployment and dependency reachability. The durable scan summary is
[`security-scan-e4f407a8.md`](./security-scan-e4f407a8.md). Its coverage remains
explicitly partial because the independent delegated baseline and TAC were
unavailable and no destructive production abuse was performed.
