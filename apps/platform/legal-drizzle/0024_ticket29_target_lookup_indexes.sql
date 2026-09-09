CREATE INDEX IF NOT EXISTS `legal_evidence_locator_kind_sha_idx`
ON `legal_evidence_locators` (`object_kind`,`sha256`);
