# JURO Platform Worker v176 production evidence

Evidence cutoff: **2026-08-30 04:18 UZT (2026-08-29 23:18 UTC)**

Status: **released with bounded production evidence; not a full-goal completion certificate**

## Release identity

| Item | Verified value |
| --- | --- |
| Source PR | #75, exact base `08274e487bb84c1b7df5db656e01fafbb20449c4`, reviewed head `ca915a9f743761e369825e7696f6d42ace15fbed` |
| GitHub main | Squash merge `e7434b6f3cb1dd937ee16b8950a849a61195168f` |
| Exact-head CI | Run `33279675792`: website and platform jobs passed |
| Security review | Scan `809696a4-d761-42ea-a7f3-3f9b8efecd3b`: 40/40 generated review items, seven logical risk surfaces, no candidates or findings |
| Production workflow | Run `33279990329`: platform deploy passed; website and admin deploys correctly skipped |
| Worker release | Version **176**, version ID `a4abf98b-41c2-4b5e-b669-c13723da6497`, deployment `32334545-103f-4973-a57e-f926d16e8413`, 100% traffic |
| Worker rollback | Version **175**, version ID `91e87ef8-2042-4ca3-b888-1ab22079ab32`, deployment `dfa906d0-6a82-4d84-ae82-2aa1a098cd21` |
| Public Sites | Version **94** remains live; saved v95 was not published |

## Released scope

- The dedicated lawyer host preserves the lawyer persona after OTP/MFA and routes lawyers to lawyer destinations rather than stale client `returnTo` values.
- Lawyer onboarding, application, dashboard and six-step profile editing are separated.
- Profile create/update/submit, moderation detail, staff photo access and public-approved directory output are implemented.
- Consultation duration, additional services, service code, preferred format and proposed start fields are supported.
- Availability-only updates retain the approved moderated profile revision and use `updated_at` optimistic concurrency.
- Changes to professional or static fields increment the revision, remove public approval and require re-moderation.
- Public directory endpoints expose only `public_approved` profiles.

The legislation database, legal corpus, vectors, ingestion and legal-source records were not inspected or modified in this release increment.

## Validation before merge

- Focused lawyer lifecycle regression: **14/14 passed**, including real-D1 approval, availability and concurrency cases.
- Platform runtime suite: **202/202 passed**.
- Full platform test command completed successfully.
- Type-check and lint passed.
- Production artifact budgets passed: CSS 559.9/580 KiB, initial JavaScript 294.1/320 KiB, largest lazy increment 212.1/240 KiB, fonts 453.6/512 KiB, images 564.4/640 KiB and Worker 3719.3/6144 KiB.
- Dependency audit reported zero vulnerabilities; website and platform license checks passed.
- Cloudflare production matrix passed in CI.

## Production D1 reconciliation and recovery evidence

The production table already contained the two profile columns from the historical ledger entry `0145_lawyer_profile_services.sql`. The repository now names the byte-equivalent migration `0146_lawyer_profile_services.sql` because main uses `0145_ai_secondary_web_research_flag.sql`. A normal migration apply therefore stopped safely on `duplicate column name: consultation_duration_minutes` before changing data.

Live schema checks then confirmed the exact duration constraint, the `additional_services_json` default, six valid lawyer profiles and zero foreign-key violations. A guarded ledger-only reconciliation recorded `0146_lawyer_profile_services.sql` as migration ID 161 at `2026-08-29 23:11:42` UTC. The final migration check reported **No migrations to apply**.

| Recovery artifact | Private R2 object | Size | SHA-256 | Independent restore |
| --- | --- | ---: | --- | --- |
| Before reconciliation | `d1/releases/2026-08-30/pre-0146-e7434b6-610f7724.sql` | 237,741,531 bytes | `610f77241a11a4baf648a9eb31c0afeac2760af9efd7256ae7fad08fa33d3f2c` | `quick_check=ok`, 160 migrations, zero FK violations |
| After reconciliation | `d1/releases/2026-08-30/post-0146-e7434b6-e8321d5e.sql` | 237,883,998 bytes | `e8321d5eb27058a0dbcfd79520b46ec5951fe7821aba64019cfd0ea3d84fa98c` | `quick_check=ok`, 161 migrations, zero FK violations |

Both SQL objects were read back from private R2 and matched their local sizes and SHA-256 hashes. Matching manifest JSON objects are stored beside them. No signed or secret-bearing download URL is recorded here.

## Chrome-only production QA

Chrome DevTools was used without Edge, Firefox, Safari/WebKit or physical mobile devices.

- `https://status.juro.uz/api/status` returned HTTP `200` at `2026-08-29T23:17:55.139Z`: overall `operational`, **8/8 operational**, no active or recent incidents. Anthropic, OpenAI and lawyer-area probes were operational.
- `https://app.juro.uz/api/public/lawyers` returned HTTP `200`, two profiles, and every returned profile had `marketplaceStatus=public_approved`. Both entries included consultation-duration and additional-services fields; no pending profile was exposed.
- `https://lawyer.juro.uz/` returned the lawyer-specific login surface.
- An isolated unauthenticated visit to `/ru/lawyer/dashboard` redirected to `/ru/auth/login?returnTo=%2Fru%2Flawyer%2Fdashboard`, final HTTP `200`, without exposing private data.
- `/ru/auth/register` rendered the lawyer registration form at a Chrome-emulated 360 × 800 viewport with `scrollWidth=clientWidth=360`; no horizontal overflow was observed.
- The Turnstile frame emitted browser console diagnostics about deprecated/quirks/CSP behavior and a non-blocking `NaN` console message. The form rendered, but this remains a browser-console follow-up rather than a clean-console claim.

Chrome had been reconnected and contained no real signed-in JURO sessions. No account, OTP, user or session was fabricated. Authenticated Client, Business, Lawyer, Pending Lawyer and Staff/Admin journeys therefore remain open evidence gates.

## Release boundary

Worker v176 is live and the verified public and anonymous boundaries are healthy. This evidence does not prove the complete authenticated role matrix, staging recovery, the excluded legislation/corpus scope, or publication of Sites v95. Those items remain separate gates.
