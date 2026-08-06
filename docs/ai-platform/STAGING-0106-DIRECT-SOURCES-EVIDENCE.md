# Staging 0106 — direct official sources

Date: 2026-08-06

## Scope

This is a protected owner-only staging checkpoint. It adds query-scoped direct
retrieval of official Lex.uz and Advice.uz document pages to AI chat. It does
not write a legal corpus, raw HTML, chunks or embeddings. It does not modify
production.

## Deployment evidence

- D1 migration `0106_direct_legal_source_references.sql` was applied to
  `juro-staging` after a private backup/restore verification in
  `juro-staging-backups`.
- The applied Worker version is
  `14280f6b-ffed-435a-a95b-6aea28ee8b6f` for `juro-platform-staging`.
- Runtime flags confirm direct retrieval is enabled and legacy Advice/Lex
  ingestion, RSS discovery and staff source APIs remain disabled in staging.
- The delivered commits are `d764394`, `a695f0e` and `dd48297`.

## Technical source check

The direct path fetched and technically validated these query-relevant public
pages for the RU query `Об обществах с ограниченной ответственностью`:

- `https://lex.uz/ru/docs/8152146`
- `https://lex.uz/ru/docs/8161285`
- `https://advice.uz/ru/document/4668`

The check required canonical HTTPS paths, bounded content, the provider robots
policy, parsing, a content hash and a query-title relevance check. It found no
upstream error. A previously returned unrelated Advice result was excluded by
the deployed title-relevance filter. The cards display only the parsed title,
a bounded excerpt already shown to the user, canonical URL and retrieval
metadata; they do not transform model claims into cited legal findings.

## Owner beta acceptance

The owner accepts the existing reviewer decisions for 314 legal scenarios, 100
document-analysis packages and 30 comparison pairs solely as **private
staging-beta acceptance**. It enables owner-only system exercise without access
for other people. It is not an independent legal review, a claim that all
scenarios were executed, or a production-release approval.

## Remaining verification

The authenticated browser source-card smoke is pending because the Chrome
Cloudflare Access session expired before the post-deploy request. No Access
control was bypassed. The next owner login can verify one RU and one UZ query;
the expected D1 result is one or more bounded rows in
`legal_source_references` tied to the completed run, with no raw page content.
