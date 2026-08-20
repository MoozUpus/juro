# Rollback

1. Set the legal-intelligence feature flag to disabled or zero rollout; retain the
   pre-existing answer path.
2. Stop legal source queue consumers before changing index data.
3. Restore the last validated D1 source manifest, private-R2 Qdrant collection
   snapshot and private-document Vectorize state only in a non-production
   rehearsal first. Verify the manifest and object SHA-256 before Qdrant upload.
4. Verify a known source hash, version, status, article link and access control.
5. Re-enable shadow mode before any controlled rollout. Do not deploy or change DNS as
   part of this document.
