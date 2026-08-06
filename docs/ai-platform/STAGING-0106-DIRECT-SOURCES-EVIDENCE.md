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

## Authenticated browser smoke after Access renewal

After Cloudflare Access was renewed, a short RU staging question completed in
the authenticated browser. The AI provider completed normally, the UI rendered
two source cards and every rendered link passed the exact public allowlist for
`lex.uz` or `advice.uz`. The browser reported no console errors or warnings.

This is limited transport and UI evidence: it proves neither the legal merits
of the generated answer nor an independent review of either source. A direct
source card is not treated as a legal finding by the implementation.

An initial UZ-language meta-question correctly produced no card because the
title-relevance guard cannot cite a page merely about the system's own source
policy. A separate subject-matter UZ request did not settle within the bounded
browser window; its Stop control did not visibly settle before the tab was
navigated away. UZ completion remains an explicit follow-up rather than a
passed result.
