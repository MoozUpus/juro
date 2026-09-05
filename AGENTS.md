## Agent skills

### Issue tracker

Issues are tracked as local Markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain documentation layout. See `docs/agents/domain.md`.

### Repository hygiene

Tracked code and durable documentation must use domain terminology, never issue
or work-item numbers. Keep issue-specific plans, evidence, generated helpers and
completed one-off tooling under `.scratch/`.

Applied migrations are immutable compatibility history: never rename or rewrite
one to remove a historical identifier, and never add an issue identifier to a
new migration.

Before committing, run
`git grep -n -i -E 'tickets?[ _:-]*[0-9]+' -- . ':(exclude).scratch/**' ':(exclude)apps/platform/legal-drizzle/0023_complete_corpus_materialization.sql'`
and require no matches. For newly added migrations, also require both the staged
path list and staged diff to have no matches for that expression. Customer-support
tickets are product terminology and are not issue identifiers.
