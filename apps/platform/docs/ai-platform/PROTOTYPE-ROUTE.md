# Retired cinematic platform prototype

Updated: 2026-08-12
Status: retired from the application artifact; production UI remains unchanged.

The former staging-only cinematic routes, surface and scoped CSS were removed
because the current product scope excludes an AI/voice avatar. A runtime route
guard would keep the route unavailable in production, but its module and static
poster still entered the shared Worker artifact. The removal is therefore a
bundle and scope correction, not a production UI replacement.

Historical staging evidence remains in `STAGING-PHASE8-CINEMATIC-PROTOTYPE-EVIDENCE.md`
and `STAGING-PHASE9-BETA-EVIDENCE.md`; it does not describe a currently
available feature. The old `/prototypes/platform/cinematic` path now returns
`404` in the production artifact. Normal text chat, plain voice and the static
JURO brand image on onboarding remain separate, supported product surfaces.

Any future significant visual direction requires a new isolated prototype,
complete accessibility/performance evidence, and a separate owner approval
before a production UI replacement.
