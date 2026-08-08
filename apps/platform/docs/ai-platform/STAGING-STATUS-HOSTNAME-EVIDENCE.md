# Staging public-status hostname evidence

Date: 2026-08-06  
Environment: staging only  
Worker: `juro-platform-staging`  
Hostname: `https://status.staging.juro.uz`  
Workers Domains ID: `dc23f52d4c2ad8b32d2aab7df752b02d59dc0a27`

## Change boundary

The hostname is attached only to the staging Worker. It uses the existing
`STATUS_HOSTNAME` host fence in `worker/index.ts`: only the public status
routes and required static assets are reachable; non-GET/HEAD requests are
rejected. No production hostname, production Worker, production D1 database,
production R2 bucket, Access policy, secret or DNS route was changed.

The Worker adds `X-Robots-Tag: noindex, nofollow, noarchive` to every response,
including this public staging host. This prevents the staging status page and
JSON endpoint from being offered to search indexes.

## HTTPS smoke evidence

Both public requests completed with a verified TLS connection and returned
`200`:

| Request | Content-Type | Cache-Control | X-Robots-Tag |
| --- | --- | --- | --- |
| `GET /` | `text/html; charset=utf-8` | `public, max-age=0, s-maxage=30, stale-while-revalidate=60` | `noindex, nofollow, noarchive` |
| `GET /api/status?lang=uz` | `application/json; charset=utf-8` | `public, max-age=0, s-maxage=30, stale-while-revalidate=60` | `noindex, nofollow, noarchive` |

The JSON projection contains only the eight public component keys, public
incident state and localized copy. It does not expose user, tenant, staff,
resource-ID or secret data.

The host fence also rejected two negative probes, each retaining the noindex
header:

| Request | Expected boundary | Observed result |
| --- | --- | --- |
| `GET /ru/individual/ai-lawyer/new` | the application must not be reachable on the public status hostname | `404 Not Found` |
| `POST /api/status` | public status is read-only | `405 Method Not Allowed`; `Allow: GET, HEAD` |

## What this does not prove

Component values are operator-reported status, not proof that OpenAI,
Anthropic, malware scanning, document analysis or email delivery works for an
end user. This hostname evidence does not replace authenticated browser QA,
synthetic component probes, an incident rehearsal, legal evaluation, scanner
evidence or a production deployment.

## Rollback

If the staging status host must be removed, delete only the Workers Domains
attachment `dc23f52d4c2ad8b32d2aab7df752b02d59dc0a27` and its certificate DNS
validation record after confirming no other hostname depends on it. This is a
staging-only network change; do not alter `status.juro.uz`.
