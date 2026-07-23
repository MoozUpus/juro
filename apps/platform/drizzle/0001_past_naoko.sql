ALTER TABLE `document_share_links` ADD `public_token` text NOT NULL;--> statement-breakpoint
ALTER TABLE `standalone_signed_pdf_shares` ADD `public_token` text NOT NULL;