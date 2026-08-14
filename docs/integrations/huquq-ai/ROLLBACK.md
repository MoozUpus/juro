# Rollback

1. Set the legal-intelligence feature flag to disabled or zero rollout; retain the
   pre-existing answer path.
2. Stop legal source queue consumers before changing index data.
3. Restore the last validated D1 source manifest and Vectorize snapshot only in a
   non-production rehearsal first.
4. Verify a known source hash, version, status, article link and access control.
5. Re-enable shadow mode before any controlled rollout. Do not deploy or change DNS as
   part of this document.
