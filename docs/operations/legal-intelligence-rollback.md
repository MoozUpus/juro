# Legal-intelligence rollback

Disable the feature flag first, then stop the legal-source queue. Restore the matching
D1 manifest and index snapshot together, verify source hashes/version status and keep
the prior user-facing flow active. Never roll back by deleting user data, changing DNS,
or restoring production data without the established approval process.
