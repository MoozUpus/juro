# Data model audit — 2026-08-07

The staging database is `juro-staging`; production `juro-production` was not
queried for mutation or migration in this work.

| Domain | Existing authoritative records | Current state |
|---|---|---|
| Identity and sessions | users, profiles, OTP, sessions, devices, TOTP and security events | Existing; preserved |
| Workspace isolation | workspaces, members, invitations and audit events | Existing; server authorization remains mandatory |
| AI and direct sources | chats, messages, AI runs and migration 0106 citation metadata | Direct path persists only source-card metadata and bounded excerpts |
| Files and analysis | files, scan results, derivatives, analysis, comparison and exports | Existing private-R2 pipeline; scanner fail-closed |
| Builder | documents, immutable versions, collaboration and signatures | Existing expand-contract migrations |
| Cases and plans | cases, tasks, action plans and events | Existing lifecycle evidence |
| Lawyers | lawyer profiles, requests, grants, reviews and moderation | Migration 0108 adds profile completeness/review lifecycle and photo metadata |
| Payments | orders, sandbox checkout and entitlement ledger | Demo-only; no production payment claim |
| Legacy legal corpus | source tables, queue and Vectorize indexes | Retained dormant; direct retrieval does not write to them |

The 2026-08-07 profile visibility correction is application-only: it changes
which already-stored R2 objects may be served publicly and requires no D1
migration.
