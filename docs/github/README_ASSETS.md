# JURO GitHub presentation assets

All assets in this folder are repository-local and use the JURO palette: navy #062844, gold #BE974F, paper #F8F6F2 and white.

## Asset inventory

| Asset | Purpose | Source / update trigger |
|---|---|---|
| hero.svg | README hero banner | Original JURO GitHub artwork. Update when product positioning, URLs or branded interface language changes. |
| social-preview.png | GitHub social preview | Original JURO GitHub artwork, rendered at 1280 × 640 and installed as the repository Social Preview. Re-upload it in repository settings after a future update. |
| stack-badges.svg | Self-hosted technology badges | Update only when the verified core stack or CI status changes. |
| engineering-commitments.svg | Product-engineering contract from legal context to protected work | Update when source handling, workspace access boundaries or the lawyer hand-off status changes. |
| operating-model.svg | End-to-end product model from public entry to protected work | Update when an implemented, partial or planned transition changes status. This is an original JURO diagram, not a service-level promise. |
| product-overview.svg | Product ecosystem and status split | Update when a module moves between WORKING, PARTIAL or PLANNED. |
| ai-answer-flow.svg | Source-aware answer-flow explanation | Update when the retrieval or citation-validation path changes. It intentionally does not claim an official Lex.uz or Advice.uz API. |
| platform-architecture.svg | Repository and deployment architecture | Update after changes to Workers, D1, R2, server-side AI, auth or external providers. |
| trust-layer.svg | Product trust and limitation model | Update after security-boundary or document-handling changes. |
| showcase/hero-{en,ru,uz}.svg + mobile variants | Localized premium README hero | Update when positioning, primary capabilities or public URLs change. Mobile variants keep critical text readable at viewport widths up to 900 px. |
| showcase/product-demo.gif + mobile variant | 12.6-second autoplay product narrative | GitHub-compatible animation from question through sources, document work and optional lawyer hand-off. Static SVG posters are selected for reduced motion. |
| showcase/capability-board.svg + mobile variant | Eight-part product capability system | AI Avatar is always marked IN DEVELOPMENT; other capability claims remain subordinate to the README status matrix. |
| showcase/question-to-action.svg + mobile variant | Connected product workflow | Shows ask, understand, verify, work, act and optional human review. |
| showcase/source-aware-ai.svg + mobile variant | Source-aware AI composition | Shows source identifiers and visible evidence status without claiming complete legal coverage. |
| showcase/document-intelligence.svg + mobile variant | Protected document-work composition | Shows an illustrative scan, risks and action-plan transition; it does not upgrade the PARTIAL release status. |
| showcase/ai-avatar.svg + mobile variant | Abstract AI Avatar development card | Uses a faceless silhouette and explicit IN DEVELOPMENT language; no production voice, lip-sync or rigged-asset claim. |
| showcase/lawyer-handoff.svg + mobile variant | Human-assistance workflow | Keeps availability and representation boundaries visible. |
| showcase/technology-architecture.svg + mobile variant | Production technology and request flow | Groups frontend, edge/backend, data, AI and engineering layers. |
| showcase/generate-assets.mjs | Deterministic SVG generator | Regenerates all static showcase SVG pairs without external images or fonts. |
| showcase/render-product-demo.mjs | Deterministic GIF renderer | Regenerates desktop/mobile GIFs and reduced-motion posters from repository-local vector frames. |
| showcase/validate-showcase.mjs | README asset validator | Checks local references, anchors, SVG safety/parsing, GIF dimensions, frame timing and GitHub's image-size boundary. |
| juro-mark.png | Official existing JURO mark reused by SVG artwork | Copy of apps/website/public/juro-mark.png; do not redraw or alter its geometry here. |
| screenshots/public-website.webp | Public juro.uz hero | Live browser capture on 2026-08-14; update after public homepage changes. |
| screenshots/platform-dashboard.webp | Protected platform dashboard | Live browser capture on 2026-08-14, cropped to remove account identity; update after dashboard changes. |
| screenshots/ai-chat.webp | AI legal-chat starting state | Live browser capture on 2026-08-14, cropped to exclude conversation history and identity; update after chat UI changes. |
| screenshots/document-builder.webp | Document-library/builder entry | Live browser capture on 2026-08-14; update after builder UI or template registry changes. |
| screenshots/document-analysis.webp | Document-review entry | Live browser capture on 2026-08-14; update after review/compare UI or its status changes. |
| screenshots/mobile-experience.webp | Narrow public-product presentation | Derived from the live public first viewport on 2026-08-14. Replace it with a freshly captured, verified 390 px browser viewport before using it as formal mobile QA evidence. |
| PRODUCT_FOUNDATIONS.md | Evidence-led engineering narrative and review map | Update when a linked implementation boundary, product status or operational document changes. |

## Safety and capture rules

- Capture only real product UI using synthetic or empty data.
- Remove account names, conversation history, personal files, real phone numbers, API keys and browser chrome before committing.
- Keep screenshots as WebP, diagrams as SVG, and the social card as PNG.
- Keep the central autoplay demo as GIF because GitHub supports it consistently in rendered Markdown; keep SVG posters for reduced-motion visitors.
- Every wide showcase asset must retain its paired mobile asset and be embedded with the GitHub-supported `<picture>` element.
- Do not remove the explicit AI Avatar IN DEVELOPMENT label until the product status and release evidence change.
- Do not embed assets as base64 in Markdown and do not add font files.

## Regenerating the premium showcase

Generate the responsive static SVG assets:

    node docs/github/showcase/generate-assets.mjs

The animated demo uses `sharp` from the platform install and a temporary `gifenc` tool install. From Windows PowerShell:

    npm install --prefix .tmp/readme-gif-tools --no-save --no-package-lock gifenc@1.0.3
    $env:JURO_README_SHARP = (Resolve-Path apps/platform/node_modules/sharp).Path
    $env:JURO_README_GIFENC = (Resolve-Path .tmp/readme-gif-tools/node_modules/gifenc/dist/gifenc.esm.js).Path
    node docs/github/showcase/render-product-demo.mjs
    node docs/github/showcase/validate-showcase.mjs
    node docs/github/showcase/validate-showcase.mjs --github

The renderer emits 37 frames at 340 ms per frame (12.58 seconds), loops forever, uses opacity crossfades plus state-indication motion, and keeps both GIF files below GitHub's 10 MB image limit.

## Rendering the social card

social-preview.png was rendered from original SVG-style artwork using the repository's existing sharp dependency. A local SVG-to-PNG command is:

    node -e "import('sharp').then(({default: sharp}) => sharp('docs/github/hero.svg').png().toFile('docs/github/hero-preview.png'))"
