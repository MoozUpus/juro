import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("user AI, document analysis, and monitoring use direct or metadata-only Lex paths", async () => {
  const [platformAi, guestAi, processor, monitor, scheduler] = await Promise.all([
    source("app/api/platform/ai/route.ts"),
    source("app/api/guest/ai/route.ts"),
    source("lib/document-analysis/processor.ts"),
    source("app/api/platform/monitoring/route.ts"),
    source("worker/platform-scheduled.ts"),
  ]);
  assert.match(platformAi, /retrieveLiveLexSources/);
  assert.match(platformAi, /const retrievalQuestion = rewrite\.query;/);
  assert.doesNotMatch(platformAi, /const retrievalQuestion = researchPlan\.primaryQuery;/);
  assert.match(guestAi, /retrieveLiveLexSources/);
  assert.match(processor, /retrieveLiveLexSourcesForDocument/);
  assert.match(monitor, /legal_monitoring_metadata/);
  assert.match(scheduler, /runLexMetadataMonitor/);
  for (const value of [platformAi, guestAi, processor, monitor, scheduler]) {
    assert.doesNotMatch(value, /retrieveInteractiveVerifiedLegalSources/);
    assert.doesNotMatch(value, /pending_review/);
  }
  assert.doesNotMatch(processor, /semanticSearch/);
});
