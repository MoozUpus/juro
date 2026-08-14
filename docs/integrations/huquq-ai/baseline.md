# Huquq AI integration baseline

Recorded: 2026-08-14 (Asia/Tashkent)

| Item | Baseline |
| --- | --- |
| JURO commit | `044b6d97ac523c92c5c74a361f4e47a09c7e6e6e` |
| JURO branch before isolation | detached `HEAD` at the commit above |
| Integration branch | `feature/huquq-ai-integration` |
| Huquq AI commit | `1bce500c69b8213373d8ce0b40d56be7d83f6aec` |
| Huquq AI license | MIT, Copyright (c) 2026 Toxir Erkinov |
| Huquq AI issues | none open or closed at audit time |

## Working-tree safety

Before this integration added a file, the JURO checkout already had 152 modified or
untracked paths. They include existing AI, legal-source, UI, migration and test work.
They are treated as pre-existing user work: this integration does not overwrite, reset,
or claim them as a clean baseline. The full state was captured with `git status --short`
before the branch was created.

## Baseline checks

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | blocked | `apps/website` invokes `bash scripts/sites-env.sh`; `bash` is unavailable in the current Windows PowerShell environment. |
| `npm run type-check` | blocked | Same website `bash` prerequisite. |
| Platform lint/type-check/test/Cloudflare test in parallel | timed out | The combined process exceeded 180 seconds without a final result. This is not a pass or a failure of any individual check. |
| Production deployment | not run | Explicitly out of scope. |

## Configuration review

`.gitignore`, `.env.example`, `apps/platform/wrangler.jsonc`, D1/R2 bindings,
queue declarations, migrations and GitHub workflow directory were inspected. No secret
values are copied into this integration. Existing Lex ingestion remains explicitly
feature-gated; no corpus is added to Git.
