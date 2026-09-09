CREATE TABLE `legal_ai_search_projection_checkpoints` (
  `build_id` text NOT NULL,
  `lane` text NOT NULL,
  `status` text NOT NULL,
  `cursor` text,
  `copied_item_count` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL,
  `completed_at` text,
  PRIMARY KEY (`build_id`,`lane`),
  FOREIGN KEY (`build_id`) REFERENCES `legal_ai_search_projection_builds`(`id`) ON DELETE restrict,
  CONSTRAINT `legal_ai_search_projection_lane_check`
    CHECK (length(`lane`)=2 AND `lane` NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `legal_ai_search_projection_checkpoint_status_check`
    CHECK (`status` IN ('building','complete')),
  CONSTRAINT `legal_ai_search_projection_checkpoint_count_check`
    CHECK (`copied_item_count`>=0)
);
