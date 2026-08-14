import assert from "node:assert/strict";
import test from "node:test";
import { ingestOfficialLexDocument } from "../lib/legal-corpus/ingestion";
import {
  LexUzIndexedProvider,
  resolveLegalSources,
} from "../lib/legal-corpus/source-provider";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

class MemoryBucket {
  async put() { return { key: "corpus-test" } as R2Object; }
}

test("indexed Lex provider returns the uniform source contract and stays preferred", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const paragraph = "Право на обращение гарантируется законом Республики Узбекистан. ".repeat(5);
    await ingestOfficialLexDocument({
      APP_ENV: "staging",
      DB: d1,
      BUCKET: new MemoryBucket() as unknown as R2Bucket,
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    }, {
      sourceUrl: "https://lex.uz/ru/docs/11111",
      now: new Date("2026-08-14T00:00:00.000Z"),
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response("User-agent: *\nAllow: /", { headers: { "content-type": "text/plain" } })
        : new Response(`<!doctype html><main id="divCont">
            <div class="lx_elem ACT_TITLE">Закон об обращениях</div>
            <div class="lx_elem ARTICLE">Статья 7. Право на обращение</div>
            <div class="lx_elem">${paragraph}</div>
          </main>`, { headers: { "content-type": "text/html" } }),
    });
    const indexed = await new LexUzIndexedProvider(d1).search({ query: "статья 7 право на обращение" });
    assert.equal(indexed.length, 1);
    assert.deepEqual(
      Object.keys(indexed[0] ?? {}).sort(),
      [
        "article_number", "article_title", "confidence", "content_hash", "document_id",
        "document_title", "document_type", "exact_quote", "fetched_at", "jurisdiction",
        "language", "provider", "source_id", "source_url", "status", "valid_from", "valid_to", "version_date",
      ],
    );
    const resolved = await resolveLegalSources({
      db: d1,
      env: { LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: "false" },
      query: "статья 7 право на обращение",
    });
    assert.equal(resolved.mode, "indexed");
    assert.equal(resolved.coverage, "good_coverage");
    assert.equal(resolved.sources[0]?.source_url, "https://lex.uz/ru/docs/11111");
  } finally {
    sqlite.close();
  }
});
