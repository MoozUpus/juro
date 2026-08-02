# Staging 0070 — staff support inbox audit trail

Date: 2026-08-02

## Deployed change

The protected staff support inbox at `/ru/admin/support` and `/uz/admin/support`
uses the existing support ticket APIs. Detail access requires the
`support.tickets.manage` staff capability and a fresh MFA proof. Each successful
staff content view writes a `support_ticket_viewed` event in the existing
append-only `workspace_audit_events` table before any message content is
returned. Staff replies remain CSRF-protected and create a separate
`support_ticket_replied` event.

No support message text is included in audit metadata. User-facing ticket
access remains limited to the active workspace and original requester.

## Deployment evidence

- Environment: `staging`
- Worker: `juro-platform-staging`
- Worker version: `5dfab985-173c-48c0-9ddd-57c02c20c941`
- D1 binding: existing `juro-staging` (schema unchanged)
- Deployment command: `npm run deploy:staging`
- Staging route: `https://staging.app.juro.uz/ru/admin/support`

## Verification

- `npm --prefix apps/platform run type-check` — passed
- `npm --prefix apps/platform run lint` — passed
- `npm --prefix apps/platform test` — passed; static contract covers the staff
  capability, fresh MFA, bounded detail query, private cache headers, CSRF
  header, and `support_ticket_viewed` audit action
- `npm --prefix apps/platform run build:staging` — passed
- `npm --prefix apps/platform run validate:artifact -- --environment staging` — passed
- `npm --prefix apps/platform run test:cloudflare` — passed (91/91); verifies
  isolated bindings, migration integrity, queue fencing, and that secret files
  and secret bindings are excluded from the artifact
- `npx wrangler deployments list --env staging` — 100% traffic on the version
  listed above
- unauthenticated `HEAD` of the staging staff route — `302` to Cloudflare Access;
  Access was not bypassed

Authenticated browser and database-record verification remain release gates:
this environment's Cloudflare Access policy prevents automated browsing from
the current runtime. Production remains unchanged.
