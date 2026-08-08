ALTER TABLE `document_risks` ADD `risk_type` text NOT NULL DEFAULT 'document_internal';--> statement-breakpoint
ALTER TABLE `document_risks` ADD `clause` text;--> statement-breakpoint
ALTER TABLE `document_risks` ADD `page` integer;--> statement-breakpoint
ALTER TABLE `document_risks` ADD `recommendation` text;--> statement-breakpoint
ALTER TABLE `document_risks` ADD `proposed_wording` text;--> statement-breakpoint
ALTER TABLE `document_risks` ADD `legal_basis_source_ids_json` text NOT NULL DEFAULT '[]';--> statement-breakpoint
CREATE TRIGGER document_risks_type_insert_guard
BEFORE INSERT ON document_risks
WHEN NEW.risk_type NOT IN ('document_internal','legal_compliance')
  OR (NEW.page IS NOT NULL AND NEW.page < 1)
  OR json_valid(NEW.legal_basis_source_ids_json) <> 1
  OR json_type(NEW.legal_basis_source_ids_json) <> 'array'
BEGIN
  SELECT RAISE(ABORT, 'document_risk_finding_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER document_risks_type_update_guard
BEFORE UPDATE ON document_risks
WHEN NEW.risk_type NOT IN ('document_internal','legal_compliance')
  OR (NEW.page IS NOT NULL AND NEW.page < 1)
  OR json_valid(NEW.legal_basis_source_ids_json) <> 1
  OR json_type(NEW.legal_basis_source_ids_json) <> 'array'
BEGIN
  SELECT RAISE(ABORT, 'document_risk_finding_invalid');
END;