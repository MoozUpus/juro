# Public Sites v86 performance evidence

Captured on 2026-08-27 against
`https://juro.uz/ru?qa=sites-v86-perf` with Chrome 151 and Chrome DevTools MCP.

## Controlled results

- Mobile/touch trace: `390×844`, DPR 1, 4× CPU slowdown, Fast 4G.
- LCP 1,956 ms: TTFB 234 ms and render delay 1,723 ms.
- CLS 0.0001 in the trace and 0.0012 in a separate 16-second
  `PerformanceObserver` capture.
- Maximum critical path 1,995 ms; the terminal requests were the Manrope Latin
  and Cyrillic fonts.
- Render-blocking insight estimated 0 ms LCP/FCP saving.
- DOM: 619 elements, maximum depth 11.
- Forced reflow: 302 ms total, with no estimated metric saving.
- Lighthouse 13.4.1 navigation: Accessibility 100, Best Practices 100, SEO
  100, Agentic Browsing 100; 59 passed and 0 failed; CLS 0.

The saved reports are the controlled run after clearing an already active
external device override. An earlier overlapping-emulation run reported CLS
0.171; the controlled rerun and longer observer did not reproduce it.

## Files

| File | SHA-256 |
| --- | --- |
| `ru-home-mobile-lighthouse.json` | `EDFFEF78F51F4ED12B338BFAC76E993642349E1EC3A494FF4D16CA7788F9F7A8` |
| `ru-home-mobile-lighthouse.html` | `ED1C43F860FB76C1FD416C929A1994D170BC5315AC0F480FF95AAFE8137ECE41` |

These reports contain only the already-public page and its public URLs. No
authentication header, session cookie, access token or private application
payload was captured.
