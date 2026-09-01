# Acquisition milestone gap

Status: resolved

`signup_completed` and `first_question_sent` existed in the closed event catalog but had no authoritative emitters. Counting every new conversation as a first question would overcount parallel or later conversations. v104 adds a D1-local composite-key milestone and emits only for its single winning insert.

Validation:

- type-check passed;
- lint passed;
- generated Cloudflare types are current;
- 104 focused auth, AI, analytics, and migration tests passed;
- the development/staging/production Cloudflare artifact matrix passed;
- no production deploy or browser session was used.
