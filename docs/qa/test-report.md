# Test report — current evidence through 2026-08-28

## Worker 163 monitoring cadence closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `810432eac9c1159c4cbd60fddaab7c1c1131b655` on Draft PR `#64` |
| Cadence regression coverage | PASS — 7/7 focused metadata/cadence tests; `daily`, `weekly` and `immediate` delivery windows, legacy cursor initialization, empty-window cursor advance and deterministic retry safety are covered |
| Full local release gate | PASS — lint, type-check, production build, artifact budgets, rendered Worker 35/35, core 1104/1104 and Cloudflare/infrastructure 202/202 |
| GitHub Actions CI `33152530994` | PASS on exact `810432ea` — Website 2m41s and Platform 6m58s |
| Platform deployment | PASS — Worker 163 `e7c8ec49-bba6-4abd-ac00-89bfd1cd4acd`, deployment `dc3efbec-6909-4f56-80ef-0d964cdea027`, 100%; Worker 162 `d2146684-bd77-4a33-a2a2-8d47042e473e` is rollback |
| First production cadence run | PASS — run `a2d24c2d-751a-4690-8569-c284880289a7` completed at `2026-08-28T07:55:58.100Z`; all four legacy `daily`/`weekly` preferences received the safe cutoff cursor `2026-08-28T07:54:51.699Z` without historical delivery |
| Idempotent repeat | PASS — run `5aba731e-7c60-4c7f-b7d4-de793476c505` completed at `2026-08-28T08:01:53.188Z`; the four cursors remained unchanged and legislation-monitor notification count/max remained exactly 222,329 / `2026-08-28T06:40:50.995Z` |
| Production route matrix | PASS — `juro`, `www`, `app`, `lawyer`, `admin`, `status` and `status/api/status` returned HTTP 200 after release |
| Authenticated Chrome | PASS — RU and UZ Monitoring show fresh 40/40/0 state, selected daily cadence and localized cadence guidance; monitoring email is visibly disabled and not claimed operational. The original Lawyer-host dashboard URL redirects to and renders the exact app dashboard instead of plaintext `Not Found` |
| Data boundary | PASS — no migration, notification deletion or read-state change; the only production preference writes were the four scheduled legacy cursor initializations |
| Deployment boundary | UNCHANGED — no DNS or Sites release; Sites v86 remains live and saved v94 remains unpublished |

Worker 163 closes the previously recorded monitoring-frequency gap. The
existing five-minute scheduler now dispatches only due preferences: immediate
after a successful daily source check, daily after one day and weekly after
seven days. Notification creation and cursor advance share one D1 batch, while
deterministic digest IDs make retries safe. Monitoring email remains
intentionally unavailable until a dedicated retry-safe email outbox exists;
the API rejects it and the RU/UZ interface states that boundary.

## Worker 162 Anthropic recovery and notification-fan-out closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `75064bee61909baa0e1a05dabdedc6268f86ed29` on Draft PR `#64` |
| Regression coverage | PASS — 81/81 focused monitoring/dashboard tests; full local `npm test`, lint, type-check and bounded production artifact validation passed |
| GitHub Actions CI `33148425519` | PASS on exact `75064bee` — Website 2m15s and Platform 6m57s; Platform included rendered 35/35, core 1101/1101, Cloudflare/infrastructure 202/202 and deployable artifact checks |
| Platform deployment | PASS — Worker 162 `d2146684-bd77-4a33-a2a2-8d47042e473e`, deployment `0c8ec9f3-cd7f-4a0c-9e99-e0b1d91fc998`, 100%; Worker 161 `34c54357-0878-4637-b533-1fa1afa36336` is rollback |
| Anthropic recovery | PASS — a fresh scheduled probe recorded Anthropic operational with no safe error at `2026-08-28T06:47:17.754Z`; document analysis remained operational |
| Production health | PASS — `status.juro.uz` and `app.juro.uz` agreed on 8/8 operational at `2026-08-28T06:49:05.922Z` |
| Fan-out diagnosis | CONFIRMED — before Worker 162, delivery-time RSS `pubDate` churn produced repeated metadata-change events and 222,329 `legislation_monitor` notifications; the last Worker 161 retry at `06:40:50.995Z` added 800 rows |
| First post-release retry | PASS — Worker 162 processed 40/40 Lex RSS metadata rows at `06:45:53.618Z`, recorded `changed=0` and `error=0`, and notification count remained exactly 222,329 with no later `created_at` |
| Authenticated Chrome | PASS — the real Individual dashboard displays `99+ новых событий` with accessible label `Более 99 новых событий`, replacing the prior 47,544 exact-count rendering |
| Data boundary | PASS — no migration, manual D1 mutation, notification deletion or read-state change; historical rows remain intact. Verification queries were read-only |
| Deployment boundary | UNCHANGED — no DNS or Sites release; Sites v86 remains live and saved v94 remains unpublished |

