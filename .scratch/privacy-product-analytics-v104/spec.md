# v104 durable acquisition milestones

## Scope

- Emit `signup_completed` only after a new OTP-verified account and mandatory registration acceptances persist.
- Emit `first_question_sent` only for the first durable account question, including non-chargeable safe intents.
- Keep user identity in D1 only; never write it to Analytics Engine or logs.
- Make the first-question winner replay-safe under concurrent requests.

## Exclusions

- No browser analytics, consent UI, or anti-abuse client collector.
- No legislation/corpus work.
- No production deploy or browser session.
- `clarification_completed` and `document_analyzed` remain open for separately reviewed authoritative transitions.
