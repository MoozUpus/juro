# Legal corpus backup

Follow the [verification policy](./legal-corpus-verification.md). Reuse accepted immutable recovery evidence when it covers the affected state. Capture only missing recovery coverage for an exact state-changing target.

## Current custom release

A usable backup references, without copying legal text into Git:

- immutable Evidence R2 inventory roots and sampled SHA-256 readback;
- derivative-index R2 Retrieval Chunk, BM25 and reusable embedding manifests;
- the Vectorize contract, final processed mutation and exact full-list reconciliation identity;
- body-free legal D1 release roots, gates, query budgets, Activation Sets and rollback events;
- content-free provider usage and deletion receipts; and
- the active and immediately prior compatible current/history release identities.

Provider request or response bodies are not backup evidence. Query text, vectors, postings, secrets and private user documents must not appear in evidence.

An unchanged sealed release does not require another full export or restore rehearsal. A changed recovery format or path receives a bounded isolated fixture check. A release backup is incomplete if its R2 hashes, Vectorize membership or D1 roots disagree.

## Retired storage

The accepted pre-retirement archive at the recorded external backup location is the recovery authority for the former D1 body/posting data and Qdrant state. It is historical, not a live release backup. Do not create a replacement legacy snapshot, rebuild its embeddings, or attach it to a Worker. Historical migrations remain immutable.

## Credentials

The root `CLOUDFLARE_API_TOKEN` and platform `OPENAI_API_KEY` are ignored local credentials, never backup material. The root bootstrap token remains until every migration-program ticket is resolved. The final credential checkpoint pins the account, removes only that entry, deletes the file only if empty, scans for leakage and asks the owner to revoke the token.
