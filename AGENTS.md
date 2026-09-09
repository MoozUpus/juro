## Agent skills

### Issue tracker

Issues are tracked as local Markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain documentation layout. See `docs/agents/domain.md`.

### Repository hygiene

Keep tracked code clean and limited to reusable product or operational code.
Use domain terminology instead of issue-tracker labels or work-item numbers in
code and durable documentation. Keep plans, evidence, generated helpers and
completed one-off tooling under `.scratch/`.

Applied migrations are immutable compatibility history: preserve their names
and contents, and use domain terminology for new migrations.
