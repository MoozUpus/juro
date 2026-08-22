CREATE TABLE `lawyer_call_rooms` (
  `id` text PRIMARY KEY NOT NULL,
  `consultation_id` text NOT NULL,
  `provider` text DEFAULT 'cloudflare_realtime_turn' NOT NULL,
  `status` text DEFAULT 'waiting' NOT NULL,
  `started_at` text,
  `ended_at` text,
  `ended_by_user_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`consultation_id`) REFERENCES `lawyer_consultations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`ended_by_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE set null,
  CHECK (`provider` IN ('cloudflare_realtime_turn','cloudflare_stun_only')),
  CHECK (`status` IN ('waiting','active','ended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_call_rooms_consultation_uidx`
  ON `lawyer_call_rooms` (`consultation_id`);
--> statement-breakpoint
CREATE INDEX `lawyer_call_rooms_status_idx`
  ON `lawyer_call_rooms` (`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `lawyer_call_participants` (
  `room_id` text NOT NULL,
  `user_id` text NOT NULL,
  `role` text NOT NULL,
  `device_readiness_json` text NOT NULL,
  `prepared_at` text NOT NULL,
  `joined_at` text,
  `last_seen_at` text NOT NULL,
  `left_at` text,
  PRIMARY KEY (`room_id`,`user_id`),
  FOREIGN KEY (`room_id`) REFERENCES `lawyer_call_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`role` IN ('client','lawyer'))
);
--> statement-breakpoint
CREATE INDEX `lawyer_call_participants_presence_idx`
  ON `lawyer_call_participants` (`room_id`,`last_seen_at`);
--> statement-breakpoint
CREATE TABLE `lawyer_call_signals` (
  `id` text PRIMARY KEY NOT NULL,
  `room_id` text NOT NULL,
  `sender_user_id` text NOT NULL,
  `recipient_user_id` text NOT NULL,
  `signal_type` text NOT NULL,
  `payload_json` text NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  FOREIGN KEY (`room_id`) REFERENCES `lawyer_call_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`sender_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`recipient_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`signal_type` IN ('offer','answer','ice','restart'))
);
--> statement-breakpoint
CREATE INDEX `lawyer_call_signals_recipient_idx`
  ON `lawyer_call_signals` (`room_id`,`recipient_user_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `lawyer_call_signals_expiry_idx`
  ON `lawyer_call_signals` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `lawyer_call_events` (
  `id` text PRIMARY KEY NOT NULL,
  `room_id` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `event_type` text NOT NULL,
  `metadata_json` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`room_id`) REFERENCES `lawyer_call_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
  CHECK (`event_type` IN ('prepared','joined','left','ended','reconnected'))
);
--> statement-breakpoint
CREATE INDEX `lawyer_call_events_room_idx`
  ON `lawyer_call_events` (`room_id`,`created_at`);
