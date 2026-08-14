# Huquq AI integration

JURO uses selected, MIT-compatible **behavioural ideas** from Huquq AI while retaining
its own React/Next.js frontend, Cloudflare Worker, D1/R2, authorization, tenant
boundaries and OpenAI/Anthropic provider policy. It is not a fork and does not expose
Huquq AI branding, source corpus, screenshots, payment demo or Gemini integration.

The legal-answer path is: intent and language normalization → official source
retrieval → D1 BM25 plus optional Qdrant dense/sparse candidate fusion → D1
version/scope rehydration → bounded ranking → coverage and exact-span
validation → OpenAI primary/retry or Anthropic fallback → citation-filtered answer.

Read [the matrix](ADOPTION_MATRIX.md) before changing the retrieval path. Rollout stays
feature-gated; the Qdrant adapter and corpus ingestion remain disabled and production
activation remains outside this integration.
