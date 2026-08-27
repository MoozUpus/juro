# Changelog — ecosystem audit release through 2026-08-27

## Shipped to production

- Public website Sites v85 is live from runtime commit `7645f096`; deployment
  `appgdep_6a90125becc481918d66dcc53f333fe4`; Sites v84 is the immediate
  public rollback.
- Platform Worker version 147 (`ed0253e1-1c35-416e-9f2a-5bd8352c1936`),
  deployment `6f536ee9-9666-41bb-b0f3-6f174019692b`, is at 100% traffic;
  version 146 is the immediate application rollback.
- Generated vinext font URLs no longer expose absolute Windows build-machine
  paths. Production now emits `/assets/_vinext_fonts/...`, and the build gate
  rejects future `C:/Users/` or `.vinext/fonts` regressions.

- All JURO subdomains now redirect HTTP to the exact HTTPS URL with status 308
  before application or host routing.
- Standalone signed-PDF share verification now has a durable per-share
  five-attempt/15-minute lockout with `Retry-After` and atomic success cleanup.
- New standalone share tokens and access codes are AES-GCM protected with the
  existing identity keyring. Hashes remain lookup/comparison boundaries;
  plaintext columns remain empty for protected rows.
- D1 guards reject partial encryption metadata and mixed
  plaintext-plus-ciphertext states.
- Migration `0159_signed_share_verification_guard.sql` was applied after a
  verified pre-backup and followed by a verified post-backup.
- Platform production Worker advanced from rollback version
  `f91406c2-903b-438f-bafb-01a64f5af2b7` to
  `357d0438-1a5f-4b29-ba81-869cbc130c0a`.
- Public website dependency resolution now pins PostCSS `8.5.23` and Sharp
  `0.35.3`; production `npm audit` reports zero vulnerabilities.
- The earlier 2026-08-25 Sites version 82 checkpoint deployed exact 121-file
  source from `d0310b90`; version 81 was its rollback. At that checkpoint the
  Platform Worker remained version 146 because the follow-up did not change
  `apps/platform`.
- Zone origin encryption now uses explicit Cloudflare `Full (strict)` instead
  of automatic `Full`; the prior `Full` setting is the control-plane rollback.

## Verification

- Worker 147: focused font-normalizer tests 3/3, production build/dry-run,
  artifact validation, performance budgets, lint, type-check and GitHub CI
  `33063995387` passed. Production HTML has zero absolute path matches; sampled
  normalized fonts return `200 font/woff2`; Chrome Status and authenticated
  Client smoke completed with loaded fonts and empty warning/error logs.
- Post-deploy host smoke retained expected Client login redirects and private
  API `401`, Lawyer persona, Admin protected handoff, Status `200`, Status route
  fence `404`, 8/8 operational health and zero active incidents. Error-only
  Worker tail was empty during the smoke window.
- Sites v85: 78/78 sitemap URLs returned `200`; SEO and Accessibility were 100,
  LCP 777 ms and CLS 0 in the recorded unthrottled production trace. Website
  and Platform jobs passed in CI run `33063833408`.

- Local: rendered 34/34, core 1083/1083 and Cloudflare 201/201; lint,
  type-check, production build/artifact and migration safety passed.
- GitHub: CI run `32816221498` completed successfully for Website and Platform.
- Production: migration ledger empty, D1 foreign-key violations zero, four-host
  HTTPS enforcement passed, signed-share unknown-token fail-closed passed and
  public status was operational.
- Security: immutable whole-repository Standard scan
  `df6f1247-116c-42b8-b233-a693efb52263` closed 8/8 planned surfaces with zero
  reportable findings and explicit PARTIAL coverage. Exact hardening diff scan
  `a2cb0d4a-7512-4b0a-aa5e-362681007619` retained zero findings.
- Public hardening release: GitHub CI `32829635485` passed Website and Platform;
  42/42 local website tests, types, lint, 716-package licence policy and
  deployable artifact passed; production crawl returned 78/78 exact canonical
  URLs and status remained operational 8/8.
- SEO closure release: GitHub CI `32836146215` passed Website and Platform on
  `ee0687af`; 43/43 website tests and exact diff scan
  `fa1b3e34-235b-48e6-8fb4-41e9f731f210` passed. The expanded production
  crawl returned 78/78 exact canonical URLs, complete RU/UZ/EN hreflang,
  explicit Open Graph titles and expected indexability.
- Social-preview closure: GitHub CI `32838994132` and exact diff scan
  `1985bd83-d685-4ae3-8978-60f4f469d1e7` passed. Version 82 added the existing
  neutral JURO image to the 61 routes that lacked one; the final crawl returned
  78/78 complete Open Graph and Twitter preview contracts.
- TLS hardening: Sites reported active apex SSL, the four application hosts are
  Worker Custom Domains, and post-change probes passed all six production and
  three protected-staging HTTPS boundaries without a `526`; status remained
  operational 8/8 with no active incident at `2026-08-25T11:25:16.533Z`.
- Managed WAF verification: Cloudflare Security Settings showed the Free
  Managed Ruleset checked and `Always active`; its viewer listed 31 blocking
  rules. The scoped public-analytics rate limit remains active. No arbitrary
  custom rule was added merely to change the 0/5 custom-rule count.

## Not represented as complete

Lighthouse/Core Web Vitals, full manual keyboard accessibility, physical-device
QA and every authenticated write path were not re-run for this commit. Earlier
investor-ready evidence remains relevant, but these narrower gaps retain their
explicit status in the audit and QA documents.
