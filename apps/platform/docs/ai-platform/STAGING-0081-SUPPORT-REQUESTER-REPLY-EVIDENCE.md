# Staging 0081 — requester support replies

Date: 2026-08-02

- An authenticated requester can reply to an open or `waiting_user` ticket from Help.
- The server validates the bounded message, verifies active workspace and requester ownership, writes a real D1 `support_messages` row, restores the ticket to `open`, and records `support_ticket_replied` in workspace audit.
- Closed tickets return `TICKET_RESOLVED` and cannot be silently reopened.
- Verification before staging: type-check, lint, tests, staging build, artifact validation, and diff check passed. No migration or production change.

Staging Worker `juro-platform-staging` deployed version `20d47aa7-7911-48b1-8d88-5f06256a138e`.
