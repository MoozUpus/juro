# JURO Security Audit

Status: **release-scoped evidence, not a repository-wide penetration test**

Evidence cutoff: **2026-09-02 04:19 UZT**

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
- The broader domain inventory still records legacy DNS/origin-exposure questions requiring owner/service confirmation; v116 made no DNS change.
- TAC display entitlement could not be verified because the Codex Security access connector was not connected; the sealed local report and SARIF were still generated.
- Legislation databases, legal corpus, vectors, embeddings, and staging-capacity work are explicitly excluded.

No secret, credential value, private document, or production record is included in this report.
