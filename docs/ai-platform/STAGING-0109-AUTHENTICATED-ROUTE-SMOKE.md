# Staging 0109 — authenticated route smoke

Date: 2026-08-06

## Scope

This is a browser smoke of existing staging routes after the OpenAI structured
output repair. It does not deploy to or modify production.

## Verified in an authenticated staging session

- `GET /uz/individual/document-builder` rendered the localized builder library,
  navigation landmarks, language controls and template/category links.
- `GET /ru/individual/document-builder` rendered a single Russian `h1`
  (`Библиотека документов`).
- `GET /ru/individual/ai-chat` rendered the localized `AI-юрист JURO` main
  heading.
- `GET /uz/individual/document-review` rendered its main document-review
  surface.
- Each inspected route reported an empty browser console log.

The UZ AI conversation recorded in
`STAGING-0108-OPENAI-SCHEMA-EVIDENCE.md` remained readable and showed its
structured answer, action plan, suggested document and query-scoped official
source cards after direct navigation to its saved conversation.

## Limits of this pass

- The Chrome QA bridge hangs while accepting a browser-native `window.confirm`
  dialog used by the **create case from AI plan** action. The action is covered
  by the existing persisted-plan unit/integration suite and previous synthetic
  lifecycle evidence, but this particular bridge run is not counted as a new
  browser confirmation. This is a test-automation limitation, not evidence of
  a user-visible product failure.
- The current Wrangler OAuth identity can read and deploy the worker, but its
  Cloudflare API request to the configured remote `juro-staging` D1 database
  was rejected with code `7403`. No data was read or changed. Browser staging
  Access remains authenticated; an owner of the Cloudflare account that owns
  the database must refresh/authorize the control-plane OAuth session before
  a direct D1 evidence query can be repeated.
- Mobile-device, full keyboard interaction, screen-reader and Core Web Vitals
  measurements remain final release gates. No performance claim is made here.

## Boundaries

No migration, backup, secret change, production action or production data was
performed for this smoke.