Worker 162 removes RSS delivery time from the stable fingerprint, treats only a
real title change as a customer event, writes metadata/events/one per-recipient
digest atomically and uses deterministic retry-safe IDs. The dashboard count is
bounded at 100 and represented as `99+`; this prevents an unbounded count scan
without rewriting user-owned notification history. Worker 163 subsequently
closed the monitoring-preference frequency gap; this section remains as the
Worker 162 release checkpoint.

## Worker 161 Anthropic health diagnostic

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `316ef335a0dfd0e1acd57be2e4cfd014d53be01f` on Draft PR `#64` |
| Focused regression | PASS — 10/10 safe Anthropic error-classification tests; raw provider messages are neither returned nor logged |
| Full local release gate | PASS — lint, type-check, core 1099/1099 and Cloudflare/infrastructure 202/202; the bounded production build also completed during deployment |
| GitHub Actions CI `33144330811` | PASS on exact `316ef335` — Website 2m10s and Platform 8m38s |
| Platform deployment | PASS — Worker 161 `34c54357-0878-4637-b533-1fa1afa36336`, deployment `72c5d2be-e417-4dcf-a4eb-8022a59a1b61`, 100%; Worker 160 `3d029e81-c477-4215-b182-356985b00e6a` is rollback |
| Provider diagnosis | BLOCKED EXTERNALLY — the 10:35 Tashkent scheduled probe classified Anthropic's HTTP 400 as `PROBE_PROVIDER_HTTP_400_INVALID_REQUEST_ERROR_CREDIT_BALANCE_LOW`; no secret, prompt or provider message was recorded |
| Production health | DEGRADED — `status.juro.uz` and `app.juro.uz` agreed on 6/8 operational at `2026-08-28T05:36:31.571Z`; only `ai` and `document_analysis` were degraded, while OpenAI and the Lawyer area remained operational |
| Exact screenshot route | PASS — the Lawyer-host URL returns private/no-store `307` to the exact app path; isolated Chrome reached the localized Client login with the requested path retained, one H1, one main landmark, no horizontal overflow and private `noindex` metadata rather than plaintext `Not Found` |
| Chrome diagnostics | OBSERVED — the Cloudflare Turnstile frame reported its known deprecation/CSP/Quirks issues, and two opaque `NaN` console entries had no attributable source; the JURO login document rendered successfully, so no clean-console claim is made for this replay |
| Deployment boundary | UNCHANGED — no production D1 write, migration, DNS or Sites change; Sites v86 remains live and saved v94 remains unpublished |

This section is retained as point-in-time incident evidence. API credit was
subsequently restored and Worker 162's fresh scheduled probes returned the
current 8/8 operational state recorded above. Rotating the key or changing the
model was not required.

## Worker 158 Admin interaction-floor closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `93bb6abf48478af8de5bb86bbc38df3e6dcdbe15` on Draft PR `#64` |
| Focused regression | PASS — 12/12 Platform accessibility contracts, including the non-corpus Admin 44 px source guard |
| Full local release gate | PASS — lint, type-check, production build, artifact budgets, rendered Worker 35/35, core 1098/1098 and Cloudflare/infrastructure 201/201 |
| GitHub Actions CI `33136790049` | PASS on exact `93bb6abf` — Website 2m15s and Platform 6m32s |
| Platform deployment | PASS — Worker 158 `6ebf3a20-ca4d-4751-8283-22bcc9b10988`, deployment `f7e89714-43be-4450-b232-6b988e8f7f86`, 100%; Worker 157 `2ec24c74-57b9-4c66-8afa-372cceb24767` is rollback |
| Delivered asset | PASS — production `/assets/index-C92iLqdd.css` returns `200` and contains the Admin retry, knowledge-base and cost-checkbox selector group with a 44 px floor |
| Protected-role boundary | PASS fail-closed — anonymous Admin console and costs requests return non-cacheable `303` handoffs to the app Admin surface without privileged content |
| Production Chrome | PASS for the anonymous boundary — isolated Chrome reached the protected re-authentication screen with one H1, one main landmark, no horizontal overflow, no console warnings/errors and no staff-data disclosure |
| Production health | PASS — both status endpoints agreed on 8/8 operational and zero active/recent incidents at `2026-08-28T02:53:33.522Z` |
| Deployment boundary | UNCHANGED — no production D1, DNS or Sites change; Sites v86 remains live and saved v94 remains unpublished |

Worker 158 raises confirmed non-corpus Admin controls: shared retry buttons,
Knowledge Base header/fieldset actions and the Cost console checkbox target.
Legal-source review controls were intentionally excluded from this iteration.
This proves source delivery and the fail-closed anonymous boundary; it is not a
signed-in Admin route-loop or a blanket WCAG conformance claim.

