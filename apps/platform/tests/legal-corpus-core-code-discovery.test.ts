import assert from "node:assert/strict";
import test from "node:test";

import { fetchLexCatalogPage } from "../lib/legal-corpus/lex-catalog-discovery";
import {
  LEX_CORE_CODE_SEED_URLS,
  runNextLexCoreCodeDiscovery,
  seedLexCoreCodeJobs,
} from "../lib/legal-corpus/lex-core-code-discovery";
import { LEX_CORE_CODE_TARGETS, lexCoreCodeSearchUrl } from "../lib/legal-corpus/lex-discovery";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const robots = "User-agent: *\nAllow: /\nCrawl-delay: 0\n";

test("core-code searches remain limited to the fixed official target registry", async () => {
  const family = LEX_CORE_CODE_TARGETS.find((target) => target.id === "family")!;
  await assert.rejects(
    fetchLexCatalogPage({ searchUrl: "https://lex.uz/ru/search/all?searchtitle=arbitrary" }),
    /LEX_CATALOG_URL_REJECTED/,
  );
  const page = await fetchLexCatalogPage({
    searchUrl: lexCoreCodeSearchUrl(family),
    fetchImpl: async (input) => String(input).endsWith("robots.txt")
      ? new Response(robots, { headers: { "content-type": "text/plain" } })
      : new Response('<a href="/ru/docs/104723">Семейный кодекс Республики Узбекистан</a>', {
        headers: { "content-type": "text/html" },
      }),
  });
  assert.match(page.html, /Семейный кодекс/u);
});

test("core-code seed is idempotent and title discovery queues only the exact result", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = {
      DB: d1,
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    };
    const seeded = await seedLexCoreCodeJobs(env, { now: new Date("2026-08-17T00:00:00.000Z") });
    assert.deepEqual(seeded, { considered: LEX_CORE_CODE_SEED_URLS.length, queued: LEX_CORE_CODE_SEED_URLS.length });
    assert.deepEqual(await seedLexCoreCodeJobs(env), { considered: LEX_CORE_CODE_SEED_URLS.length, queued: 0 });

    const familyIndex = LEX_CORE_CODE_TARGETS.findIndex((target) => target.id === "family");
    const now = new Date(familyIndex * 4 * 60_000);
    const discovered = await runNextLexCoreCodeDiscovery(env, {
      now,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response([
          '<a href="/ru/docs/777">О внесении изменений в Семейный кодекс Республики Узбекистан</a>',
          '<a href="/ru/docs/104723">Семейный кодекс Республики Узбекистан</a>',
        ].join("\n"), { headers: { "content-type": "text/html" } }),
    });
    assert.equal(discovered.status, "queued");
    assert.equal(discovered.targetId, "family");
    assert.equal(discovered.canonicalDocumentId, "lexuz:104723");
    assert.equal(discovered.queued, false, "the stable seed already owns this idempotency key");
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_ingestion_jobs WHERE canonical_document_id='lexuz:777'").get() as { count: number }).count), 0);
  } finally {
    sqlite.close();
  }
});
