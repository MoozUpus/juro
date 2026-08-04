# Privacy data map

D1 contains tenant-scoped metadata, sessions, audit evidence, normalized legal workflows and job state. Private R2 contains uploaded originals, derivatives and exports under opaque application keys. OpenAI/Anthropic requests are server-side and are not made for quarantined files. Analytics excludes chat text, document text, identifiers, and sensitive URLs.

Retention, deletion and deletion-purge boundaries are documented in `RETENTION.md` and `BACKUP-RESTORE.md`. This map describes implementation boundaries, not legal-policy approval.

## AI provider usage and cost — local candidate

| Data | Storage | Protection | Scope and disclosure |
|---|---|---|---|
| provider/model/operation/status/token counts | D1 `ai_provider_usage_events` | append-only triggers, strict enums/bounds, server-only write path | fresh-MFA operations administrators through bounded aggregates; never returned as tenant content |
| opaque workspace/user IDs | D1 usage event and daily aggregate | no email/name/phone joins in the dashboard; no content fields | retained for financial/accounting evidence according to retention policy |
| provider request ID and safe error code | D1 usage event | bounded identifier; no raw provider error body | operational reconciliation only |
| effective price/version/source | D1 `ai_model_price_versions` | immutable; official provider HTTPS host; administrator plus fresh MFA | cost calculation and audit |
| daily cost projection | D1 `ai_cost_daily_aggregates` | atomic batch with immutable source event | administrator operations dashboard |

Prompt text, answer text, extracted/OCR text, document names, emails, phone
numbers and API secrets are not stored in this domain. Migration `0081` and the
admin surface are local only until the authorized staging migration/deploy gate.

## AI user memory — local candidate

| Data | Storage | Protection | Scope and disclosure |
|---|---|---|---|
| memory statement | D1 `user_memories.ciphertext` | record-bound AES-GCM with versioned server-only `IDENTITY_KEYRING`; no browser key | owning user plus current workspace for workspace-scoped records; sent server-side to the selected AI provider as untrusted context |
| equality evidence | D1 `content_sha256` | one-way normalized SHA-256; not returned by API | deduplication only |
| category/scope/lifecycle | D1 `user_memories` | authenticated tenant checks and D1 constraints | returned to the owner in memory settings and privacy export |
| origin metadata | D1 `memory_sources` | conversation/message foreign keys; no copied message text | owner-visible source type/date; provider does not receive identifiers |
| audit evidence | D1 `workspace_audit_events` | existing audit boundary | category/scope/action only; never statement text |

Credentials, OTP/TOTP values and payment-card-like numbers are refused.
High-sensitivity circumstances require explicit manual confirmation and are not
automatically extracted. If decryption is unavailable, the settings UI reports
memory unavailable, AI chat runs without memory, and privacy export fails closed
instead of omitting the domain silently. Migration `0062` is not yet deployed.

## Platform audit access — local candidate

| Data | Storage | Protection | Scope and disclosure |
|---|---|---|---|
| safe event projection | computed from existing D1 evidence | POST-only, administrator audit capability, active TOTP, 15-minute fresh MFA | IDs, action, severity and timestamp only |
| audit filters and result set | not stored verbatim | SHA-256 digests plus bounded result count | integrity/reconciliation only |
| actor/session/assignment and access action | D1 `platform_audit_access_events` | immutable per-actor chain and D1 live-role/session guard | security administrators; retained as access-audit evidence |

The audit surface does not select or return metadata JSON, IP hashes, names,
emails, document/chat text, provider payloads, queue bodies, message IDs,
idempotency keys or chain hashes. Migration `0086` is local-only.
