import assert from "node:assert/strict";
import test from "node:test";
import { ingestOfficialLexDocument } from "../lib/legal-corpus/ingestion";
import {
  assessLegalCorpusCoverage,
  reciprocalRankFusion,
  retrieveLegalCorpus,
  type LegalCorpusRetrievalItem,
} from "../lib/legal-corpus/retrieval";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

class MemoryBucket {
  async put() {
    return { key: "test" } as R2Object;
  }
}

function source(chunkId: string): LegalCorpusRetrievalItem {
  return {
    chunkId,
    documentId: "lexuz:1",
    documentTitle: "Тест",
    documentType: "legal_act",
    articleNumber: chunkId === "a" ? "1" : "2",
    articleTitle: null,
    exactQuote: "Точная цитата",
    sourceUrl: "https://lex.uz/ru/docs/1",
    language: "ru",
    status: "active",
    validFrom: null,
    validTo: null,
    versionDate: "2026-08-14",
    fetchedAt: "2026-08-14T00:00:00.000Z",
    contentHash: "a".repeat(64),
  };
}

test("RRF is stable with duplicate, sparse-only and dense-only ranks", () => {
  const fused = reciprocalRankFusion([source("a"), source("b")], [
    { chunkId: "b", score: 0.9 },
    { chunkId: "b", score: 0.8 },
    { chunkId: "missing", score: 1 },
  ]);
  assert.deepEqual(fused.map((item) => item.chunkId), ["b", "a"]);
  assert.equal(fused[0]?.sparseRank, 2);
  assert.equal(fused[0]?.denseRank, 1);
  assert.equal(reciprocalRankFusion([], []).length, 0);
  assert.equal(assessLegalCorpusCoverage({ query: "статья 1 и статья 3", sources: [source("a")] }), "partial_coverage");
});

test("sparse retrieval returns only the current, scope-authorized version", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const html = `<!doctype html><main id="divCont">
      <div class="lx_elem ACT_TITLE">Закон о проверке</div>
      <div class="lx_elem ARTICLE">Статья 25. Порядок проверки</div>
      <div class="lx_elem">${"Порядок проверки документов установлен настоящим Законом Республики Узбекистан. ".repeat(5)}</div>
    </main>`;
    await ingestOfficialLexDocument({
      APP_ENV: "staging",
      DB: d1,
      BUCKET: new MemoryBucket() as unknown as R2Bucket,
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    }, {
      sourceUrl: "https://lex.uz/ru/docs/99999",
      now: new Date("2026-08-14T00:00:00.000Z"),
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response("User-agent: *\nAllow: /", { headers: { "content-type": "text/plain" } })
        : new Response(html, { headers: { "content-type": "text/html" } }),
    });
    const results = await retrieveLegalCorpus({ db: d1, query: "статья 25 порядок проверки" });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.articleNumber, "25");
    assert.equal(results[0]?.documentTitle, "Закон о проверке");
    assert.equal(assessLegalCorpusCoverage({ query: "статья 25", sources: results }), "good_coverage");
  } finally {
    sqlite.close();
  }
});
