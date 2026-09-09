# Indexed Official Corpus architecture

Status: superseded by the implemented custom architecture — 2026-09-09

The canonical architecture is [Custom hybrid target architecture](./target-search-architecture.md). This document replaces the former transitional design so operators do not treat retired D1 body/posting storage, Cloudflare AI Search, Qdrant, or scheduled acquisition as live components.

## Implemented topology

The route-free legal-corpus Worker owns the official-evidence boundary. In staging and production it binds:

- a body-free legal catalog D1 containing source identity, compact evidence mappings, release roots, gates, Activation Sets and rollback events;
- immutable Evidence R2;
- immutable custom derivative-index R2;
- the current and history custom search services.

The Worker has no cron trigger and no legacy ingestion or index-building route. The platform has no legacy corpus-read service binding. Private document upload, quarantine, malware scanning and tenant-scoped document analysis remain unchanged; the former global owner-to-official-corpus promotion path is retired.

## Runtime invariants

- One unchanged Retrieval Formulation is sent to BM25 and dense search.
- Both candidate lanes are required for a general legal question.
- Candidate identities are checked against the pinned R2 mapping and body-free D1 control data before Evidence R2 hydration.
- Missing components fail closed into the strict Source Ladder.
- Activation and rollback select a complete current/history-compatible Activation Set atomically.
- Query and evidence text, vectors and postings are absent from durable telemetry.
- User-entered content is not rejected, replaced or redacted at retrieval.

## Retired compatibility history

Migrations through 0150 preserve the immutable history of the former official-corpus schemas. Forward migration 0151 guards that every retired table is empty and removes the body, chunk, sparse, posting and search-build schemas from the live D1 database. The former Qdrant Container, AI Search instances/namespaces, scheduled acquisition, legacy admin controls and legacy runtime callers are not recovery or rollback targets.

The accepted pre-retirement archive may be opened only in an isolated recovery environment for historical investigation. It must never be reattached to staging or production. See the current [backup](../operations/legal-corpus-backup.md), [restore](../operations/legal-corpus-restore.md) and [rollback](../operations/legal-corpus-rollback.md) runbooks.
