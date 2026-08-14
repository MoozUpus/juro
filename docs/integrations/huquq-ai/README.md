# Huquq AI integration

JURO uses selected, MIT-compatible **behavioural ideas** from Huquq AI while retaining
its own React/Next.js frontend, Cloudflare Worker, D1/R2, authorization, tenant
boundaries and OpenAI/Anthropic provider policy. It is not a fork and does not expose
Huquq AI branding, source corpus, screenshots, payment demo or Gemini integration.

The legal-answer path is: intent and language normalization → official/reviewed source
retrieval → sparse/dense candidate fusion → bounded ranking → coverage and exact-span
validation → OpenAI primary/retry or Anthropic fallback → citation-filtered answer.

Read [the matrix](ADOPTION_MATRIX.md) before changing the retrieval path. Rollout stays
feature-gated and production remains outside this integration.