## Worker 157 Lawyer interaction-floor closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `67bd679e39e2ce2357d879cc7d806e53e4ce2651` on Draft PR `#64` |
| Focused regression | PASS — 11/11 Platform accessibility contracts, including the Lawyer professional-workflow 44 px source guard |
| Full local release gate | PASS — lint, type-check, production build, artifact budgets, rendered Worker 35/35, core 1097/1097 and Cloudflare/infrastructure 201/201 |
| GitHub Actions CI `33134728801` | PASS on exact `67bd679e` — Website 2m28s and Platform 8m47s |
| Platform deployment | PASS — Worker 157 `2ec24c74-57b9-4c66-8afa-372cceb24767`, deployment `62266f40-fe05-423b-9916-7c4220bf66d3`, 100%; Worker 156 `b361ae62-1220-4fa3-b480-488d4791bda4` is rollback |
| Delivered asset | PASS — production `/assets/index-CLgXbjP1.css` contains both Lawyer workspace and consultation target selectors with the 44 px floor |
| Protected-role boundary | PASS fail-closed — anonymous Lawyer workspace API is `401`; a Client session is sent to the dedicated Lawyer re-authentication surface without Client-data disclosure |
| Production Chrome | PASS for the re-authentication boundary — complete document, one H1, one main landmark and no horizontal overflow; signed-in Lawyer workflow rendering remains unverified because no production Lawyer session was fabricated |
| Production health | PASS — both status endpoints agreed on 8/8 operational and zero active/recent incidents at `2026-08-28T02:14:34.121Z` |
| Deployment boundary | UNCHANGED — no production D1, DNS or Sites change; Sites v86 remains live and saved v94 remains unpublished |

Worker 157 raises the confirmed professional workflow controls in Lawyer
offers, messages, AI assist, internal notes, consultations, scheduling,
knowledge, time tools and source links. This proves source delivery and the
fail-closed production boundary; it is not a signed-in Lawyer route-loop or a
blanket WCAG conformance claim.

## Worker 156 document-comparison interaction-floor closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `7123fb4b842c0d006f82a83b0e72263a0088020c` on Draft PR `#64` |
| Focused regression | PASS — 11/11 Platform product-UX contracts, including the document-comparison 44 px source guard |
| Full local release gate | PASS — type-check, lint, production build, artifact budgets, rendered Worker 35/35, core 1096/1096 and Cloudflare/infrastructure 201/201 |
| Document-comparison smoke | PASS — upload, three-change comparison, decision, PDF/DOCX export, download, tenant isolation, MIME/same-file rejection, monitoring, search and deletion; no production D1 write was used |
| GitHub Actions CI `33132278871` | PASS on exact `7123fb4b` — Website 2m29s and Platform 8m35s |
| Platform deployment | PASS — Worker 156 `b361ae62-1220-4fa3-b480-488d4791bda4`, deployment `caaa6ee7-ec98-4ef8-80ac-7643cb2f53ca`, 100%; Worker 155 `eb132328-68c2-48f3-95d4-90cac0962119` is rollback |
| Production Chrome at `320×800` | PASS — the comparison refresh control is exactly `44×44` CSS px; document width 305 px inside the viewport, no horizontal overflow |
| Production Chrome at `390×844` | PASS — the same control is exactly `44×44` CSS px; document width 375 px inside the viewport, no horizontal overflow |
| Browser diagnostics | PASS — no Chrome console errors after the production replay |
| Production health | PASS — 8/8 operational, zero active/recent incidents at `2026-08-28T01:26:35.918Z` |
| Deployment boundary | UNCHANGED — no production D1, DNS or Sites change; Sites v86 remains live and saved v94 remains unpublished |

Before the correction, the refresh control measured about `19.6×42` px at
320 px and `23.4×42` px at 390 px because its flex item could shrink. The
production replay proves the corrected named workflow, not blanket WCAG
conformance or assistive-technology behavior. Screenshots:
`docs/investor-ready/screenshots/before/client-document-comparison-touch-target-320.png`
and
`docs/investor-ready/screenshots/after/client-document-comparison-touch-target-320.png`.

## Public website automated accessibility candidate

