# Staging 0108 — OpenAI structured-output recovery

Date: 2026-08-06

## Scope

This staging-only repair restores the interactive JURO AI-chat primary provider
without changing production, a D1 schema, secrets, user entitlements or source
retrieval policy.

The failure audit contained no user content and identified the cause as an
OpenAI `400 invalid_json_schema`: three source-access fields were optional and
server-owned, but OpenAI Structured Outputs requires provider-visible object
properties to be required. The provider contract now omits those fields; the
server attaches them only after direct-source validation.

The fallback path also records only safe metadata for a primary-provider failure
(provider, public code, HTTP status/type, model) in the existing workspace audit
trail. Legal questions, source excerpts, raw provider responses, tokens and
credentials are not stored in this diagnostic event.

## Verification

- Worker version: `92422f76-a5b0-44ef-b512-a6f8f72fc715` (staging only).
- No migration or backup was needed because this change does not modify D1 data
  or schema.
- `npm run type-check` passed.
- `npm run lint` passed.
- Targeted fallback, direct-retrieval and OpenAI schema tests passed.
- `npm run build:staging` passed its artifact/binding validation.
- An authenticated UZ browser smoke used a short general labour-law question.
  It completed with a structured UZ answer, validated direct official source
  cards, an action plan and a suggested document; one answer cycle was recorded.
- The browser reported no console errors or warnings.

## Boundaries

The browser smoke proves platform mechanics, source-card validation and
internationalized rendering. It is not an independent human legal review of the
answer. The direct path remains query-scoped, allowlisted and fail-closed: it
does not create or maintain a Lex.uz/Advice.uz corpus.
