# JURO GitHub presentation assets

All assets in this folder are repository-local and use the JURO palette: navy #062844, gold #BE974F, paper #F8F6F2 and white.

## Asset inventory

| Asset | Purpose | Source / update trigger |
|---|---|---|
| hero.svg | README hero banner | Original JURO GitHub artwork. Update when product positioning, URLs or branded interface language changes. |
| social-preview.png | GitHub social preview | Original JURO GitHub artwork, rendered at 1280 × 640. Upload it in GitHub repository settings after review. |
| stack-badges.svg | Self-hosted technology badges | Update only when the verified core stack or CI status changes. |
| product-overview.svg | Product ecosystem and status split | Update when a module moves between WORKING, PARTIAL or PLANNED. |
| ai-answer-flow.svg | Source-aware answer-flow explanation | Update when the retrieval or citation-validation path changes. It intentionally does not claim an official Lex.uz or Advice.uz API. |
| platform-architecture.svg | Repository and deployment architecture | Update after changes to Workers, D1, R2, server-side AI, auth or external providers. |
| trust-layer.svg | Product trust and limitation model | Update after security-boundary or document-handling changes. |
| juro-mark.png | Official existing JURO mark reused by SVG artwork | Copy of apps/website/public/juro-mark.png; do not redraw or alter its geometry here. |
| screenshots/public-website.webp | Public juro.uz hero | Live browser capture on 2026-08-14; update after public homepage changes. |
| screenshots/platform-dashboard.webp | Protected platform dashboard | Live browser capture on 2026-08-14, cropped to remove account identity; update after dashboard changes. |
| screenshots/ai-chat.webp | AI legal-chat starting state | Live browser capture on 2026-08-14, cropped to exclude conversation history and identity; update after chat UI changes. |
| screenshots/document-builder.webp | Document-library/builder entry | Live browser capture on 2026-08-14; update after builder UI or template registry changes. |
| screenshots/document-analysis.webp | Document-review entry | Live browser capture on 2026-08-14; update after review/compare UI or its status changes. |
| screenshots/mobile-experience.webp | Narrow public-product presentation | Derived from the live public first viewport on 2026-08-14. Replace it with a freshly captured, verified 390 px browser viewport before using it as formal mobile QA evidence. |

## Safety and capture rules

- Capture only real product UI using synthetic or empty data.
- Remove account names, conversation history, personal files, real phone numbers, API keys and browser chrome before committing.
- Keep screenshots as WebP, diagrams as SVG, and the social card as PNG.
- Do not embed assets as base64 in Markdown and do not add font files.

## Rendering the social card

social-preview.png was rendered from original SVG-style artwork using the repository's existing sharp dependency. A local SVG-to-PNG command is:

    node -e "import('sharp').then(({default: sharp}) => sharp('docs/github/hero.svg').png().toFile('docs/github/hero-preview.png'))"
