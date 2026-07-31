# Admin guide

Staff routes require a staff capability and fresh MFA. Legal source staff review is available at `/:locale/admin/legal-sources/reviews`; it exposes normalized snapshots, review decisions and publication controls. The health panel reports corpus freshness and distinct review, publication and fetch queues without returning source text through its API.

Use the existing audit records for staff actions. Do not treat health status as legal verification; only an approved publication is eligible for verified retrieval/indexing.