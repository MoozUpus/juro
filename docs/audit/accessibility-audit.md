# JURO Accessibility Audit

Status: **living evidence report, not a WCAG certification**

Evidence cutoff: **2026-09-02 UZT**

Scope: Chrome-only public, authentication-boundary, and authenticated Individual checks through the deployed v116 release. Legislation database/corpus work, non-Chrome browsers, and physical devices are excluded.

## Verified evidence

- Production v116 Chrome checks covered 390 × 844, 768 × 1024, 1024 × 768, and 1440 × 900 on the public site and lawyer-login boundary. Every checked page had zero horizontal overflow.
- Visible public RU/UZ/EN header links measure 44 × 44 CSS px at 768 px and wider; the current locale remains 44 × 44 on mobile while alternate locales are intentionally hidden below 620 px.
- The v116 lawyer-login heading has 0 px² overlap with both theme and language controls at all four checked viewports. Turnstile remained visible and the submit action stayed protected until verification completed.
- The authenticated Individual dashboard retained one visible H1, one main landmark, zero horizontal overflow, and 44 px or larger sampled controls at 390, 768, 1024, and 1440 px.
- Production v101 desktop Lighthouse scored Accessibility **100** on `https://juro.uz/ru`.
- The v114 local public page retained 21/21 visible reveal sections in RU, UZ, and EN at 1440 × 900 and in RU at 390 × 844.
- The checked desktop and mobile pages had zero document-level horizontal overflow and no console errors or warnings.
- Direct `/ru#start` navigation preserved content visibility and the scrolled header state.
- The local auth accessibility tree exposed the JURO link, light/dark theme controls, RU/UZ locale links, a localized protected-login heading, and the truthful local-development login boundary.
- At 390 × 844, the sampled auth buttons and links were at least 44 CSS px high and the page did not overflow horizontally.
- Source tests preserve keyboard/focus and reduced-motion contracts. The v114 Turnstile wrapper reserves 72 CSS px before the provider challenge renders.

## Open manual gates

- Complete keyboard traversal, error recovery, 200%/400% zoom, forced-colors, text-spacing, and Russian/Uzbek screen-reader passes.
- Complete authenticated Business, Lawyer, Pending Lawyer, and Staff/Admin journeys with accounts that actually hold those roles. Current production correctly redirects the Individual account away from Business, requires explicit lawyer reauthentication, and rejects the Individual session at the Admin boundary.
- Repeat the full execution-brief viewport matrix on authenticated feature pages, including dense tables, dialogs, uploads, and error states.

Automated tests, an accessibility-tree snapshot, and Lighthouse 100 do not prove full WCAG conformance.
