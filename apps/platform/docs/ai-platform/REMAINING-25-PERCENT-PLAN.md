# Remaining 25% execution plan

Updated: 2026-08-09. The plan is completion-first: no production deployment or UI activation is implied.

## Slice 1 — establish authenticated staging evidence

- Owner completes Cloudflare Access login at `https://staging.app.juro.uz/`.
- Confirm visible app shell, session routing and one read-only dashboard request use `juro-staging` rather than production.
- Record console, network-safe error codes and screenshots; never upload a real document or use production data.

Gate: authenticated owner-only staging route works and no request reaches production resources.

## Slice 2 — priority product journey

- Synthetic RU and UZ AI question → direct Lex/Advice cards → structured answer.
- Confirmed plan → case → task/deadline.
- Builder canonical route → immutable version → export.
- One synthetic DOCX → scanner → analysis → source references → case link; then two-version compare/redline.

Gate: tenant-scoped D1/R2/queue traces exist only in staging; cancellation/error paths are explicit and non-chargeable.

## Slice 3 — lawyer ecosystem and demo payment

- Synthetic pending profile → staff approval → marketplace card and booking gate.
- Synthetic request → conflict clearance → explicit scoped grant → offer.
- Demo checkout only: success, fail, cancel, refund and payout; no card fields, network call or production entitlement.

Gate: cross-workspace and unapproved-lawyer negative checks pass; every payment screen/object is visibly simulation-only.

## Slice 4 — quality and security matrix

- Desktop/mobile RU/UZ, keyboard, focus, reduced motion, 200% zoom, axe and visual checks for changed routes.
- Direct-source allowlist, SSRF, redirect, timeout, content-size and fabricated-citation checks.
- Admin fresh-MFA/role/audit checks, notification/email delivery proof, queue/DLQ and rollback rehearsal.

Gate: no unresolved critical security, route, accessibility or data-isolation issue remains.

## Slice 5 — production readiness only

- Produce rollback and migration evidence, exact change inventory and release report.
- Request two separate owner decisions: functional production deployment and Cinematic UI activation.

Gate: stop before production unless each approval is explicit and independent.
