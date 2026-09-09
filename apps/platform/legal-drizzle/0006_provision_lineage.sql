CREATE TABLE `legal_provision_lineage_edges` (
  `id` text PRIMARY KEY NOT NULL,
  `predecessor_concept_id` text NOT NULL,
  `successor_concept_id` text,
  `transition` text NOT NULL,
  `evidence_url` text NOT NULL,
  `review_state` text NOT NULL,
  `reviewed_by` text,
  `reviewed_at` text,
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`predecessor_concept_id`) REFERENCES `legal_provision_concepts`(`id`) ON DELETE restrict,
  FOREIGN KEY (`successor_concept_id`) REFERENCES `legal_provision_concepts`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_provision_lineage_transition_check`
    CHECK (`transition` IN ('unchanged','modified','renumbered','moved','split','merged','repealed')),
  CONSTRAINT `legal_provision_lineage_repeal_check`
    CHECK ((`transition`='repealed' AND `successor_concept_id` IS NULL)
      OR (`transition`<>'repealed' AND `successor_concept_id` IS NOT NULL)),
  CONSTRAINT `legal_provision_lineage_review_check`
    CHECK (`review_state` IN ('pending','accepted','rejected')),
  CONSTRAINT `legal_provision_lineage_reviewer_check`
    CHECK ((`review_state`='pending' AND `reviewed_by` IS NULL AND `reviewed_at` IS NULL)
      OR (`review_state`<>'pending' AND `reviewed_by` IS NOT NULL AND `reviewed_at` IS NOT NULL)),
  UNIQUE (`predecessor_concept_id`,`successor_concept_id`,`transition`,`evidence_url`)
);
--> statement-breakpoint
CREATE INDEX `legal_provision_lineage_predecessor_idx`
ON `legal_provision_lineage_edges` (`predecessor_concept_id`,`review_state`);
--> statement-breakpoint
CREATE INDEX `legal_provision_lineage_successor_idx`
ON `legal_provision_lineage_edges` (`successor_concept_id`,`review_state`);
--> statement-breakpoint
CREATE TABLE `legal_official_expression_equivalences` (
  `id` text PRIMARY KEY NOT NULL,
  `left_expression_id` text NOT NULL,
  `right_expression_id` text NOT NULL,
  `equivalence_kind` text NOT NULL,
  `evidence_url` text NOT NULL,
  `review_state` text NOT NULL,
  `reviewed_by` text,
  `reviewed_at` text,
  `recorded_at` text NOT NULL,
  FOREIGN KEY (`left_expression_id`) REFERENCES `legal_official_expressions`(`id`) ON DELETE restrict,
  FOREIGN KEY (`right_expression_id`) REFERENCES `legal_official_expressions`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_expression_equivalence_distinct_check`
    CHECK (`left_expression_id`<`right_expression_id`),
  CONSTRAINT `legal_expression_equivalence_kind_check`
    CHECK (`equivalence_kind` IN ('official_translation','cross_script','publisher_equivalent')),
  CONSTRAINT `legal_expression_equivalence_review_check`
    CHECK (`review_state` IN ('pending','accepted','rejected')),
  CONSTRAINT `legal_expression_equivalence_reviewer_check`
    CHECK ((`review_state`='pending' AND `reviewed_by` IS NULL AND `reviewed_at` IS NULL)
      OR (`review_state`<>'pending' AND `reviewed_by` IS NOT NULL AND `reviewed_at` IS NOT NULL)),
  UNIQUE (`left_expression_id`,`right_expression_id`,`equivalence_kind`,`evidence_url`)
);
--> statement-breakpoint
CREATE TRIGGER `legal_provision_lineage_edges_no_update`
BEFORE UPDATE ON `legal_provision_lineage_edges`
BEGIN SELECT RAISE(ABORT, 'LEGAL_PROVISION_LINEAGE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_official_expression_equivalences_no_update`
BEFORE UPDATE ON `legal_official_expression_equivalences`
BEGIN SELECT RAISE(ABORT, 'LEGAL_EXPRESSION_EQUIVALENCE_IMMUTABLE'); END;
