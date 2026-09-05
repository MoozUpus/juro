# JURO Security Audit

Status: **release-scoped evidence, not a repository-wide penetration test**

Evidence cutoff: **2026-09-02 07:03 UZT**

## v120 production-operations evidence

- A bounded network check proved that `ftp.juro.uz` does not answer on FTP port 21, exposes the default AlmaLinux server page over plain HTTP, and presents a certificate that fails hostname validation over HTTPS. The DNS-only A record still reveals `95.46.96.77`; no JURO code dependency was found.
- The safe remediation is deletion of only the saved DNS-only A record after Cloudflare sign-in, followed by NXDOMAIN, public-route, protected-boundary, and email-MX verification. Rollback is recreation of `A ftp.juro.uz → 95.46.96.77`, TTL 300, DNS-only.
- No DNS write was attempted through an under-permissioned token. The OAuth API correctly rejected DNS-record access, and Chrome was stopped at Cloudflare sign-in without entering credentials.
- Read-only production dependency history contained no request, response, document, user identifier, or credential. It showed 195/197 operational provider probes in the 24-hour window and no provider billing/balance error; this is operational evidence, not a penetration test or availability SLA.

## v116 diff result

Codex Security scan `1084b6c7-7516-4b17-b1fb-bda7b183ae2e` reviewed the immutable range `97847a68e7955adc0b0b82db8c83c94d16bb3ebb..c5e703fc0b0246d5218da3d6fb89bf420c2ed22a` with complete changed-source coverage and 0 reportable findings. The change is limited to auth/public CSS and regression tests.

The scan followed supporting code far enough to verify that authentication authority remains server-side: same-origin write checks, Turnstile action/hostname binding, bounded OTP reservation, D1-backed sessions, secure cookies, and Worker response headers were not changed.

## Live boundary evidence

| Boundary | Observation | Result |
| --- | --- | --- |
| Individual → Business | redirected to permitted Individual dashboard | ENFORCED |
| Individual → Lawyer | lawyer host required explicit reauthentication | ENFORCED |
| Individual → Admin | admin route required a protected admin session | ENFORCED |
| Public → auth submit | Turnstile required before submit became available | ENFORCED |
| Public indexing | apex indexable; provider clone noindex | ENFORCED |
| Protected indexing | platform Worker retains noindex headers | UNCHANGED BY v116 |

## Limitations and open security work

- This is not a fresh repository-wide scan, penetration test, or authenticated authorization matrix.
- Business, Lawyer, Pending Lawyer, Staff/Admin, cross-tenant, IDOR, upload, share-link, billing, and account-deletion tests remain open until controlled role accounts and test data are available.
- The broader domain inventory now identifies `ftp.juro.uz` as a reversible retirement candidate; the remaining blocker is Cloudflare DNS authentication/permission. No DNS change has yet occurred.
- TAC display entitlement could not be verified because the Codex Security access connector was not connected; the sealed local report and SARIF were still generated.
- Legislation databases, legal corpus, vectors, embeddings, and staging-capacity work are explicitly excluded.

No secret, credential value, private document, or production record is included in this report.
