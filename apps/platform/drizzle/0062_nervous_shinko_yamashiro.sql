CREATE TABLE `memory_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_id` text NOT NULL,
	`conversation_id` text,
	`message_id` text,
	`source_type` text NOT NULL,
	`source_ref` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`memory_id`) REFERENCES `user_memories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "memory_sources_type_check" CHECK("memory_sources"."source_type" IN ('manual','chat','profile'))
);
--> statement-breakpoint
CREATE INDEX `memory_sources_memory_idx` ON `memory_sources` (`memory_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `memory_sources_conversation_idx` ON `memory_sources` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text,
	`scope` text DEFAULT 'global' NOT NULL,
	`scope_key` text NOT NULL,
	`category` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`key_version` text NOT NULL,
	`content_sha256` text NOT NULL,
	`source_kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_memories_scope_check" CHECK("user_memories"."scope" IN ('global','workspace')),
	CONSTRAINT "user_memories_scope_key_check" CHECK(("user_memories"."scope"='global' AND "user_memories"."workspace_id" IS NULL AND "user_memories"."scope_key"='global') OR ("user_memories"."scope"='workspace' AND "user_memories"."workspace_id" IS NOT NULL AND "user_memories"."scope_key"='workspace:' || "user_memories"."workspace_id")),
	CONSTRAINT "user_memories_category_check" CHECK("user_memories"."category" IN ('profile_name','language','company','answer_style','user_instruction','counterparty','legal_context','typical_requisite')),
	CONSTRAINT "user_memories_source_kind_check" CHECK("user_memories"."source_kind" IN ('manual','automatic','profile')),
	CONSTRAINT "user_memories_status_check" CHECK("user_memories"."status" IN ('active','deleted')),
	CONSTRAINT "user_memories_hash_check" CHECK(length("user_memories"."content_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_memories_identity_uidx` ON `user_memories` (`user_id`,`scope_key`,`content_sha256`) WHERE `user_memories`.`status` = 'active';--> statement-breakpoint
CREATE INDEX `user_memories_user_status_idx` ON `user_memories` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `user_memories_workspace_status_idx` ON `user_memories` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `user_memory_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`automatic_enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
