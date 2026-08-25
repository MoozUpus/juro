# Security audit — 2026-08-25

Status terms: `CLOSED` means code, tests and production evidence exist;
`OPEN` means a concrete control is still absent; `EXTERNAL` needs account-owner
or provider action.

| Priority | Finding | Status | Evidence / action |
| --- | --- | --- | --- |
| P0 | Public Platform hosts accepted HTTP; a login response could set a session cookie over an insecure transport | CLOSED | Worker enforces 308 before routing; live POST probes passed on app/lawyer/admin/status |
| P1 | Signed-share four-digit verification had no durable attempt budget (CWE-307) | CLOSED | D1 guard: 5 failures per 15-minute window, 15-minute lock, 429 + Retry-After, atomic clear on success |
| P1 | Active signed-share public token and access code were stored in plaintext (CWE-312/CWE-922) | CLOSED | AES-GCM record-bound protection, key versioning, hash lookup, D1 mixed-state triggers; production had zero legacy rows |
| P1 | Cloudflare account shows overdue USD 381.29 and possible interruption | EXTERNAL | No billing acknowledgement or payment action was taken |
| P2 | Zone SSL mode is Full rather than Full (strict) | OPEN | Worker custom domains enforce HTTPS/HSTS; control-plane origin validation remains to harden |
| P2 | Anonymous public analytics ingestion had no request-rate bound (CWE-770) | CLOSED | Diff scan `3424a2a8-02aa-42b6-9de1-7b57963082ce` reported one Low/high-confidence finding. Active Cloudflare rule `b6afd1615e2042c898f2a446c7dbb525` now matches only `POST app.juro.uz/api/public/analytics`, allows 20 requests per IP per 10 seconds, then blocks for 10 seconds. Below-threshold and negative route probes passed after deployment |
| P3 | Broader custom zone WAF posture remains minimal | OPEN | The scoped analytics rate rule is active; custom rules remain 0/5 and no general managed-rule upgrade or unrelated policy is claimed |
| P3 | Full repository security scan coverage remains open | OPEN | The current analytics diff received complete 26/26-file coverage. Re-run a full immutable repository scan when complete repository coverage is available; do not infer zero findings outside the reviewed diff |
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
