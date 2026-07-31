# JURO AI platform documentation

Updated: 2026-07-30

This directory is the evidence-backed engineering record for the staged JURO AI platform program. Documentation distinguishes four states explicitly:

- **deployed production** — observed on Sites v20 or legacy Worker `juro`;
- **local integration branch** — implemented and tested locally, not remote evidence;
- **staging verified** — reserved for operations actually exercised against isolated staging;
- **target/deferred** — design or architecture contract, not an implementation claim.

No document in this directory authorizes or implies a production schema, traffic, resource, secret, or UI change.

## Phase 0 evidence

- `CURRENT-STATE-AUDIT.md` — source lineage, runtime truth, remote inventory, and local baseline.
- `ROUTE-INVENTORY.md` — deployed/local route separation and migration rules.
- `DATA-MODEL-AUDIT.md` — schema/migration/domain coverage and defects.
- `SECURITY-AUDIT.md` — deployed findings, local remediations, and staging gates.
- `DESIGN-AUDIT.md` — source-based UX/design/motion/accessibility audit and Before/After/Why evidence.
- `IMPLEMENTATION-PLAN.md` — ordered Phase 0–10 execution and release gates.
- `THREAT-MODEL.md` — protected assets, trust boundaries, threats, invariants, and test strategy.
- `DECISIONS.md` — material architecture/security/operations decisions.

## Cloudflare and operations

- `CLOUDFLARE-RESOURCES.md` — verified production inventory, scoped non-production provisioning, and source/target configuration.
- `D1-MIGRATIONS.md` — checked-in migrations, verified staging bootstrap manifest, and remote application state.
- `R2-STORAGE.md` — private storage inventory, target names, object policy, and additive cutover.
- `BACKUP-RESTORE.md` — backup evidence contract, Time Travel checkpoints, portable private-R2 exports, isolated restore evidence, and still-open operational RTO.
- `STAGING-0034-EVIDENCE.md` — exact pre/post bookmarks, hashes, isolated restore, migration, deployment, synthetic workspace, protected browser QA, and rollback evidence for the current staging checkpoint.
- `SECRETS.md` — server-only secret names/contracts and presence-by-name inventory, never values.
- `RETENTION.md` — implemented account-deletion lifecycle, retained evidence, purge order, and open retention gates.
- `SECURITY.md` — implemented platform controls, environment isolation, release evidence, and open security gates.
- `DATA-MODEL.md` — additive domain model, migration `0033` deletion/tombstone contract, and staged `0034` business-workspace identity contract.
- `IMPLEMENTED-FEATURES.md` and `DEFERRED-FEATURES.md` — evidence-backed implemented/deferred register.

## Identity foundation

- `PHASE-2-IDENTITY-ACCESS.md` — local identity/access security implementation evidence and remaining remote gates.

## Legal knowledge foundation

- `LEGAL-SOURCES.md` — local fail-closed source/version/review lifecycle,
  trust boundary, evidence requirements, and unimplemented ingestion/retrieval
  gates.

- `AI-SAFETY.md` — implemented provider/source/freshness safety boundaries and
  remaining live-provider gates.
- `LEGAL-EVALUATION.md` — automated legal-source evidence tests and the still
  unfulfilled 250+50 human-reviewed release matrix.
- `DOCUMENT-EVALUATION.md` — implemented document-analysis contract evidence
  and the still unfulfilled 100-package/30-comparison quality gate.

## Cinematic Legal Intelligence

- `VISUAL-DIRECTION.md` — approved product direction and source-audit constraints.
- `CINEMATIC-LEGAL-INTELLIGENCE.md` — shell/work-surface/token/motion/evidence contract.
- `DESIGN-SYSTEM.md` — concrete semantic tokens, typography, component behavior, motion, accessibility, and migration order.
- `PROTOTYPE-ROUTE.md` — staging-only route and verification boundary.
- `JUROBEK-3D.md` — asset hash/inventory, missing rig blocker, and static fallback.

## Documentation lifecycle

The remaining owner-required documents are created or expanded only alongside the corresponding implemented vertical slice, so they describe actual contracts and evidence rather than speculative completion. Every staging claim must include a resource identity, command/test result, HTTP smoke, durable-record/object evidence where applicable, and known limitations. Production requires two separate future approvals: functional platform deployment and Cinematic UI replacement.
- LEGAL-SOURCE-SYNC.md — the implemented Lex acquisition, robots-policy, normalization, review, and publication boundary.
- STAGING-0036-EVIDENCE.md — migration 0036, backups, remote restore, Worker version, live Lex acquisition/parse, private R2 hashes, replay evidence, and remaining gates.
