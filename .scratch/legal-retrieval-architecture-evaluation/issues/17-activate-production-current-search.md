# 17: Canary and activate production current search

**What to build:** Build the production current Search Release, run it as a privacy-qualified production canary, complete 30 stable days, activate current retrieval, and rehearse rollback.

Blocked by: 16

Status: ready-for-agent

- [ ] The production current Search Release is deterministic, reconciles every item and metadata field, and satisfies all configuration, privacy, cost, quality, and latency gates.
- [ ] Only privacy-transformed real requests or approved synthetic/shadow traffic reach the production candidate during canary.
- [ ] Canary evidence remains green for 30 continuous days with persisted counts, failures, latency, cost, integrity, and Source Ladder outcomes.
- [ ] Current capability activates atomically while as-of and comparison remain explicitly unsupported.
- [ ] Production Legal Answers continue to use hash-verified R2 evidence, Controlling Text rules, and the strict Source Ladder.
- [ ] Rollback to the previous Activation Set and legacy Qdrant/D1 path succeeds without evidence mutation.
