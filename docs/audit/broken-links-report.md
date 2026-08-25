# Broken links report — 2026-08-25

## Public canonical crawl

- Source: live `https://juro.uz/sitemap.xml`.
- Sitemap response: 200, XML, 5,429 bytes.
- Canonical URLs discovered: 33.
- Final 2xx responses: 33.
- Unexpected redirects: 0.
- 4xx/5xx/timeouts: 0.

The crawl covers the current RU/UZ/EN public sitemap only. It does not imply
that a non-sitemap URL is valid, nor does it authenticate into Client, Lawyer or
Admin data.

## Platform edge checks

| URL family | Result |
| --- | --- |
| HTTP app/lawyer/admin/status | Exact 308 to HTTPS with method/path/query preserved |
| Client RU/UZ login | 200 and browser-rendered |
| Lawyer RU login | 200 and browser-rendered with Lawyer-specific copy/registration |
| Admin console without host session | Expected 303 protected-session handoff |
| Status API | 200, operational |
| Unknown signed-share verify | Expected 410 `LINK_EXPIRED`, no cookie |

## Scope still requiring a fresh crawl

- Every authenticated route under each role with a live session on the current
  release SHA.
- Dynamic record URLs for cases, documents, consultations and invitations,
  using bounded synthetic records only.
- All legacy aliases after any future router change.

Earlier exhaustive responsive/authenticated evidence is retained in
`docs/investor-ready/QA_MATRIX.md`; it is not silently relabelled as a fresh
current-release crawl.
