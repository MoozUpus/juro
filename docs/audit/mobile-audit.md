# JURO Mobile and Responsive Audit

Status: **partial Chrome responsive evidence; no physical-device certification**

Evidence cutoff: **2026-09-02 04:19 UZT**

## Checked viewports

| Viewport | Public site | Lawyer login | Individual shell |
| --- | --- | --- | --- |
| 390 × 844 | overflow 0; active locale 44 × 44 | overflow 0; overlap 0; Turnstile visible | overflow 0; sampled controls at least 44 px |
| 768 × 1024 | all locale links 44 × 44 | overlap 0 | responsive shell, one H1/main |
| 1024 × 768 | all locale links 44 × 44 | overlap 0 | responsive shell, one H1/main |
| 1440 × 900 | all locale links 44 × 44 | overlap 0 | desktop shell, one H1/main |

Local pre-release checks additionally covered 320 × 720. Production v115 evidence covers 390 × 844 theme controls, reveal visibility, and Lighthouse accessibility. These are lab/browser measurements, not field Core Web Vitals or physical-device results.

## Resolved defects

1. Auth theme controls previously covered the login heading at 768 and 1024 px. v116 reserves the top control row at every viewport.
2. Public locale links were approximately 33 px wide on tablet/desktop. v116 enforces a 44 px minimum width.

## Open responsive gates

- 320, 360, 375, 430, 1280, 1920 and orientation-change production passes for authenticated feature pages.
- Soft-keyboard, safe-area, 200%/400% zoom, long RU/UZ strings, tables, dialogs, upload progress, and error recovery.
- Physical iOS/Android and non-Chrome testing remain explicitly excluded unless the owner changes scope.
