# Huquq AI provenance

| Field | Value |
| --- | --- |
| Source repository | `https://github.com/toxirerkinov70-commits/huquq-ai` |
| Source commit | `1bce500c69b8213373d8ce0b40d56be7d83f6aec` |
| Audit date | 2026-08-14 |
| Original rightsholder | Copyright (c) 2026 Toxir Erkinov |
| Code licence | MIT; full notice at `third_party/licenses/huquq-ai-MIT.txt` |

No upstream implementation file is copied literally. No individual JURO source file
therefore bears a verbatim-derived-file header. The following behaviours were rewritten
for JURO: intent routing, query normalization and aliases, retrieval ranking, coverage,
grounded claim/citation validation, live-source tools, article chunking, drafting and
evaluation patterns. The dense+sparse Qdrant behaviour was also fully rewritten
as JURO-native TypeScript in `apps/platform/lib/legal-corpus/{embeddings,qdrant,qdrant-indexing,retrieval}.ts`;
no upstream Python/Qdrant client or deployment file was copied. Target paths and each decision are listed in
`docs/integrations/huquq-ai/ADOPTION_MATRIX.md`.

The Huquq AI local corpus, raw HTML, Markdown, screenshots, logos, product name, legal
texts, datasets, providers and dependency lockfiles were not copied. MIT covers source
code only; it does not grant independent rights in legal-source data or third-party
assets.
