# 01: Verify the recovery bundle

**What to build:** Create and restore-test the accepted recovery bundle outside the repository before implementation or remote state changes, preserving the dirty worktree and complete corpus without treating user changes as disposable.

Blocked by: none

Status: ready-for-agent

- [x] The bundle contains a verified git bundle, HEAD/branch/upstream/status evidence, binary tracked/staged patches, and a durable overlay excluding generated browser profiles, caches, dependencies, build output, local Wrangler state, and secrets.
- [x] The complete legal-corpus archive is copied as a real file and its known SHA-256 is reverified.
- [x] The SHA-256 manifest covers every material backup file.
- [x] A clean temporary clone restores from the bundle, accepts the patches and overlay, and matches the backed-up logical content and hashes.
- [x] Backup and restore-verification evidence is recorded without secret values.

## Comments

**Resolution:** completed on 2026-08-30.

- Recovery bundle: `D:/Programming/WORK/juro-backups/legal-retrieval-architecture/20260830T171944Z/`
- Restore check: `D:/Programming/WORK/juro-backups/legal-retrieval-architecture/restore-check-20260830T171944Z/`
- Git bundle restored HEAD `c39f7a4b3d34a7d7dc82bba39df074f48b8c4669`; seven modified tracked files matched after line-ending normalization.
- All 184 durable overlay files restored with exact SHA-256 equality; 5,050 generated Chrome-profile files were deliberately excluded.
- Corpus archive SHA-256: `0F0F4601CB1B6B1654B18D1089A36F98886CA91196CF1899464596DF760FB51A`.
- Final manifest verification passed for 193 files. `restore-verification.json` and `sha256-manifest.json` contain the machine-readable evidence.

**Pre-implementation supplement (2026-08-30):**

- Recovery supplement: `D:/Programming/WORK/juro-backups/legal-retrieval-architecture/supplement-20260830T174205Z/`
- Restore check: `D:/Programming/WORK/juro-backups/legal-retrieval-architecture/restore-check-supplement-20260830T174205Z/`
- The current repository bundle restored HEAD `c39f7a4b3d34a7d7dc82bba39df074f48b8c4669`; all seven dirty tracked files and all 190 durable untracked files, including the final spec and twenty-one tickets, matched their source bytes by SHA-256.
- The supplement excluded the same 5,050 generated Chrome-profile files as the original bundle and captured no secret values.
- The source corpus archive and the retained real backup copy were both rehashed at `0F0F4601CB1B6B1654B18D1089A36F98886CA91196CF1899464596DF760FB51A` with byte count `2,771,228,492`.
- The refreshed SHA-256 manifest passed for 207 material files; `restore-verification.json`, `corpus-reference-verification.json`, and `sha256-manifest.json` contain the machine-readable evidence.