| Gate | Result |
| --- | --- |
| Runner | PASS — pinned `@axe-core/playwright` 4.13.0 with `playwright-core` 1.62.1; only the installed Google Chrome channel is launched |
| Artifact boundary | PASS — the harness serves the exact verified `dist/client` assets and delegates documents to the built ESM Worker |
| Standards tags | WCAG 2.0 A/AA, WCAG 2.1 A/AA and WCAG 2.2 AA automated axe rules |
| Desktop light | PASS — home, Trust, Lawyers, Legal Center, privacy policy, knowledge article and video in RU, UZ and EN |
| Desktop dark | PASS — RU home, Trust, Lawyers, Legal Center, privacy policy, knowledge article and video |
| Mobile light `390×844` | PASS — home, Trust, Lawyers, Legal Center, privacy policy, knowledge article and video in RU, UZ and EN |
| Mobile dark `390×844` | PASS — RU home, Trust, Lawyers, Legal Center, privacy policy, knowledge article and video |
| Aggregate | PASS — 56/56 route/profile combinations, zero automated violations; non-video pages retained two manual-review candidates and video retained three |
| Readable visible text | PASS — the runner rejects any visible public text below 12 CSS px and the static source gate rejects explicit smaller `px`/`rem` declarations; all 56 profiles passed after 77 declarations in 12 stylesheets were raised |
| Corrected surfaces | Public-home action, decision-map, legal-basis/risk/next-step and handoff copy; document tabs; resource/FAQ metadata; Trust data-route/status copy; Lawyer metadata/filters/actions; Legal Center and knowledge actions/dark theme; footer and mobile-menu controls |
| Functional/build gate | PASS — verified build plus 47/47 functional tests, including the new explicit CSS-size source guard |
| Skip-focus regression | PASS — every one of the 56 exact-built route/profile samples activates the skip link and requires focus to land on `#main-content` |
| Manual Chrome sample | PASS locally on exact built assets — retained RU keyboard/theme samples plus the revised RU home at `1280×900` and EN home/UZ Trust at `390×844` kept the correct language, one H1, one main target, zero horizontal overflow and no visible text below 12 px; dense decision-map and handoff labels did not clip |
| GitHub Actions CI `33122475415` | PASS on exact readable-text source commit `5bdd905884834657cdb7223fc9419774c4085e61` — Website 2m15s and Platform 8m42s |
| Readable-text source | PASS locally — commit `5bdd905884834657cdb7223fc9419774c4085e61` |
| Saved Sites candidate | PASS — version 94 from exact Sites source commit `6f5c70f947df14597cca2e289c3b38bbd36b589d`; canonical archive hash `sha256:5896ac705db3ade8f7dcee18e7c8ed1520bbed5c19aa19dc301695ea2ff4d51b`, 83 files; saved version 93 is superseded |
| Public deployment boundary | UNCHANGED — version 94 is saved only; successful public deployment `appgdep_6a9027658100819189e6e6bc1a20bf1d` still owns version 86 |

This is saved-candidate evidence, not deployed-Sites evidence and not a blanket
WCAG conformance statement. The named Chrome keyboard/accessibility-tree sample
is retained, but the remaining authenticated workflows and assistive-technology
behavior remain manual release checks.

## Worker 155 status metadata and same-origin asset closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — status localization `e2af1460cf6d79ce2ffaba3921dcf26c5f4878b6`; host-aware asset metadata `fcdb9e6f77ab5ee95f97314c939b780c3fcfdf4b` |
| Focused/static gates | PASS — root layout 2/2, type-check and lint |
| Full local release gate | PASS — development build, rendered HTML 35/35, artifact budgets, core 1095/1095 and Cloudflare/infrastructure 201/201 |
| GitHub Actions CI `33129369444` | PASS on exact `fcdb9e6f` — Website 2m30s and Platform 6m48s |
| Platform deployment | PASS — Worker 155 `eb132328-68c2-48f3-95d4-90cac0962119`, deployment `24e52e75-c687-4d12-9b9c-3f9c7d3e0cd4`, 100%; Worker 154 `3efdad51-d6c1-47f0-ad5b-fb24cd2adc99` is rollback |
| UZ Chrome root | PASS — localized title, `html[lang=uz]`, `main[lang=uz]`, one H1/main, loaded fonts, private noindex, no overflow and an empty warning/error/issue log |
| RU Chrome route | PASS — localized title, `html[lang=ru]`, `main[lang=ru]`, one H1/main, loaded fonts, private noindex, no overflow and an empty warning/error/issue log |
| Icon/CSP boundary | PASS — favicon and Apple icon resolve on `status.juro.uz`, return `200 image/png`, and no CSP issue remains; no `unsafe-eval` or cross-origin image exception was added |
| Status route fence | PASS — sampled Client route on the status host remains `404` |
| Production health | PASS — 8/8 operational, zero active/recent incidents at `2026-08-28T00:30:50.972Z` |

The exact Lawyer-host screenshot URL was also replayed in a clean Chrome
session. It reached the localized Client login at `app.juro.uz` with one H1 and
main, loaded fonts, no overflow and private noindex metadata rather than a
plaintext `Not Found`. The main document is in Standards Mode. CSP/eval and
Quirks diagnostics attached to the third-party Cloudflare Turnstile challenge
document are retained as provider-frame observations; JURO CSP was not weakened
to suppress them.

## Authentication error-association release

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `742ee6f2f7583a61b242310c79d1ef61cd1ecc9a` on Draft PR `#64` |
| Error ownership | PASS — Email, OTP and MFA failures set `aria-invalid` and share the stable atomic alert through `aria-errormessage` plus `aria-describedby`; resend failures are associated with the resend action rather than mislabelling the OTP input |
| Terminal challenge recovery | PASS — terminal OTP/MFA failures return to the email step and move the error relationship to the newly focused email field |
| Focused regression | PASS — 2/2 auth accessibility source-contract tests |
| Local Platform gates | PASS — type-check, lint, development build, rendered smoke, deployable artifact and budgets, full core 1094/1094 and Cloudflare/infrastructure 201/201 |
| GitHub Actions CI `33125681307` | PASS — Website 2m22s and Platform 8m34s, including locked installs, lint, types, tests, artifacts, Cloudflare matrix, production-dependency audit and licence policy |
| Production boundary | PASS for source delivery — deployed in Worker 153 and retained in Worker 157; the exact production auth asset contains `aria-errormessage`, `aria-invalid`, `aria-atomic` and the stable `auth-error` target |

