# JURO GitHub presentation assets

All assets in this folder are repository-local and use the JURO palette: navy #062844, gold #BE974F, paper #F8F6F2 and white.

## Asset inventory

| Asset | Purpose | Source / update trigger |
|---|---|---|
| hero.svg | README hero banner | Original JURO GitHub artwork. Update when product positioning, URLs or branded interface language changes. |
| social-preview-source.svg | Source artwork for the social card | Original JURO artwork at 1280 × 640. Render it with the documented Sharp command, then re-upload social-preview.png in repository settings. |
| social-preview.png | GitHub social preview | Rendered from social-preview-source.svg at 1280 × 640 and installed as the repository Social Preview. Re-upload it in repository settings after a future update. |
| stack-badges.svg | Self-hosted technology badges | Update only when the verified core stack or CI status changes. |
| engineering-commitments.svg | Product-engineering contract | Supporting diagram for PRODUCT_FOUNDATIONS.md. Kept out of the main README to avoid repeated visual blocks. |
| operating-model.svg | End-to-end product model | Supporting diagram for PRODUCT_FOUNDATIONS.md. Update when an implemented, partial or planned transition changes status. |
| product-experience.svg | Original visual product story | A designed product illustration, deliberately labelled as not a live screenshot. Update when product-status boundaries or core workflow language changes. |
| product-overview.svg | Product ecosystem and status split | Update when a module moves between WORKING, PARTIAL or PLANNED. |
| ai-answer-flow.svg | Source-aware answer-flow explanation | Update when the retrieval or citation-validation path changes. It intentionally does not claim an official Lex.uz or Advice.uz API. |
| platform-architecture.svg | Repository and deployment architecture | Update after changes to Workers, D1, R2, server-side AI, auth or external providers. |
| trust-layer.svg | Product trust and limitation model | Update after security-boundary or document-handling changes. |
| juro-mark.png | Official existing JURO mark reused by SVG artwork | Copy of apps/website/public/juro-mark.png; do not redraw or alter its geometry here. |
| PRODUCT_FOUNDATIONS.md | Evidence-led engineering narrative and review map | Update when a linked implementation boundary, product status or operational document changes. |

## Visual integrity rules

- Product illustrations must state that they are illustrations, not live interface screenshots.
- Do not show metrics, customer information, personal files, phone numbers, API keys or browser chrome.
- Keep diagrams and product illustrations as SVG and the social card as PNG.
- Do not embed assets as base64 in Markdown and do not add font files.

## Rendering the social card

After updating `social-preview-source.svg`, run this command from the repository root after `npm run install:all`:

    node -e "const sharp=require('./apps/platform/node_modules/sharp'); sharp('docs/github/social-preview-source.svg').png().toFile('docs/github/social-preview.png')"

This refreshes `social-preview.png`; re-upload it through **Repository → Settings → General → Social preview** afterwards.
