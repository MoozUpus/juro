# Visual regression contract

Updated: 2026-07-30
Status: source/build contracts pass; authenticated screenshot matrix remains open.

## Required views

For RU and UZ: 320, 360, 390, 768, 1024, 1280, and 1440+ widths; dashboard, AI chat, document analysis, builder, cases/plan, specialist handoff, profile/settings, mobile drawer, reduced motion, increased contrast, 200% zoom, and avatar-image failure.

## Current automated signals

- route CSS has no `100vw`, infinite loop, or `transition: all`;
- breakpoints cover compact mobile, tablet, and desktop composition;
- build exposes both personal and business-workspace prototype routes;
- production artifact returns 404 for the unscoped prototype entry;
- canonical document-builder regression remains part of release gates.

Screenshots are not manufactured from unauthenticated or mock state. They remain pending because the available browser kernel cannot attach to the owner-protected staging session.
