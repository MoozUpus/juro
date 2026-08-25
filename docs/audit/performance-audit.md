# Performance audit — 2026-08-25

## What is measured

The production artifact passed raw emitted-byte regression budgets:

| Surface | Current | Limit | Status |
| --- | ---: | ---: | --- |
| Client CSS | 591.9 KiB | 600 KiB | PASS, only 8.1 KiB headroom |
| Initial browser JS | 295.3 KiB | 320 KiB | PASS |
| Largest lazy route increment | 208.1 KiB | 240 KiB | PASS; Document Builder is the largest increment |
| Fonts | 453.6 KiB | 512 KiB | PASS |
| Images | 564.4 KiB | 640 KiB | PASS |
| Worker entry | 3771.3 KiB | 6144 KiB | PASS |

Three direct production samples from the current workstation produced these
median HTTP timings. They include network/location effects and are not browser
paint metrics.

| URL | Median TTFB | Median total | Response bytes |
| --- | ---: | ---: | ---: |
| `https://juro.uz/ru` | 286.8 ms | 355.9 ms | 82,740 |
| Client login | 280.6 ms | 290.4 ms | 19,129 |
| Lawyer login | 236.1 ms | 237.3 ms | 19,178 |
| Status API | 302.1 ms | 302.7 ms | 7,564 |

## Findings

- P2: CSS is within budget but at 98.7% of its limit. Any new global styling
  needs attribution and preferably route-level containment.
- P2: Document Builder owns the largest lazy increment. It is already lazy,
  but should be the first target for coverage-based unused-JS analysis.
- PASS: production builds are minified and route chunks are emitted separately;
  the UI exposes skeleton/progress states in the exercised flows.
- UNVERIFIED: LCP, INP, CLS, TBT, Speed Index, render-blocking savings, unused
  JS coverage and network dependency chains. The required `chrome-devtools`
  MCP (`performance_start_trace`) was not available.

## Required completion gate

Install/configure `chrome-devtools-mcp`, trace at least the RU public home,
Client login and one authenticated dashboard with mobile throttling, then record
LCP <=2.5 s, INP/TBT evidence, CLS <=0.1, request chains and accessibility
snapshot. Until that evidence exists, this audit must not claim Lighthouse 90+
or that the Core Web Vitals targets are met.
