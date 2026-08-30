# 02: Prove the dedicated legal-storage seam

**What to build:** Make the private legal-corpus Worker prove that it can reach an environment-isolated legal D1 database and legal R2 bucket through the existing platform service binding. The existing retrieval path must remain unchanged while this target storage path is introduced beside it.

Blocked by: 01

Status: ready-for-agent

- [x] Development, staging, and production declare distinct legal D1, legal R2, Worker, and platform service-binding identities without exposing a public route.
- [x] A private readiness request verifies both target stores and rejects unbound, cross-environment, or publicly routed requests.
- [x] The first forward legal-D1 migration contains only the control records required to identify the environment and migration state; it contains no legal body text.
- [x] Existing platform retrieval and corpus ingestion continue to use their legacy stores without visible behavior changes.
- [x] Tests exercise readiness through the private service-binding Interface with isolated local D1 and R2 Adapters.
- [x] No remote resource is mutated without fresh backup evidence from ticket 01's contract.

## Comments

**Verification (2026-08-30):**

- Added the generated-binding-backed target readiness seam in `lib/legal-corpus/target-storage.ts`, integrated only at the route-free legal-corpus Worker, and declared isolated `juro-legal-catalog-*` / `juro-legal-evidence-*` identities plus environment-specific platform service bindings.
- Added `legal-drizzle/0001_target_control.sql`; inspection tests prove it contains only environment/migration control and no body, quotation, or sparse-posting columns.
- Red/green seam evidence: `npx tsx --test tests/legal-target-storage.test.ts` failed first with `ERR_MODULE_NOT_FOUND`, then passed 4/4 after implementation.
- Regression evidence: platform type-check passed; generated Wrangler bindings are current; the target, Worker-boundary, and Cloudflare-config suites passed 27/27 with the Cloudflare loader.
- `npm run validate:legal-corpus:artifact` completed a staging dry-run and reported the distinct legal D1/R2 bindings. No remote resource or active retrieval setting was mutated for this ticket.
