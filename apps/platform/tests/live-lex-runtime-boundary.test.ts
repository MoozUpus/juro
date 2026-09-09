import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("user AI uses R2-native retrieval before direct Lex while other paths stay bounded", async () => {
  const [platformAi, guestAi, corpusAware, processor, monitor, scheduler] = await Promise.all([
    source("app/api/platform/ai/route.ts"),
    source("app/api/guest/ai/route.ts"),
    source("lib/legal-corpus/chat-retrieval.ts"),
    source("lib/document-analysis/processor.ts"),
    source("app/api/platform/monitoring/route.ts"),
    source("worker/platform-scheduled.ts"),
  ]);
  assert.match(platformAi, /retrieveCorpusAwareLegalSources/);
  assert.match(platformAi, /targetService: bindings\.LEGAL_RETRIEVAL_SERVICE/);
  assert.match(platformAi, /retrieveCorpusAwareLegalSources\(\{\s*query: question,/);
  assert.match(platformAi, /contextualQuestion: retrievalUnderstandingPromise\.then/);
  assert.match(platformAi, /const retrievalUnderstandingPromise = \(async/);
  assert.match(platformAi, /const retrievalQuestion = retrievalUnderstanding\.standaloneQuestion;/);
  assert.match(platformAi, /lexSearchQueries: retrievalUnderstandingPromise\.then\(\(understanding\) => understanding\.lexSearchQueries\)/);
  assert.doesNotMatch(platformAi, /indexQueries:/);
  assert.doesNotMatch(platformAi, /const retrievalQuestion = researchPlan\.primaryQuery;/);
  assert.match(guestAi, /retrieveCorpusAwareLegalSources/);
  assert.match(guestAi, /targetService: env\.LEGAL_RETRIEVAL_SERVICE/);
  assert.match(guestAi, /retrieveCorpusAwareLegalSources\(\{\s*query: parsed\.data\.question,/);
  assert.match(guestAi, /contextualQuestion: retrievalUnderstanding\.standaloneQuestion/);
  assert.match(corpusAware, /retrieveLiveLexSources/);
  assert.match(corpusAware, /if \(input\.applicableAt\)[\s\S]*unavailableHistoricalCoverage/);
  assert.doesNotMatch(corpusAware, /LEGAL_CORPUS_ENABLED/);
  assert.doesNotMatch(corpusAware, /LEGAL_CORPUS_LIVE_LEXUZ_ENABLED/);
  assert.doesNotMatch(corpusAware, /enqueueOfficialLexCorpusDocument|QDRANT|legal_corpus_chunks/);
  assert.match(processor, /retrieveLiveLexSourcesForDocument/);
  assert.match(monitor, /legal_monitoring_metadata/);
  assert.match(scheduler, /runLexMetadataMonitor/);
  for (const value of [platformAi, guestAi, processor, monitor, scheduler]) {
    assert.doesNotMatch(value, /retrieveInteractiveVerifiedLegalSources/);
    assert.doesNotMatch(value, /pending_review/);
  }
  assert.doesNotMatch(processor, /semanticSearch/);
});
