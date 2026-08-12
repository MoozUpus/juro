# Resend integration

Updated: 2026-08-12

Resend is configured only as a server-side staging secret (`RESEND_API_KEY`).
OTP, security-email, and operations-alert workers use the configured
`EMAIL_FROM` identity; values are never read from Cloudflare or committed.
Provider-circuit and legal-corpus alerts use the server-only,
idempotency-keyed transport and separate content-free D1 job tables. A
recipient is a server-side runtime value, not a field in an alert-job record.
Secret presence, a successful build, or a provider response alone never proves
mailbox delivery.

## Local daily acceptance-probe candidate — pending staging deployment

The current local candidate adds a staging-only, content-free Resend
**acceptance** probe. It can run only when `APP_ENV=staging` and
`STAGING_SYNTHETIC_PROBES_ENABLED=true`. The scheduler may invoke it every five
minutes, but its per-day D1/idempotency key is derived from the UTC date, so
it sends at most one message per UTC day. It does not retain the recipient or
the email body in D1.

If Resend returns a valid provider message id, the probe records a fresh
technical acceptance observation for a bounded period (30 minutes). That
observation means only that Resend accepted the API request: it is **not** proof
of sender-domain authorization beyond that response, SMTP delivery, spam-folder
placement, or inbox display. Because the probe runs daily while evidence has a
short freshness window, the Resend status can deliberately become `stale`
between probes. It must not be made green from yesterday's receipt.

Configuration, HTTP, and network/response failures record content-free
degraded health evidence with distinct safe probe codes. They do not include an
email address, message body, credential, or provider response body in health
evidence. Confirmation that a real test email arrived in a controlled inbox
remains an external release gate.

Migration `0089` and its original Worker are deployed to protected staging, but
the local daily-probe candidate above is not staging evidence yet. Production
sender-domain verification and end-to-end deliverability remain release gates.
