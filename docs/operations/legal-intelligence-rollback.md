# Legal-intelligence rollback

Disable the feature flag first, then stop the legal-source queue. Restore the matching
D1/R2 manifest and Qdrant collection snapshot together, verify source hashes,
version status, exact point count and representative hybrid queries, and keep
the prior user-facing flow active. Never roll back by deleting user data,
changing DNS, pairing an index with a different corpus snapshot, or restoring
production data without the established approval process.
