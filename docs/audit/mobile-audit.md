# JURO Mobile and Responsive Audit

Status: **partial Chrome responsive evidence; no physical-device certification**

Evidence cutoff: **2026-09-02 12:45 UZT**

## Checked viewports

| Viewport | Public site | Lawyer login | Individual shell |
| --- | --- | --- | --- |
| 390 × 844 | overflow 0; active locale 44 × 44 | overflow 0; overlap 0; Turnstile visible | overflow 0; case link 44 px; four settings tabs 44 px; one H1/main; v118 composer/card focus visible; all four quick cards fully scrolled into view |
| 768 × 1024 | all locale links 44 × 44 | overlap 0 | overflow 0; case link and settings tabs 44 px; one H1/main |
| 1024 × 768 | all locale links 44 × 44 | overlap 0 | overflow 0; case link and settings tabs 44 px; one H1/main |
| 1440 × 900 | all locale links 44 × 44 | overlap 0 | overflow 0; case link and settings tabs 44 px; one H1/main |

Local pre-release checks additionally covered 320 × 720. Production v115 evidence covers 390 × 844 theme controls, reveal visibility, and Lighthouse accessibility. These are lab/browser measurements, not field Core Web Vitals or physical-device results.

## Authenticated Lawyer responsive receipt

- A real Lawyer session completed 15 protected role routes at 390 × 844 with the temporary Chrome viewport override.
- Every checked route stayed on `lawyer.juro.uz`, retained a main landmark, avoided login fallback and 404, and had zero document-level horizontal overflow.
- Settings, security, and privacy initially showed their protected loading state; after it settled, each exposed one visible H1 and no visible alert. This prevents a premature loading-state snapshot from being misreported as a heading defect.
- The viewport override was reset to the normal 1536 px desktop width, and the user-owned tab was returned to `/ru/dashboard`.

## Resolved defects

1. Auth theme controls previously covered the login heading at 768 and 1024 px. v116 reserves the top control row at every viewport.
2. Public locale links were approximately 33 px wide on tablet/desktop. v116 enforces a 44 px minimum width.
3. The Individual case-row link was 17 px high and profile/settings tabs were 42 px high. v117 raises both to the 44 px touch-target floor across the checked matrix.
4. The dashboard quick-action rail previously left the second and fourth keyboard-focused cards mostly clipped at 390 px. v118 uses nearest-edge native scrolling on focus and adds explicit composer/card focus rings; production Chrome showed every card fully visible.

## Open responsive gates

- 320, 360, 375, 430, 1280, 1920 and orientation-change production passes for authenticated feature pages.
- Soft-keyboard, safe-area, 200%/400% zoom, long RU/UZ strings, tables, dialogs, upload progress, and error recovery.
- Physical iOS/Android and non-Chrome testing remain explicitly excluded unless the owner changes scope.
