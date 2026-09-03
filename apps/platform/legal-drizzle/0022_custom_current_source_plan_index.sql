-- The custom current build joins release items by immutable release and
-- provision-rendition identity. Without this lookup path SQLite scans every
-- item in the source release once per snapshot member and exceeds D1 CPU.
CREATE INDEX `legal_search_release_item_provision_idx`
ON `legal_search_release_items` (`search_release_id`,`provision_rendition_id`);
