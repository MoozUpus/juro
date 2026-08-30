# 13: Build and activate staging current search

**What to build:** Build Porter and trigram current Search Releases from the reconciled staging Corpus Snapshot, evaluate them in shadow mode, complete the required soak, activate the winner, and rehearse rollback.

Blocked by: 12

Status: ready-for-agent

- [ ] Current release artifacts are deterministic, remain below provider limits, and form one complete item inventory with exact metadata parity.
- [ ] Porter and trigram use the same multilingual, domain-breadth, ambiguity, adversarial, failure, cold/warm, and fast/deep evaluation matrix.
- [ ] The winning candidate satisfies every quality, integrity, latency, privacy, configuration, and cost gate.
- [ ] Staging records at least 14 continuous green days and 10,000 shadow or synthetic requests with no gate breach.
- [ ] The current capability activates atomically without claiming as-of or comparison support.
- [ ] Visible retrieval resolves candidates through AI Search and evidence through legal D1/R2 while preserving Legal Answer behavior.
- [ ] Rollback to the prior Qdrant/D1 Activation Set succeeds without mutating R2 or provider indexes.
