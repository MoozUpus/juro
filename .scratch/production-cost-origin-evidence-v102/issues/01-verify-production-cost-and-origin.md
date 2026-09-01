# Verify production cost and legacy-origin evidence

Status: resolved

## Scope

Produce a trustworthy production cost/routing baseline from content-free aggregates, confirm current provider recovery, refine the legacy-origin risk, and publish the results on the existing evidence Draft PR.

## Comments

- 2026-09-01: current public status reports 8/8 operational, with OpenAI at 3,467 ms and Anthropic at 7,198 ms.
- 2026-09-01: all five successful provider attempts after price-version go-live are priced; 44 earlier successes are unpriced because no applicable version existed; the priced sample is too small and stale to claim a current run rate.
- 2026-09-01: provider events and daily aggregates reconcile exactly; all read-only D1 checks reported zero written rows.
- 2026-09-01: `ftp.juro.uz` points directly to `95.46.96.77`, serves a default AlmaLinux/nginx page, presents certificates for other Webspace hostnames, accepts SMTP submission, and does not expose FTP port 21. Ownership and active clients remain unverified, so no mutation was made.