No email, OTP, MFA code or consent was submitted for this release. The source,
exact production asset and automated gates prove the delivered association
contract, not live screen-reader announcement after an asynchronous error.

## Lawyer catalogue performance and public-photo candidate

| Gate | Result |
| --- | --- |
| Live v86 mobile traces | OBSERVED — three `390×844`, 4× CPU, Fast 4G reloads: LCP 2,818 / 1,154 / 1,380 ms; TTFB 1,856 / 240 / 198 ms; CLS 0.00 / 0.00 / 0.0004 |
| Live image delivery | FAIL in v86 — 419×419 PNG, 82,109 bytes, displayed at about 80×80; 81 kB estimated waste; response incorrectly `private, no-store` |
| Source correction | PASS locally — only fixed 128/288 px WebP variants are requested; the production Worker cache is enabled; only the exact approved public-photo route receives public cache policy; private photo/API routes remain excluded |
| Focused regression | PASS — platform photo-policy 4/4; website production contracts 24/24 after adding locale-aware year grammar |
| Static gates | PASS — Platform type-check/lint, generated Cloudflare types, three-environment matrix, rendered 35/35, full core 1094/1094, infrastructure 201/201 and production artifact budgets; Website type-check/lint, verified build/artifact and full 46/46 suite |
| GitHub Actions CI `33104695509` | PASS — Website 50s and Platform 8m40s, including tests, deployable artifacts, Cloudflare matrix, production-dependency audit and licence policy |
| Platform deployment | PASS — Worker 152 `47671380-a8fe-4d8c-95e2-bd7778541b0c`, deployment `61882723-0234-4614-bd66-c0ad2b862ba3`, 100%; Worker 151 is rollback |
| Live public-photo verification | PASS on Worker 152 — original 82,109-byte PNG is publicly cacheable; the approved 128 px WebP is 2,106 bytes (97.4% smaller) and changed from `MISS` to `HIT` on repeat; invalid variants retain the original; an unknown UUID is `404`, `no-store`, `BYPASS` |
| Production health | PASS at capture — 8/8 operational, zero active/recent incidents at `2026-08-27T18:55:37.826Z`; error-only tail stayed empty after photo and routing probes |
| Controlled Lighthouse | PASS — Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100; 58 passed, 0 failed; reports in `docs/qa/artifacts/performance-sites-v86-lawyers/` |
| Accessibility snapshot | PASS for high-level semantics — one H1, labelled filters and named actions; it found the corrected RU grammar defect `4 лет` |
| Sites production status | PARTIAL — public Sites v86 still requests the original 82,109-byte PNG and still predates the RU grammar fix; a superseding Sites version remains required for end-user WebP delivery |

The first trace's server-latency outlier is retained. Two passing repeats do not
erase it or prove field performance. Worker 152 now provides the bounded WebP
and cache behavior, but the end-user catalogue remains on Sites v86 and will
request the smaller variant only after a superseding public Sites release.

## Worker 151 responsive Turnstile and Client target closure

| Gate | Result |
| --- | --- |
| Exact source | PASS — commits `6fa7835e`, `a6008f43` and final Turnstile commit `0bdfe7c04830752e06049ace7afc7575db267499` on Draft PR `#64` |
| Focused regression | PASS — 15/15 Turnstile and UI-resilience tests; the earlier Client target suite passed 10/10 |
| Local release gates | PASS — type-check, lint, full core 1090/1090, Cloudflare/infrastructure 201/201, production build/artifact and all emitted-asset budgets |
| GitHub Actions CI `33090467509` | PASS — Platform 8m29s and Website 41s |
| Production deployment | PASS — Worker 151 `8a9accf5-31e6-4947-ab34-e0317b26e61e`, deployment `a47ee184-655b-4ae5-af16-add701e1083a`, 100%; Worker 150 `ab61380a-4045-4283-80f0-d5bcc1144be8` is rollback |
| Production health | PASS at capture — `overallStatus=operational`, all eight components operational, zero active/recent incidents at `2026-08-27T16:06:24.644Z` |
| Client target replay | PASS for six affected authenticated routes — Cases, Action plan, History, Profile, Security and Notifications exposed no sub-44 px target after Worker 150/151. The remaining 21 px search input is nested in a 44 px label target |
| Desktop Chrome trace | PASS — login LCP 521 ms (TTFB 310 ms, render delay 211 ms), CLS 0.02, no horizontal overflow; render-blocking estimate was 0 ms for FCP/LCP |
| Mobile Chrome trace | PASS — emulated Chrome 320x800, LCP 248 ms (TTFB 92 ms, render delay 156 ms), CLS 0.00, document `320/320` with no horizontal overflow, 296 px card and 150 px compact Turnstile |
| Responsive breakpoint replay | PASS — changing the same live tab from 320 px to desktop caused `ResizeObserver` to replace compact with flexible Turnstile without page overflow |
| Lighthouse snapshot | PASS — Lighthouse 13.4.1: Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100; 33 passed, 0 failed. Reports: `docs/qa/artifacts/lighthouse-worker151-login/` |
| Exact screenshot route | PASS — `lawyer.juro.uz/ru/individual/dashboard?qa=worker151` returns non-cacheable `307` to the exact `app.juro.uz` path; unauthenticated Client and Lawyer routes retain their own login destinations and Admin retains the protected `303` handoff |
| Protected-role boundary | PARTIAL — the preserved Lawyer and Admin Chrome tabs still require the user to establish the corresponding authenticated sessions before their current route loops can be replayed |

