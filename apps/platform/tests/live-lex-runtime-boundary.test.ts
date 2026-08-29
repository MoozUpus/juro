import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("user AI prefers the gated corpus with direct Lex fallback while other paths stay bounded", async () => {
  const [platformAi, guestAi, corpusAware, processor, monitor, scheduler] = await Promise.all([
    source("app/api/platform/ai/route.ts"),
    source("app/api/guest/ai/route.ts"),
    source("lib/legal-corpus/chat-retrieval.ts"),
    source("lib/document-analysis/processor.ts"),
    source("app/api/platform/monitoring/route.ts"),
    source("worker/platform-scheduled.ts"),
  ]);
  assert.match(platformAi, /retrieveCorpusAwareLegalSources/);
  assert.match(platformAi, /const retrievalUnderstandingPromise = \(async/);
  assert.match(platformAi, /const retrievalQuestion = retrievalUnderstanding\.standaloneQuestion;/);
  assert.match(platformAi, /indexQueries: retrievalUnderstandingPromise\.then\(\(understanding\) => understanding\.corpusQueries\)/);
  assert.match(platformAi, /lexSearchQueries: retrievalUnderstandingPromise\.then\(\(understanding\) => understanding\.lexSearchQueries\)/);
  assert.doesNotMatch(platformAi, /const retrievalQuestion = researchPlan\.primaryQuery;/);
  assert.match(guestAi, /retrieveCorpusAwareLegalSources/);
  assert.match(corpusAware, /retrieveLiveLexSources/);
  assert.match(corpusAware, /LEGAL_CORPUS_ENABLED/);
  assert.match(corpusAware, /LEGAL_CORPUS_LIVE_LEXUZ_ENABLED/);
  assert.match(corpusAware, /enqueueOfficialLexCorpusDocument/);
  assert.match(processor, /retrieveLiveLexSourcesForDocument/);
  assert.match(monitor, /legal_monitoring_metadata/);
  assert.match(scheduler, /runLexMetadataMonitor/);
  for (const value of [platformAi, guestAi, processor, monitor, scheduler]) {
    assert.doesNotMatch(value, /retrieveInteractiveVerifiedLegalSources/);
    assert.doesNotMatch(value, /pending_review/);
  }
  assert.doesNotMatch(processor, /semanticSearch/);
});
