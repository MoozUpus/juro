-- Deferred Source Snapshot inventories are immutable qualification evidence.
-- Existing rows were validated before this additive guard migration.
CREATE TRIGGER `legal_source_snapshot_deferred_inventories_validate_insert`
BEFORE INSERT ON `legal_source_snapshot_deferred_inventories`
WHEN NEW.`item_count` < 0
  OR length(NEW.`inventory_sha256`) <> 64
  OR NEW.`inventory_sha256` GLOB '*[^0-9a-f]*'
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_DEFERRED_INVENTORY_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER `legal_source_snapshot_deferred_inventories_no_update`
BEFORE UPDATE ON `legal_source_snapshot_deferred_inventories`
BEGIN SELECT RAISE(ABORT, 'LEGAL_SOURCE_SNAPSHOT_DEFERRED_INVENTORY_IMMUTABLE'); END;