The Lighthouse snapshot and two lab traces establish the named deployed login
state only. They do not supply field CrUX data, INP evidence, screen-reader
coverage or a blanket WCAG conformance result.

## Worker 148 Lawyer-host Client-link correction

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `b4c472332e49b9750ec696652281670efb89bb9b` |
| Focused host-routing tests | PASS — 6/6 |
| Rendered Worker tests | PASS — 35/35 |
| Local release gates | PASS — full test command, lint, type-check, three-environment Cloudflare matrix, production artifact budgets and 730-package licence policy |
| GitHub Actions CI `33071334033` | PASS — Website and Platform |
| Production dry-run | PASS — required secrets present, production resources isolated and Container rollout disabled |
| Production deployment | PASS — Worker 148 `28dd4ac8-1ae2-4582-9697-8aa28e109cb5`, deployment `76e6f966-d069-4565-a7f9-9b2103a8ea47`, 100%; Worker 147 is rollback |
| Exact screenshot route | PASS over HTTP — `lawyer.juro.uz/ru/individual/dashboard` returns non-cacheable `307` to the exact `app.juro.uz` path |
| Query and method fence | PASS — `HEAD` retains query; cross-host `POST` returns `404` without `Location` |
| Fail-closed Lawyer boundary | PASS — unknown path remains `404`; canonical Lawyer dashboard retains its Lawyer-host login destination |
| Production health | PASS at capture — 8/8 operational, no incident at `2026-08-27T12:35:10.086Z` |
| Error-only tail | OBSERVED — one deployment-time `MalwareScannerContainer` Durable Object reset caused by the code update; no route failure was observed and status remained operational |
| Exact Chrome replay | PASS — a fresh reload of the original failing URL followed the live redirect to the authenticated Client dashboard at `app.juro.uz`. At 1920×945 it rendered one localized H1 with loaded fonts, private noindex metadata, zero overflow, no role alert and an empty warning/error log |

## Authenticated Client route and responsive smoke

An existing production Individual session was used read-only in Chrome to visit
21 Client routes: dashboard, AI chat, document builder, document review, cases,
documents, document comparison, action plan, calendar, archive, history,
consultations, lawyers, monitoring, notifications, billing, profile, settings,
security settings, privacy settings and help.

| Gate | Result |
| --- | --- |
| Desktop route loop | PASS — 21/21 retained the authenticated application shell, rendered one H1 after asynchronous settling, loaded fonts, exposed no role alert and had no horizontal overflow |
| Mobile route loop | PASS — 21/21 at `390×844` retained one H1, loaded fonts, exposed no role alert or horizontal overflow, kept the closed navigation inert/hidden and showed the mobile menu control |
| Mobile keyboard menu | PASS — opening moved focus to the close control; Escape closed the menu and restored focus to the trigger |
| Private indexing boundary | PASS — all sampled application documents declared `noindex, nofollow, nocache` |
| Chrome warning/error log | PASS — zero warning/error entries across the desktop route loop |
| Misplaced Client link replay | PASS on 2026-08-28 — the original `lawyer.juro.uz/ru/individual/dashboard` URL again reached the exact authenticated `app.juro.uz` Client dashboard; the rendered page had one H1, one main landmark, loaded fonts, private noindex, zero overflow, no role alert and no warning/error log |
| Individual → Business URL boundary | PASS for RU and UZ — direct Business dashboard attempts returned to the matching localized Individual dashboard, exposed no sampled Business-only signal and retained one H1, one main landmark, loaded fonts, private noindex, zero overflow, no role alert and no warning/error log |
| Lawyer boundary | PARTIAL — `/ru/lawyer/dashboard` reached the dedicated Lawyer login with the expected Lawyer account type and return path; authenticated route replay requires a signed-in Lawyer session |
| Admin boundary | PARTIAL — `/ru/admin/console` reached the protected fresh-session handoff; authenticated Admin replay requires a fresh protected session |

No form was submitted, no file was uploaded and no production record was
created or changed. This browser pass did not provide complete request-level
network error coverage, so it is not represented as full workflow or API
verification. Authenticated Business functionality and authenticated
Lawyer/Admin routes remain outside this checkpoint; only the Individual-role
containment of direct Business URLs is proven here.

## Worker 147 font-path correction

