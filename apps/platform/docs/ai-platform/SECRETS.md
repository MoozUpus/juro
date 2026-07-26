# JURO server-only secrets

Updated: 2026-07-26  
Status: names and contracts only; no secret values are stored here.

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
- `AI_PROVIDER_API_KEY` / `OPENAI_API_KEY`
- `LEGISLATION_FEED_API_KEY`
- `PAYMENT_API_KEY`
- `PAYMENT_WEBHOOK_SECRET`

Provider secrets must remain separate per environment and may not use
`NEXT_PUBLIC_*`.

`RESEND_API_KEY` and `EMAIL_FROM` gate both login/deletion delivery and the
protected email-change UI. Email change uses one provider batch request with a
challenge-derived idempotency key; neither the API key, either code, nor an
unmasked address may be written to logs or durable audit metadata.
