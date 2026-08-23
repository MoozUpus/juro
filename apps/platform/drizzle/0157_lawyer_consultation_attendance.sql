-- Add an explicit attendance outcome without rebuilding the consultation table
-- referenced by participant-scoped call rooms. The lifecycle status remains
-- `completed`; `attendance_outcome=no_show` distinguishes a consultation that
-- did not take place from one completed with a result note.
ALTER TABLE `lawyer_consultations`
  ADD COLUMN `attendance_outcome` text
  CHECK (`attendance_outcome` IS NULL OR (
    `attendance_outcome` = 'no_show'
    AND `status` = 'completed'
    AND `result_note` IS NULL
  ));
--> statement-breakpoint
CREATE INDEX `lawyer_consultations_attendance_idx`
  ON `lawyer_consultations` (`status`,`attendance_outcome`,`starts_at`);
