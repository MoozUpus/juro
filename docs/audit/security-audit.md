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
| P2 | No custom zone WAF or zone rate-limit rule was present | OPEN | Application controls exist; edge defence-in-depth policy still needs scoped design and rollout |
| P2 | Standard security scan coverage was partial | OPEN | Re-run a full immutable scan when complete repository coverage is available; do not infer zero findings |

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
- D1/R2 data remain private. The release backup is private and local plaintext
  exports were removed after readback verification.
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
