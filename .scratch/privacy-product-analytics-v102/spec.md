# v102 privacy-conscious product analytics

Status: implemented and locally validated; Draft PR pending

## Objective

Add a production-grade, content-free product-event contract for JURO's durable conversion milestones so activation and funnel metrics can be measured without sending a Legal Answer, legal question, document content, personal data, URL, tenant identifier, or provider payload to analytics.

## First release slice

- a dedicated Cloudflare Analytics Engine dataset binding with one fixed row schema;
- a runtime allowlist for event name, locale, account type, outcome, safe reason code, and bounded duration;
- server-side emission only after the related durable mutation succeeds;
- focused coverage for the highest-confidence product milestones that already have authoritative server routes;
- tests that reject unknown/free-text fields and prove analytics failure cannot roll back a durable user action;
- a KPI/event dictionary that separates directly measurable metrics from metrics requiring later cohort-safe aggregation.

## Non-goals

- legislation database, legal corpus, Lex.uz/Advice.uz data, vectors, source documents, or legal evaluation;
- raw questions, Legal Answers, chat content, document text/metadata, filenames, emails, phone numbers, names, OTPs, request URLs, IP addresses, user IDs, workspace IDs, provider payloads, or stable pseudonymous user keys;
- production deployment, DNS, billing-account changes, or Chrome QA in this increment;
- invented KPI targets before a trustworthy production baseline exists.

## Acceptance criteria

- the product-event row layout is versioned and identical for every event;
- every string dimension is selected from a runtime allowlist;
- no event call can add arbitrary payload keys;
- Analytics Engine write failure is swallowed after the product mutation succeeds;
- generated Cloudflare binding types and environment-matrix validation pass;
- event names and KPI formulas are documented with source, grain, caveat, and decision use.