| Gate | Result |
| --- | --- |
| Exact source | PASS — commit `6503667cbf18f249656b29749040cda8b200fd47` |
| Focused normalizer tests | PASS — 3/3 |
| Local static gates | PASS — lint, type-check, production build, artifact validation and performance budgets |
| GitHub Actions CI `33063995387` | PASS — Website and Platform |
| Production dry-run | PASS — production bindings isolated; required secrets present; Container rollout disabled |
| Artifact path regression | PASS — zero `C:/Users/` and zero `.vinext/fonts` matches |
| Production deployment | PASS — Worker 147 `ed0253e1-1c35-416e-9f2a-5bd8352c1936`, deployment `6f536ee9-9666-41bb-b0f3-6f174019692b`, 100% |
| Production HTML and fonts | PASS — zero absolute path matches, 12 normalized font URLs, three sampled WOFF2 files `200 font/woff2` |
| Host/access smoke | PASS — expected Client `307`, API `401`, Lawyer `200/307`, Admin `303`, Status `200`, fenced application path `404` |
| Production health | PASS at capture — 8/8 operational, zero active incidents at `2026-08-27T11:02:55Z` |
| Chrome Status | PASS — complete DOM, fonts loaded, no absolute path, no warning/error log |
| Chrome authenticated Client dashboard | PASS — primary UI rendered, fonts loaded, no absolute path, no warning/error log |
| Worker error tail | PASS for smoke window — no error event observed |

The immediate Worker rollback is version 146
`c3237f9e-a258-42eb-8b94-62f5045b7b03`. Rollback would restore service code
but also restore the disclosed font path, so it is an incident-only fallback.

## 2026-08-25 release baseline

## Automated gates

| Gate | Result |
| --- | --- |
| Development deployable build | PASS |
| Rendered Worker/HTML suite | 34 passed, 0 failed |
| Core platform suite | 1083 passed, 0 failed |
| Cloudflare/config/queue suite | 201 passed, 0 failed |
| TypeScript type-check | PASS |
| ESLint | PASS |
| Migration safety and isolated restore | PASS; all migrations through 0159 apply, FK clean |
| Production artifact | PASS |
| Git diff whitespace check | PASS |
| GitHub Actions CI `32816221498` | PASS; Website and Platform |
| Website dependency hardening | PASS; 42/42 tests, type-check, lint, licence policy, artifact validation and 0 production audit vulnerabilities |
| Standard repository security scan `df6f1247-116c-42b8-b233-a693efb52263` | PASS within stated boundary; immutable `e4f407a8`, 1,898 tracked files, 8/8 planned surfaces, 0 reportable findings, PARTIAL coverage |
| Hardening diff scan `a2cb0d4a-7512-4b0a-aa5e-362681007619` | PASS; complete changed-source coverage for `e4f407a8..81aaf408`, 0 reportable findings |
| GitHub Actions CI `32829635485` | PASS on exact website source commit `81aaf408`; Website and Platform successful |
| Website metadata closure | PASS; 43/43 tests, type-check, lint, licence policy, artifact validation and 0 production audit vulnerabilities |
| Metadata diff scan `fa1b3e34-235b-48e6-8fb4-41e9f731f210` | PASS; complete changed-source coverage for `33d7f8e3..ee0687af`, 0 reportable findings |
| GitHub Actions CI `32836146215` | PASS on exact public source commit `ee0687af`; Website and Platform successful |
| Social-preview diff scan `1985bd83-d685-4ae3-8978-60f4f469d1e7` | PASS; complete changed-source coverage for `3f2bf72e..d0310b90`, 0 reportable findings |
| GitHub Actions CI `32838994132` | PASS on exact public source commit `d0310b90`; Website and Platform successful |

The production artifact stayed inside the checked-in regression budgets:
591.9 KiB CSS (600 KiB limit), 295.3 KiB initial browser JavaScript (320 KiB),
208.1 KiB largest lazy-route increment (240 KiB), 453.6 KiB fonts (512 KiB),
564.4 KiB images (640 KiB) and 3771.3 KiB Worker entry (6144 KiB).
These are emitted raw-byte budgets, not transfer sizes or Core Web Vitals.

## Production checks

- Four POST HTTP probes returned exact 308 HTTPS redirects with no-store.
- Client and Lawyer HTTPS login returned 200 with HSTS/noindex/no-store.
- Admin returned the expected 303 protected-session handoff.
- Status returned 200 and `overallStatus=operational` with eight operational
  components and no incidents.
- Unknown signed-share verification returned 410 `LINK_EXPIRED`, no-store and
  no session cookie.
- In-app browser DOM snapshots verified RU Client, UZ Client and the dedicated
  RU Lawyer login persona with labelled controls.
- Public sitemap crawl: 78/78 canonical URLs ended in 2xx, with no unexpected
  redirect or broken URL; every route also had exact canonical, complete
  RU/UZ/EN hreflang, explicit Open Graph title and expected indexability.

## Coverage boundaries

The earlier Codex Security scan was sealed as partial by risk-surface coverage
and found two medium/high-confidence signed-share issues; both are remediated
in this release. The later whole-repository Standard scan targeted immutable
`e4f407a8`, closed 8/8 planned surfaces and retained zero reportable findings.
It is still classified PARTIAL because independent delegated review, TAC and
destructive production testing were unavailable. Neither scan is represented
as an exhaustive proof that no vulnerability exists.

