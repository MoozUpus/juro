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

After deployment of Worker version `0cf1dbe0-3e92-4a67-8587-4c6ac5456b45`, an
authenticated UZ smoke also completed the full **AI answer → action-plan
confirmation → new case** path using a saved synthetic AI answer:

- the user-facing plan-save button opened an in-app, keyboard-focusable
  confirmation group with explicit cancel and confirm actions;
- accepting it created a new case and navigated to its canonical localized
  case URL;
- the new case showed the immutable AI-proposed plan with two visible steps and
  two persisted planned tasks;
- browser console logs remained empty.

The same transition was also exercised with the keyboard: `Enter` opened the
confirmation and `Enter` accepted it. The idempotent server path returned to
the same case without duplicating its plan or tasks, again with an empty
browser console log.

The UZ AI conversation recorded in
`STAGING-0108-OPENAI-SCHEMA-EVIDENCE.md` remained readable and showed its
structured answer, action plan, suggested document and query-scoped official
source cards after direct navigation to its saved conversation.

After Worker version `face3164-02b2-4143-874c-d0355717caf2` deployed, the
same saved AI answer's case source route
`/uz/individual/cases/ffe28f29-47d0-53fb-b5a3-06bee0c08aba/sources` displayed
both preserved direct-citation cards. The cards linked to the exact allowlisted
Advice.uz documents `2920` and `712`; the browser console had no errors. The
server derives this association from the immutable action-plan confirmation
event, so replaying or appending a saved plan cannot move the source
conversation away from another case or duplicate source content.

The rendered-route regression suite also passed: `npm run test:rendered`
reported 30/30 successful tests, including canonical document-builder routes,
private route cache and CSRF controls, legacy redirects, security headers,
robots/noindex policy and the production-artifact prototype guard.

## Limits of this pass

- The plan-save flow no longer relies on browser-native `window.confirm`.
  It uses an explicit in-app confirmation group that is covered by the
  authenticated browser smoke above and keeps the existing server-side
  idempotent persistence contract.
- The current Wrangler OAuth identity can read and deploy the worker, but its
  Cloudflare API request to the configured remote `juro-staging` D1 database
  was rejected with code `7403`. No data was read or changed. Browser staging
  Access remains authenticated; an owner of the Cloudflare account that owns
  the database must refresh/authorize the control-plane OAuth session before
  a direct D1 evidence query can be repeated.
- Mobile-device, full keyboard matrix, screen-reader and Core Web Vitals
  measurements remain final release gates. No performance claim is made here.

## Boundaries

No migration, backup, secret change, production action or production data was
performed for this smoke.
