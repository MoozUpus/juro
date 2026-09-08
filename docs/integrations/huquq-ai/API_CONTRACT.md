# Huquq AI integration API contract

Status: retired — 2026-09-09

The legacy D1/Qdrant corpus API contract has no active caller, route or service binding. Do not implement a new caller against its historical shapes.

The maintained retrieval contract is defined by [Custom hybrid target architecture](../../legal-corpus/target-search-architecture.md): one unchanged Retrieval Formulation reaches both BM25 and dense lanes; R2-native mappings and body-free D1 revalidate candidates; missing components fail closed into the strict Source Ladder.
