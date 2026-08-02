# STAGING-0063 — lawyer-profile directory preview

Date: 2026-08-02 UTC  
Environment: protected staging only  
Worker: `juro-platform-staging` version `436fdea3-a5d9-41cd-9beb-24b43630bf57`  
Production: unchanged

## Scope

This deployment activates the independently gated lawyer-profile directory
preview. It includes the self-service lawyer profile endpoint, the fresh-MFA
staff moderation boundary, and the public-approved directory read path. The
route is enabled only when all three server-side conditions hold: staging
environment, `LAWYER_PROFILE_DIRECTORY_ENABLED=true`, and a bound D1 database.
Development and production resolve the feature as unavailable before session
processing.

## Backup and migration evidence

Before schema mutation, a complete remote export of `juro-staging`
(`bb716a96-b2fb-4823-90d6-6c228fed181a`) was uploaded to the private remote R2
bucket `juro-staging-backups`:

```text
object: d1/juro-staging/20260802T003607Z/pre-0058-0059-full.sql
bytes:  760307
sha256: 96e12a98b0c757b220bf69b3a9e90cdb59f191df4b5a9fc910bbc19f530d4eb8
```

The object was downloaded back from remote R2 and had the same SHA-256. Only
then were additive migrations `0058_innocent_ben_grimm.sql` and
`0059_pretty_punisher.sql` applied to `juro-staging`.

Wrangler subsequently reported no pending migrations. Direct staging D1 reads
confirmed both `lawyer_profiles` and `lawyer_profile_moderation`, including
`profile_revision` on the existing profile table. `PRAGMA quick_check` returned
`ok`; `PRAGMA foreign_key_check` returned no rows.

## Local and deployment verification

Commit `8be6945` contains the generated Wrangler binding refresh required by
CI after the staging-only flag was introduced.

```text
wrangler types --check   PASS
npm run type-check       PASS
npm run lint             PASS
npm test                 PASS (377 platform + 90 Cloudflare tests)
npm run validate:artifact PASS
npm run deploy:staging -- --dry-run PASS
npm run deploy:staging   PASS
```

The deployment output listed only staging D1, R2, Queue, Vectorize, Analytics,
Images, AI, and Asset bindings. `staging.app.juro.uz` returned the expected
Cloudflare Access redirect for an anonymous request; this proves the Access
boundary without bypassing it.

## Open verification gate

No authenticated browser session was available to traverse the profile and
staff moderation UI behind Cloudflare Access. Therefore this evidence does not
claim an owner UI click-through, a live pending-profile moderation decision, or
RU/UZ visual review. Those checks remain for an Access-authorized session with
synthetic staging accounts.
