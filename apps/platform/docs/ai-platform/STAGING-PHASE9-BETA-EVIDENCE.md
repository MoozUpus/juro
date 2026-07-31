# Phase 9 staging beta evidence

Updated: 2026-07-31
Status: technical staging checkpoint deployed; closed-beta gate not passed.

## Deployed candidate

- URL: `https://staging.app.juro.uz/ru/individual/prototypes/platform/cinematic`;
- Worker: `juro-platform-staging`;
- version: `5c574a35-8b5e-4912-be8b-da1aed57369c` at 100% traffic;
- source: `f78d389` for the provider-probe runtime (following current Phase 8 shell hardening);
- Access: owner-only Cloudflare Access, followed by the normal application session;
- production UI: unchanged.

The route uses real staging session, tenant, dashboard API, and canonical application components/routes. It does not create mock AI, document-analysis, handoff, voice, or avatar successes.

## Verified checkpoint

| Gate | Result | Evidence |
|---|---|---|
| Exact deployment | Pass | staging deployment version `5c574a35-8b5e-4912-be8b-da1aed57369c` |
| Staging-only resources | Pass | D1/R2/Queue/Vectorize/Analytics binding read-back |
| D1 integrity | Pass | `quick_check=ok`; zero FK rows; zero writes |
| Anonymous isolation | Pass | 2026-07-31 HTTP `HEAD`: root, RU/UZ prototype and canonical builder each return Access `302` with `no-store` |
| Production Worker invariant | Pass | `juro` remains `91774ed4-72e9-47bb-b93a-a4208d490b24` |
| Local regression | Pass | full test, builder/comparison artifact smokes, type/lint, Cloudflare matrix and type contract check |
| Secret-name inventory | Pass | read-only staging inventory lists `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` with no values read |
| Secret exposure | Pass for changed scope | Zero high-confidence matches; only secret names read remotely |
| Authenticated functional UI | Open | Browser-control kernel exits before navigation |
| RU/UZ visual matrix | Open | No authenticated screenshots for exact deployed version |
| Accessibility interaction | Open | Keyboard, axe, zoom, screen reader, focus restoration not run remotely |
| Performance/device | Open | LCP/INP/CLS, touch, slow mobile, GPU/memory not measured |
| Avatar/voice fallbacks | Partial | Static fallback is implemented; real 3D/STT/TTS is absent and feature-off |
| OpenAI provider | Pass (limited) | one fixed staging-only structured-output probe passed; no user content involved |
| Anthropic provider | Blocked | one fixed staging-only attempt ended `PROVIDER_UNAVAILABLE`; no automatic retry |
| Real document analysis | Blocked | Malware scanner is absent; provider secret names are present but no authenticated provider run is verified |

## Closed-beta matrix not yet executable

The requested avatar enabled/disabled, WebGL unavailable, reduced motion, slow mobile, microphone denied/interrupted, TTS unavailable, 3D failure, network reconnect, and RU/UZ expansion matrix cannot be marked pass from CSS/source contracts. The current static fallback honestly covers only the no-avatar/no-WebGL state.

The browser-control attempt failed before connection with `require is not defined in ES module scope`. Cloudflare Access was not bypassed, and no session token or cookie was inspected.

## Release judgment

This is not a closed beta and Phase 9 is not complete. It is a protected owner-review checkpoint suitable for manual inspection after Access login. The remaining work is Anthropic staging remediation, product/security completion, and authenticated QA, not a production deployment.

## Owner review route

After signing into Access and the staging application, open:

```text
https://staging.app.juro.uz/ru/individual/prototypes/platform/cinematic
```

The Uzbek route is:

```text
https://staging.app.juro.uz/uz/individual/prototypes/platform/cinematic
```

No production approval is requested at this checkpoint.

## Phase 9 provider checkpoint

Migration `0048` and one controlled cron probe are recorded in `STAGING-0048-PROVIDER-PROBE-EVIDENCE.md`. The flag is again `false`; the staging database passed `quick_check`, foreign-key validation, and no-pending-migration postflight. OpenAI transport/structured output is verified for the fixed synthetic request only. Anthropic is not release-ready: the current staging call returns `PROVIDER_UNAVAILABLE` and requires provider-account/key/model remediation before a new, separately keyed probe.
