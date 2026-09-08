# Huquq AI integration security

Status: historical controls; runtime superseded — 2026-09-09

The original integration's provenance and licensing controls remain valid audit history. Its D1 body/posting, Qdrant, AI Search, owner-promotion and scheduled acquisition surfaces are retired and must not receive credentials, routes or live bindings.

Current security invariants are defined by [Custom hybrid target architecture](../../legal-corpus/target-search-architecture.md): immutable evidence, R2-native mappings, body-free D1 control data, complete BM25 and dense lanes, request-local query vectors, content-free telemetry, strict Source Ladder failure and atomic Activation Set rollback. Use the maintained backup, restore and rollback runbooks under `docs/operations/`.
