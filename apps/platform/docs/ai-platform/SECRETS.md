# JURO server-only secrets

Updated: 2026-07-30
Status: names, contracts, and read-only presence inventory only; no secret value is stored here, in Git, or in the client bundle. A 2026-08-02 Wrangler read-only inventory returned server-only staging bindings named `ANTHROPIC_API_KEY`, `IDENTITY_KEYRING`, `OPENAI_API_KEY`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`; it returned names and types only, never values.

## Verified remote presence by name

The production Sites runtime exposes variables `APP_URL`, `EMAIL_FROM`, and `PUBLIC_SITE_URL`, plus a secret binding named `RESEND_API_KEY`. The inspected legacy production Worker also exposes `EMAIL_FROM` and only `RESEND_API_KEY` among the required secret bindings.

No inspected production surface exposed the following required names: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `OTP_HASH_SECRET`, `CRON_SECRET`, `TURNSTILE_SECRET_KEY`, `TOTP_ENCRYPTION_KEY`, or `SIGNED_URL_SECRET`. The public environment variable `TURNSTILE_SITE_KEY` was also absent from the inspected surfaces.

Only names were inventoried. A Sites connector operation unexpectedly returned a bypass bearer token in raw connector telemetry. The value was not copied, used, persisted, or committed and is intentionally absent from this document. It must be rotated/revoked before production work.

The 2026-08-02 staging recheck used `wrangler secret list --name
juro-platform-staging`. It exposes the five names listed above. The values
were not requested, exported, logged, or copied. The production Worker still
has its pre-existing `RESEND_API_KEY`; no evidence indicates that any new
staging value was attached to production. Provider delivery and end-to-end
browser behavior remain separate gates from binding presence.

The 2026-07-30 runtime probes prove that the `IDENTITY_KEYRING` binding exists
as `secret_text` but still cannot be parsed by the documented key-ring contract
after the owner-reported re-entry. The controlled post-reentry Cron/Queue rerun
returned only `STAGING_SYNTHETIC_PROBE_IDENTITY_FAILED`; no secret value, parser
detail, protected identity, deletion request, profile, file, lifecycle/purge
evidence, or R2 object was logged or persisted. The final Worker version is
`2ebc2ea8-6216-4f39-af96-d1b600973b74` with the probe flag restored to `false`.
Do not enable identity dual-write, MFA enrollment, or another purge rehearsal
until the owner corrects the staging secret through protected Cloudflare
controls and retains a separately protected recovery copy. Never paste the
replacement into chat, Git, a ticket, a screenshot, or a command transcript.

## Identity key ring

`IDENTITY_KEYRING` is a server-only JSON secret:

```json
{
  "active": "v2",
  "versions": {
    "v1": {
      "aead": "<32 random bytes, base64url without padding>",
      "hmac": "<different 32 random bytes, base64url without padding>"
    },
    "v2": {
      "aead": "<32 random bytes, base64url without padding>",
      "hmac": "<different 32 random bytes, base64url without padding>"
    }
  }
}
```

Requirements:

- generate every key independently with a cryptographically secure generator;
- configure the value through the protected environment secret control, never
  `wrangler.jsonc`, `.dev.vars`, logs, tickets, screenshots, or chat;
- keep the active key version available for writes;
- retain prior versions only while rows still reference them;
- back up and restore the key ring through the approved secret-store process,
  separately from D1/R2 backups;
- record key-version activation and retirement as audited operational changes,
  without recording key material;
- retain a separately protected recovery copy before rotating or retiring a
  version, and prove restore before the change;
- treat a missing or malformed ring as a fail-closed configuration error;
- do not enable TOTP or encrypted identity migration until a staging
  encrypt/decrypt/rotation test succeeds.

The current source provides the cryptographic primitive, encrypted TOTP
enrollment, backup-code hashing, canonical profile dual-read/write primitives,
bounded profile backfill/verification, invitation evidence primitives, and
short-lived OTP/deletion challenge HMAC evidence plus protected email-change
address/code evidence. It does not contain a real key ring, and no live
environment was changed. Migrations 0018–0019 deliberately retain legacy SHA
digests and rollback-safe raw fields during expansion, so keyed code evidence
is not a claim that a D1-only compromise is already resistant to offline OTP
guessing; that requires the later verified contract/drain step.

`IDENTITY_PROTECTION_MODE` is not a secret, but it is a security-sensitive
deployment control. All checked-in development/staging/production
configurations are fixed to `legacy`. Do not change staging to `dual_write`
until migrations 0016–0019 are applied, the protected key ring is
configured, and a backup/restore rehearsal succeeds. Do not change production
in this phase.

## Local MFA flow

`IDENTITY_KEYRING` is consumed only in server code. Enrollment encrypts the
TOTP secret with record-bound AAD; backup codes are stored as
domain-separated HMAC values. Email-OTP verification creates a hashed
short-lived pre-auth challenge when MFA is active, and the primary session is
issued only after TOTP or backup-code verification.

Missing, malformed, or unknown key versions fail closed with a safe service
error. Never solve this by exposing the key ring to browser code, weakening
AAD, storing plaintext recovery codes, or falling back to a platform-header
principal.

## Other server-only values

- `RESEND_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `OTP_HASH_SECRET`
- `CRON_SECRET`
- `TURNSTILE_SECRET_KEY`
- `TOTP_ENCRYPTION_KEY`
- `SIGNED_URL_SECRET`
- `IDENTITY_KEYRING`
- `LEGISLATION_FEED_API_KEY`
- `PAYMENT_API_KEY`
- `PAYMENT_WEBHOOK_SECRET`

The last three provider/integration values are optional until the corresponding integration is actually selected. `AI_PROVIDER_API_KEY` is a legacy generic name and must not replace the explicit OpenAI/Anthropic bindings in a new environment.

Provider secrets must remain separate per environment and may not use
`NEXT_PUBLIC_*`.

## Turnstile binding contract

- `TURNSTILE_SECRET_KEY` is a required server-only secret for OTP request
  verification. It must never be rendered into HTML, serialized to client
  code, logged, or stored in D1.
- `TURNSTILE_SITE_KEY` is required public environment configuration for the
  client widget. It is not a secret, but it must still be isolated by
  environment and paired with the correct hostname/provider configuration.
- the OTP request endpoint also requires `RESEND_API_KEY` and `EMAIL_FROM`;
  login/register expose the OTP flow only when the server delivery and both
  Turnstile bindings are configured;
- server validation uses Cloudflare Siteverify, requires action `auth_otp` and
  an exact expected hostname, and fails closed on invalid, malformed,
  unavailable, or timed-out verification;
- both Turnstile binding names are present on protected staging, together with
  `RESEND_API_KEY` and `EMAIL_FROM`; no real current-version Turnstile/Resend
  mailbox trace has yet been captured, so provider delivery is not claimed.

Model names, feature flags, URLs, and email sender identities are server-side variables/configuration, not secrets. They still require environment isolation and must not contain credentials.

`RESEND_API_KEY` and `EMAIL_FROM` gate both login/deletion delivery and the
protected email-change UI. Email change uses one provider batch request with a
challenge-derived idempotency key; neither the API key, either code, nor an
unmasked address may be written to logs or durable audit metadata.

## Phase 4 provider recheck — 2026-08-02

Read-only `wrangler secret list --name juro-platform-staging` confirms that
both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` now exist as `secret_text`
bindings. The staging model variables remain checked-in non-secret
configuration. Binding presence proves neither provider delivery nor fallback:
the guarded synthetic probe remains disabled until an owner-approved,
cost-bearing staging run is performed. No secret value was requested or
exposed.
