-- Qualification anti-joins are exact full-set checks. Keep their lookup paths
-- bounded without changing any evidence or release membership.
CREATE INDEX `legal_retrieval_eligibility_build_lookup_idx`
ON `legal_retrieval_eligibility` (`build_id`,`capability`,`status`,`snapshot_provision_id`);
--> statement-breakpoint
CREATE INDEX `legal_source_snapshot_release_provision_idx`
ON `legal_source_snapshot_release_members` (`search_release_id`,`snapshot_provision_id`,`canonical_chunk_id`);
