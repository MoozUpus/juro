# Isolated staging admin domain

Status: deployed to staging. DNS/TLS and the Cloudflare Access boundary have
been verified by a read-only HTTPS response. The isolated console also exposes
the pending lawyer-review moderation queue through the same protected service
binding. The authenticated browser smoke remains pending: the in-app browser
blocks the domain locally with `ERR_BLOCKED_BY_CLIENT`, while the connected
Chrome profile redirects to Cloudflare login because it has no active Access
session. Neither condition is treated as a successful authenticated browser
test. This is not a production deployment or a claim that the full admin
surface is complete.

## Boundary

- Console Worker: `juro-admin-staging`, version
  `c686edaf-e284-4cce-bce2-d2553ca91f70`.
- Domain: `https://admin.staging.juro.uz`.
- Cloudflare Access application:
  `9c4710fc-99f8-4417-800b-974926196c21`; the sole allow policy is
  `014d5339-beda-45d3-b8d4-73ec8f06a0d6` for the staging owner.
- Platform Worker: `juro-platform-staging`, version
  `8c427b22-84c1-41ae-8c62-ac83ad7566aa`.
- The admin Worker has no D1, R2, Queue, AI or public platform session binding.
  Its only data path is the private `PLATFORM_ADMIN_API` service binding.

The platform issues a two-minute, hashed, one-use handoff ticket after
same-origin CSRF, `staff.console.view`, and fresh platform MFA. The admin
domain consumes that ticket into a distinct fifteen-minute host-only cookie.
Every admin API request rechecks the original session, active TOTP and current
staff assignment. Server logout revokes the separate D1 session before the
browser cookies are cleared. Raw app, ticket, CSRF and admin-session tokens are
never persisted.

`administrator` maps to `super_admin`; `legal_reviewer` maps only to
`lawyer_moderator`. A reviewer may open the pending lawyer-profile and
lawyer-review queues, approve or reject a review, and submit a bounded
redaction/reason. It cannot read the dashboard counts intended for
`super_admin`. The platform performs the update and writes both the immutable
moderation record and a tenant audit event in one D1 batch; the isolated Worker
never receives a D1 binding or raw session token.

## Migration and recoverability

Migration `0109_admin_domain_handoff_sessions.sql` was the sole remote D1
change. It is additive: handoff tickets, independent admin sessions, and
append-only admin-domain audit records (update/delete triggers reject writes).

Before application, full/schema/data `juro-staging` exports were stored under
private prefix `d1/juro-staging/20260806T230442Z/` in
`juro-staging-backups`, downloaded again, and byte-hash matched:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| pre-0109-full.sql | 3,449,558 | `6d7134b38df977caf647e78eee3794daeb27ffec18eb60670db67642f380824c` |
| pre-0109-schema.sql | 441,625 | `6d5b4c39c001da61dcc43da92934895474f9d0f3aee7aea33ffc9d16bb93ca8d` |
| pre-0109-data.sql | 3,007,965 | `6f5842e6aa1ea5821b20c81accc250451b284c33740263e525189fa2ca714ee9` |

The downloaded schema/data pair restored into isolated SQLite with 218 tables,
486 indexes, 291 triggers, 109 prior migration records, `quick_check=ok`, and
zero foreign-key violations. Remote `0109` then executed 12 D1 statements and
the subsequent migration list reported no pending entries.

The control-plane Time Travel bookmark request returned Cloudflare OAuth
`10000`; it is explicitly not counted as checkpoint evidence. A combined remote
`PRAGMA` postflight also hit D1 `SQLITE_NOMEM`; the verified portable restore is
the integrity evidence for this additive migration. No production D1, Worker,
route, secret or Access policy changed.

## Validation already completed

- `apps/platform`: `type-check`, lint, complete test suite (129 test groups),
  staging build and staging artifact validation.
- Admin Worker: TypeScript check and staging dry-run; the deployed binding set
  remains only the private platform service and non-secret staging variables.
- Handoff/moderation focused suite: 7/7, including one-use ticket, stale
  role/MFA denial, append-only audit, server-side logout revocation,
  reviewer capability boundaries, atomic moderation and PII rejection.
- Cloudflare deployment bound the admin Worker only to the staging service
  binding and custom domain.
- A read-only remote D1 query confirmed all three migration tables exist after
  `0109` (`adminTables=3`); the query made no database changes.
- `https://admin.staging.juro.uz/health` completes TLS and returns the
  Cloudflare Access challenge. A clean Chrome control connection reaches the
  Cloudflare login page, which proves the route is not a public Worker route;
  it has no active Access session and therefore cannot authenticate the admin
  flow. The in-app browser still reports `ERR_BLOCKED_BY_CLIENT` before the
  request reaches Access.

The initial browser request immediately after DNS route creation returned TLS
`ERR_SSL_VERSION_OR_CIPHER_MISMATCH`; that propagation condition is resolved.
Sign in to Cloudflare Access in the Chrome profile, then perform the read-only
`/health`, Access-denial, handoff and fresh-MFA browser checks before marking
the surface browser-verified.
