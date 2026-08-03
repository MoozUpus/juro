-- One order may have one active sandbox checkout attempt. This is additive and
-- lets a failed attempt be retried after its status transitions to `failed`.
-- It closes the race where two distinct request IDs confirm the same priced order.
CREATE UNIQUE INDEX `payment_attempts_order_open_uidx`
  ON `payment_attempts` (`order_id`)
  WHERE `internal_status` = 'client_action_required';
