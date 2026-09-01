# JURO Accessibility Audit

Status: **living evidence report, not a WCAG certification**

Evidence cutoff: **2026-09-02 UZT**

Scope: Chrome-only public landing and authentication-boundary checks for the v101 production release and undeployed v114 candidate. Legislation database/corpus work, non-Chrome browsers, and physical devices are excluded.

## Verified evidence

- Production v101 desktop Lighthouse scored Accessibility **100** on `https://juro.uz/ru`.
- The v114 local public page retained 21/21 visible reveal sections in RU, UZ, and EN at 1440 × 900 and in RU at 390 × 844.
- The checked desktop and mobile pages had zero document-level horizontal overflow and no console errors or warnings.
- Direct `/ru#start` navigation preserved content visibility and the scrolled header state.
- The local auth accessibility tree exposed the JURO link, light/dark theme controls, RU/UZ locale links, a localized protected-login heading, and the truthful local-development login boundary.
- At 390 × 844, the sampled auth buttons and links were at least 44 CSS px high and the page did not overflow horizontally.
- Source tests preserve keyboard/focus and reduced-motion contracts. The v114 Turnstile wrapper reserves 72 CSS px before the provider challenge renders.

## Open manual gates

- Complete keyboard traversal, error recovery, 200%/400% zoom, forced-colors, text-spacing, and Russian/Uzbek screen-reader passes.
- Verify the real Turnstile challenge and authenticated role journeys on the exact deployed v114 revision.
- Repeat the responsive matrix at every target viewport required by the execution brief.

Automated tests, an accessibility-tree snapshot, and Lighthouse 100 do not prove full WCAG conformance.
