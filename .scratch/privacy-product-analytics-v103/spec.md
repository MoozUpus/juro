# v103 privacy-conscious durable event expansion

Status: implemented and locally validated; Draft PR pending

## Objective

Extend the fixed `product_event_v1` contract only at durable, replay-safe server transitions that do not require browser consent state or an identity index.

## Scope

- `document_uploaded` after the validated upload becomes quarantined and its scan outbox row is durable;
- `document_compared` after the completed comparison state and audit evidence are durable;
- `lawyer_request_accepted` after a new two-party case-access grant wins its guarded D1 transition;
- focused ordering and replay tests;
- event dictionary update.

## Non-goals

- browser events or Chrome QA;
- legislation corpus, Lex/Advice data, vectors, or ingestion;
- `document_analyzed`, which needs a separately reviewed queue-level account-type lookup;
- production deployment or Analytics Engine queries.

## Acceptance criteria

- no event is emitted for an already quarantined upload or already completed comparison;
- no lawyer acceptance event is emitted unless the guarded access-grant insert wins;
- all three events remain inside the existing strict content-free schema;
- focused tests, type-check, lint, Cloudflare types, and environment matrix pass.
