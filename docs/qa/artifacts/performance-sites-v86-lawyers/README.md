# Sites v86 lawyer-catalogue performance evidence

Captured on 2026-08-27 from
`https://juro.uz/ru/lawyers?qa=sites-v86-perf` in Chrome 151.

## Mobile trace profile

- viewport: `390×844`, mobile and touch, DPR 1;
- CPU: 4× slowdown;
- network: Fast 4G;
- field CrUX: unavailable for this route.

Three reload traces were retained as observations rather than collapsed into a
single best run:

| Run | LCP | TTFB | Render delay | CLS |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2,818 ms | 1,856 ms | 962 ms | 0.00 |
| 2 | 1,154 ms | 240 ms | 914 ms | 0.00 |
| 3 | 1,380 ms | 198 ms | 1,181 ms | 0.0004 |

The first run was a server-latency outlier and exceeded the 2.5-second LCP
goal. The two repeats were within the goal. This variability remains visible
in the audit instead of being silently discarded.

The trace found a 419×419 PNG profile photo transferred as 82,109 bytes for an
approximately 80×80 display, with an estimated 81 kB of wasted bytes. The same
response was incorrectly overwritten to `private, no-store`. The corresponding
source correction requests bounded 128 px and 288 px WebP variants and applies
public cache policy only to already-public, moderation-approved profile photos.
The production Worker cache is enabled explicitly so repeated transformed-image
requests can reuse the encoded result instead of repeating the Images operation.

The controlled Lighthouse 13.4.1 navigation scored 100 Accessibility, 100 Best
Practices, 100 SEO and 100 Agentic Browsing, with 58 passed and 0 failed. The
verbose accessibility tree exposed one H1, labelled catalogue filters and
named primary actions. It also exposed the Russian string `4 лет`; the source
now applies locale-aware year grammar (`4 года`) on catalogue and profile
views.

## Stored reports

| File | SHA-256 |
| --- | --- |
| `lighthouse-mobile.json` | `1B4B80E58EE087433F66123175844A4A30A86E66A6C7FF227BB20B0A79313DE1` |
| `lighthouse-mobile.html` | `DF12DA13830712241B7C0E9434E0322E4D4E20F81308CF2EC58374D9B270F4AD` |

The stored JSON and HTML reports contain zero matches for `authorization`,
`set-cookie`, `cf_clearance`, `__cf_bm`, `access_token`, `refresh_token`,
`session=` and `C:\\Users`.

This is lab evidence for the named public route. It is not field-performance,
INP, screen-reader or blanket WCAG-conformance evidence.

## Worker 152 follow-up

After CI run `33104695509` passed, Platform Worker 152
`47671380-a8fe-4d8c-95e2-bd7778541b0c` was deployed at 100%. The original photo
now receives the approved public cache policy. The bounded
`width=128&format=webp` response is `image/webp`, 2,106 bytes and changed from
`CF-Cache-Status: MISS` to `HIT` on the immediate repeat. Invalid width/format
values retained the 82,109-byte original PNG, while an unknown profile UUID
returned `404` with `no-store` and `BYPASS`. Production health was 8/8
operational with zero active/recent incidents at `2026-08-27T18:55:37.826Z`;
an error-only tail stayed empty after the verification requests.

Sites v86 still requests the original URL. The measured end-user WebP saving is
therefore not claimed live until a superseding Sites version is approved,
deployed and re-tested.
