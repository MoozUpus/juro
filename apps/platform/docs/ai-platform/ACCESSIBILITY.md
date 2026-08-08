# Accessibility evidence and open gates

Updated: 2026-07-30
Target: WCAG 2.2 AA.

## Implemented contracts

- semantic `main`, navigation, sections, ordered process, links, headings, and one inherited dashboard `h1`;
- existing skip link, focus trap, Escape handling, and focus restoration in the application shell;
- 44 px minimum controls on the new surface;
- visible 3 px prototype focus ring;
- no hover-only function and no color-only state;
- meaningful Jurobek alt text;
- text status for the disabled avatar/voice capability;
- RU/UZ route copy and document language behavior;
- reduced motion, reduced transparency, increased contrast, and forced colors CSS;
- responsive rules for 900 px and 560 px, with existing 800/460 px shell/dashboard rules.

## Automated evidence

`platform-core.test.ts` asserts staging guard, noindex, authentication, static fallback, no 3D interaction, preferences, and absence of infinite motion/`transition: all`/`100vw`. Type-check, lint, core, rendered route, and build gates are recorded in the staging evidence file.

## Open manual gates

Authenticated keyboard traversal, NVDA/VoiceOver, axe, 200% zoom, browser console/hydration, RU/UZ text expansion, and real-device 320/360/390/768/1024/1280/1440+ inspection are not claimed. The available in-app browser kernel fails before connecting to the owner Access session. Cloudflare Access was not bypassed.
