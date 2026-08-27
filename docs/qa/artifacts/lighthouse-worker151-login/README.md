# Worker 151 login Lighthouse snapshot

- Deployed page: `https://app.juro.uz/ru/auth/login?qa=worker151`
- Capture time: `2026-08-27T16:12:00.909Z`
- Lighthouse: `13.4.1`, desktop snapshot mode
- Accessibility: `100`
- Best Practices: `100`
- SEO: `100`
- Agentic Browsing: `100`
- Audits: `33` passed, `0` failed
- `report.json` SHA-256: `97bb4b2d036f4da6950f1529832cdca53775c33e0c33cad0f50957ca666cd12d`
- `report.html` SHA-256: `c62ef84bf6fccf28e8df91f97038fa3450631da3d1b8afa4597ad6521e15d145`

Turnstile sizing follows Cloudflare's documented flexible minimum (`300 px`,
`65 px` high) and compact dimensions (`150x140`):
<https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/>.

`report.json` and `report.html` are the unmodified Chrome DevTools MCP outputs.
Snapshot mode records `requestedUrl` and `finalUrl` as null, so the controlled
page URL and capture time are recorded here alongside the raw reports.

This audit excludes Lighthouse performance. Separate Chrome performance traces
on the same deployed URL measured desktop LCP 521 ms / CLS 0.02 and emulated
320x800 Chrome LCP 248 ms / CLS 0.00. Those are lab observations, not field
CrUX, INP, screen-reader or WCAG-conformance evidence.
