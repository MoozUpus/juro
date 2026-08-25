# AI cost control

## Pricing contract

JURO records append-only provider usage and resolves cost through effective-dated
price versions. A usage row without a matching version remains explicitly
`unpriced`; zero stored cost must never be interpreted as free usage.

The production price versions for the current standard, short-context routes are:

| Provider/model/operation | Input per 1M | Cached input per 1M | Output per 1M | Official source |
| --- | ---: | ---: | ---: | --- |
| OpenAI `gpt-5.6-sol` / Responses | $5.00 | $0.50 | $30.00 | [OpenAI API pricing](https://platform.openai.com/pricing) |
| OpenAI `gpt-5.6-terra` / Responses | $2.50 | $0.25 | $15.00 | [OpenAI API pricing](https://platform.openai.com/pricing) |
| OpenAI `text-embedding-3-large` / embeddings | $0.13 | — | — | [OpenAI model pricing](https://developers.openai.com/api/docs/models/text-embedding-3-large) |
| Anthropic `claude-sonnet-4-6` / Messages | $3.00 | $0.30 cache hit | $15.00 | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) |

These values apply to the routes JURO currently invokes: standard OpenAI
Responses without a selected Batch/Flex/Priority tier and global Anthropic
inference without `inference_geo=us`. A route change requires a new price
version, not mutation of history.

## Observed baseline

The last-30-day production usage snapshot taken on 2026-08-25 contained 58
requests across chat/document providers plus two embedding requests. Historical
rows were unpriced. Applying the table above only as a shadow estimate to their
recorded successful-token counts gives approximately **$0.84** total:

- Anthropic Sonnet: $0.0417;
- OpenAI `gpt-5.6-sol`: $0.3749;
- OpenAI `gpt-5.6-terra`: $0.4192;
- embeddings: $0.0005.

This is a reconstructed cost baseline, not a provider invoice. Failed requests
with zero recorded tokens contribute no estimated token cost, which may understate
billed work if a provider charged tokens before failure.

## Controls and alerts

- Preserve per-request token dimensions, provider/model/operation, result, and
  pricing status without prompt or document content.
- Block release if the current route has no effective price version.
- Alert on unpriced requests, daily/provider budget approach, failure spikes,
  fallback spikes, or cost-per-success regression.
- Prefer the less expensive validated route for ordinary questions; use deep
  reasoning only when the request warrants it.
- Treat caching as a measured optimization, never as an assumed discount.
- Review official pricing before each production release and create a new
  effective-dated version when it changes.
