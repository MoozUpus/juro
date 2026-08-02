# Staging 0074 — privacy-safe active-session region

Date: 2026-08-02

## Deployed change

The existing active JURO email-session list now returns and displays only the
last coarse country and region codes already attached to a valid device
continuity record. It does not collect or return raw IP addresses, User-Agent,
city, coordinates, or external-provider session data. Missing evidence is shown
as unavailable rather than inferred.

## Deployment evidence

- Environment: `staging`
- Worker: `juro-platform-staging`
- Worker version: `b59a155e-49bc-4600-92e0-7b42d42964b6`
- Route: `/:locale/:accountType/settings/security`
- Storage: existing `auth_device_continuities` data in private staging D1

## Verification

- Type-check — passed
- Lint — passed
- Full platform suite — passed: 386 tests
- Cloudflare/migration/job suite — passed: 91 tests
- Staging build and artifact validation — passed
- Static contract verifies continuity-only join and rejects raw-IP/User-Agent
  fields from the session route
- Deployment output confirms staging-only D1/R2/Queue/Vectorize/Analytics bindings

Authenticated browser verification remains protected by Cloudflare Access.
Production and schema are unchanged.
