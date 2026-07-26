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
- treat a missing or malformed ring as a fail-closed configuration error;
- do not enable TOTP or encrypted identity migration until a staging
  encrypt/decrypt/rotation test succeeds.

The current source provides the cryptographic primitive and tests. It does not
contain a real key ring and no live environment was changed.

## Other server-only values

- `RESEND_API_KEY`
- `AI_PROVIDER_API_KEY` / `OPENAI_API_KEY`
- `LEGISLATION_FEED_API_KEY`
- `PAYMENT_API_KEY`
- `PAYMENT_WEBHOOK_SECRET`

Provider secrets must remain separate per environment and may not use
`NEXT_PUBLIC_*`.
