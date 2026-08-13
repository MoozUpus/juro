# JURO GitHub presentation assets

All assets in this folder are repository-local and use the JURO palette: navy #062844, gold #BE974F, paper #F8F6F2 and white.

## Asset inventory

| Asset | Purpose | Source / update trigger |
|---|---|---|
| hero.svg | README hero banner | Original JURO GitHub artwork. Update when product positioning, URLs or branded interface language changes. |
| social-preview-source.svg | Source artwork for the social card | Original JURO artwork at 1280 × 640. Render it with `compose-screenshots.cjs`, then re-upload social-preview.png in repository settings. |
| social-preview.png | GitHub social preview | Rendered from social-preview-source.svg at 1280 × 640 and installed as the repository Social Preview. Re-upload it in repository settings after a future update. |
| stack-badges.svg | Self-hosted technology badges | Update only when the verified core stack or CI status changes. |
| engineering-commitments.svg | Product-engineering contract from legal context to protected work | Update when source handling, workspace access boundaries or the lawyer hand-off status changes. |
| operating-model.svg | End-to-end product model from public entry to protected work | Update when an implemented, partial or planned transition changes status. This is an original JURO diagram, not a service-level promise. |
| product-overview.svg | Product ecosystem and status split | Update when a module moves between WORKING, PARTIAL or PLANNED. |
| ai-answer-flow.svg | Source-aware answer-flow explanation | Update when the retrieval or citation-validation path changes. It intentionally does not claim an official Lex.uz or Advice.uz API. |
| platform-architecture.svg | Repository and deployment architecture | Update after changes to Workers, D1, R2, server-side AI, auth or external providers. |
| trust-layer.svg | Product trust and limitation model | Update after security-boundary or document-handling changes. |
| juro-mark.png | Official existing JURO mark reused by SVG artwork | Copy of apps/website/public/juro-mark.png; do not redraw or alter its geometry here. |
| screenshots/raw/*.webp | Privacy-reviewed source captures | Real browser captures from 2026-08-14. The builder source has an editorial redaction layer over an unverified counter; no metric is added in its place. Keep sources separate from presentation frames so the visual treatment can be regenerated without recapturing UI. |
| screenshots/public-website.webp | Public juro.uz presentation frame | Repository-local frame around the reviewed public capture; update after public homepage changes. |
| screenshots/platform-dashboard.webp | Protected-workspace presentation frame | Repository-local frame around the reviewed account-free capture; update after dashboard changes. |
| screenshots/ai-chat.webp | Legal-information entry presentation frame | Repository-local frame around an empty, identity-free starting state; update after chat UI changes. |
| screenshots/document-builder.webp | Document-workflow presentation frame | Repository-local frame around the reviewed builder capture; it deliberately omits the unverified registry counter from the public presentation. |
| screenshots/document-analysis.webp | Document-review presentation frame | Repository-local frame around the reviewed review/compare capture; update after its UI or status changes. |
| Mobile presentation capture | Withheld | No `mobile-experience.webp` is published until an actual verified mobile capture is available. |
| scripts/compose-screenshots.cjs | Presentation-frame generator | Uses the existing platform sharp dependency. Run after replacing `screenshots/raw/*` with reviewed captures. |
| PRODUCT_FOUNDATIONS.md | Evidence-led engineering narrative and review map | Update when a linked implementation boundary, product status or operational document changes. |

## Safety and capture rules

- Capture only real product UI using synthetic or empty data.
- Remove account names, conversation history, personal files, real phone numbers, API keys and browser chrome before committing.
- Keep screenshots as WebP, diagrams as SVG, and the social card as PNG.
- Do not embed assets as base64 in Markdown and do not add font files.

## Regenerating presentation assets

After updating a reviewed raw screenshot or `social-preview-source.svg`, run this command from the repository root after `npm run install:all`:

    node docs/github/scripts/compose-screenshots.cjs

The command refreshes the five published WebP presentation frames and `social-preview.png`. It does not create a mobile image; that requires a new verified mobile capture first.
