# JURO Security Audit

Status: **living audit; no repository-wide clean bill of health is claimed**
Latest scoped release: v99 (`7935d560b29705f1886fa34f7bb61eb1b3af2c11`).

## v99 findings and fixes

| Finding | Previous vulnerable path | Enforced invariant | Result |
| --- | --- | --- | --- |
| Pending invitation PII | any active workspace member could receive decrypted pending invite emails; expired invites were included | active members may list members; only owner/admin may list pending invitations; accepted, revoked, or expired rows are excluded | fixed and production-deployed |
| Unbounded public JSON | 44 direct JSON reads across 42 route files lacked one common application byte cap | actual streamed bytes are bounded; ordinary public JSON uses 1 MiB, document-builder structured bodies use 8 MiB, explicit upload paths keep their own controls | fixed and production-deployed |

Security scan `3f683f24-c93d-469c-934e-4826a9122674` produced the two findings above. Focused tests passed 91/91. The final full run passed 1,161 platform, 217 Cloudflare, and 33 Worker smoke tests. Independent review found and caused correction of one pre-release dispatch-order regression that would have interfered with the internal 20 MiB admin upload; the corrected full suite and CI passed before deployment.

## Live proof

- a small unauthenticated JSON request to `/api/platform/team` continues to the normal auth boundary and returns `401`;
- a request over 1 MiB returns `413` with `PAYLOAD_TOO_LARGE`;
- private app and lawyer entry routes return localized login redirects with `private, no-store` behavior;
- the public status snapshot reports no incident and operational private R2, malware scanning, queues, DLQ, and provider probes.

## Residual risk and open evidence

- team authorization coverage is source-contract based rather than a live D1 owner/admin/member fixture matrix;
- reconstructed accepted requests retain a client-supplied understated `Content-Length`; bytes are locally bounded and fully parsed, but exact Cloudflare/Vinext integration for that mismatch lacks a dedicated edge test;
- full authenticated IDOR/tenant matrix, consented lawyer handoff, fresh-MFA administration, OTP abuse testing, and manual upload adversarial testing remain open;
- legacy origin/DNS ownership remains unresolved;
- the older detailed audit under [`apps/platform/docs/ai-platform/SECURITY-AUDIT.md`](../../apps/platform/docs/ai-platform/SECURITY-AUDIT.md) is historical and must not override this current release evidence.
