# Staging 0080 — case workspace tabs

Date: 2026-08-02

## Delivered slice

- The case workspace has real bilingual **Overview**, **Documents**, and **Activity** tabs.
- `GET /api/platform/cases/:caseId/workspace` is authenticated, resolves the active workspace server-side, confirms the case belongs to it, and returns only linked non-archived documents plus the bounded case audit timeline.
- Documents navigate to their existing authenticated detail route. Activity is rendered from persisted `case_events`; event labels are localized in the client and do not invent legal results.

## Safety and checks

- No migration, provider call, or production deployment was made.
- `npm run type-check`, `npm run lint`, `npm test`, `npm run build:staging`, `npm run validate:artifact -- --environment staging`, and `git diff --check` passed before deployment.
- Authenticated browser verification remains protected by Cloudflare Access and is not claimed as complete.