No live share existed in production, so the fifth-failure 429 path was not
rehearsed against user data. Worker 151 now has a Lighthouse snapshot plus
desktop and 320 px Chrome traces for the login surface, but that bounded lab
evidence does not cover field CrUX, INP, every application route or
screen-reader behavior. Physical iOS/Android, Edge, Firefox, Safari/WebKit and
native page zoom remain intentionally not tested under the current QA boundary.

Post-deploy public QA for Sites version 82 verified affected RU/UZ/EN legal,
lawyer and video DOM states, canonical/hreflang/Open Graph/Twitter metadata, no
horizontal overflow, an empty in-app browser log, 78/78 sitemap URLs passing
every checked SEO/social field, canonical `robots.txt`, public security headers, private
app/lawyer/admin no-store/noindex boundaries and an operational 8/8 status
response. CDP screenshot capture timed out and is not claimed as evidence.

## 2026-08-27 public Sites performance expansion

Live Sites v86 RU-home Chrome evidence passed the goal thresholds under a
`390×844` mobile/touch, 4× CPU and Fast 4G profile: LCP 1,956 ms, TTFB 234 ms
and CLS 0.0001. A separate 16-second observer recorded CLS 0.0012. Controlled
Lighthouse 13.4.1 scored 100 Accessibility, 100 Best Practices, 100 SEO and
100 Agentic Browsing, with 59 passed and 0 failed. The raw JSON/HTML reports
and hashes are in `docs/qa/artifacts/performance-sites-v86/`.

Production v86 also revealed conditional revalidation on every fingerprinted
static asset. Commit `5d543218` fixes both current `/_next/static/*` and newer
`/assets/*` output while leaving HTML non-cacheable. Local website type-check,
lint, production build, artifact validation and 44/44 tests passed. GitHub CI
`33095467495` passed Website in 51 seconds and Platform in 7 minutes 34
seconds. Sites v87 was saved from exact runtime commit `a60df03f` but is not
represented as live until the required public-deployment approval and
post-deploy checks complete.

## 2026-08-27 local plaintext backup cleanup

The two price-configuration SQL exports and two manifests were downloaded again
from private R2 prefix
`d1/juro-production/20260825T074158Z-price-config-f42c48fc/`. Each file matched
its recorded byte size and SHA-256 value. The exact local source directory and
temporary verification directory were deleted after that proof; both
`Test-Path` checks returned false and exact parent-directory match counts were
zero. The private R2 objects remain the recovery source.

## 2026-08-28 public homepage motion checkpoint

| Gate | Result |
| --- | --- |
| LCP content contract | PASS — the hero lead remains server-rendered and is no longer included in the delayed support animation |
| Layout read/write contract | PASS — `JuroMotionDirector` measures geometry before any scroll-frame DOM/style mutation; the initial measurement waits until the motion-ready style change has painted |
| Focused regression suite | PASS — 25/25 |
| Full website suite | PASS — 48/48 |
| TypeScript | PASS |
| ESLint | PASS |
| Production build and artifact validation | PASS |
| Accessibility smoke | PASS — desktop/mobile, light/dark and RU/UZ/EN route matrix; manual-review candidates remain explicitly manual |
| Live Sites v86 mobile baseline | PASS threshold — LCP 2,041 ms, TTFB 125 ms, CLS 0.00; 548 ms forced reflow remains measured |
| Local built-candidate mobile trace | PASS threshold — LCP 1,335 ms, TTFB 191 ms, CLS 0.00; total forced reflow 99 ms and landing-page attribution 2 ms |
| Live Sites v86 Lighthouse | PASS — Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100; 59 passed, 0 failed |
| Local candidate Lighthouse | BOUNDED PASS — Accessibility/SEO/Agentic Browsing 100; Best Practices 92 only because localhost CSP blocks canonical production favicon/manifest URLs |
| Production publish | NOT RUN — Sites v86 remains live; production after-measurement is still required |

The live and local traces used the same Chrome `390×844`, mobile/touch, 4× CPU
and Fast 4G profile, but different origins. The observed improvement is valid
pre-release evidence and is not represented as a production result.

### Trust and video route expansion

| Gate | Result |
| --- | --- |
| Live Trust mobile trace series | PARTIAL — LCP 3,726/1,551/1,803 ms, TTFB 1,891/117/121 ms and CLS 0.00/0.00/0.00; median passes, retained cold sample fails |
| Live video mobile trace | PASS — LCP 940 ms, TTFB 110 ms, CLS 0.00 |
| Live Trust Lighthouse | FAIL — Accessibility 96 because two light-theme text colors are below 4.5:1; other categories 100 |
| Built-candidate Trust Lighthouse | PASS for Accessibility — 100; the higher-contrast palette is already present in branch source |
| Candidate Best Practices | BOUNDED 92 — localhost-only CSP blocks canonical production favicon/manifest URLs; live route is 100 |
| Production correction | NOT LIVE — Sites v86 remains unchanged |

The production Trust accessibility failure is not hidden by the broader green
automated accessibility matrix. That matrix verifies the branch candidate;
this live Lighthouse pass demonstrates that the older Sites v86 runtime still
needs the already-saved contrast correction published and re-tested.
