import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchLexCatalogPage,
  runNextLexCatalogDiscoveryPage,
  seedLexCatalogDiscoveryCheckpoints,
} from "../lib/legal-corpus/lex-catalog-discovery";
import {
  discoverLexLanguageVariants,
  lexCatalogSearchUrl,
  lexLanguageFamilyId,
  parseLexDocumentUrl,
} from "../lib/legal-corpus/lex-discovery";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const robots = "User-agent: *\nAllow: /\nCrawl-delay: 20\n";

function catalogPage(input: {
  page: number;
  count: number;
  links: string[];
  nextPage?: number;
  nextTarget?: string;
  viewState: string;
}): string {
  return `<!doctype html><html><body>
    <div class="refind__result-export__title mb-3">По запросу найдено ${input.count} документа(ов)</div>
    <form method="post" id="Form1">
      <input type="hidden" name="__VIEWSTATE" value="${input.viewState}">
      <input type="hidden" name="__VIEWSTATEGENERATOR" value="4CEDEDF5">
      ${input.links.map((link) => `<a href="${link}">Документ</a>`).join("")}
      <a class="aspNetDisabled btn">${input.page}</a>
      ${input.nextPage && input.nextTarget
        ? `<a href="javascript:__doPostBack('${input.nextTarget}','')">${input.nextPage}</a>`
        : ""}
    </form>
  </body></html>`;
}

test("catalog routes and language variants reflect the actual Lex URL model", () => {
  assert.equal(lexCatalogSearchUrl("laws", "ru"), "https://lex.uz/ru/search/nat?sort_id=3975&form_id=3968&lang=1");
  assert.equal(lexCatalogSearchUrl("laws", "uz-Cyrl"), "https://lex.uz/search/nat?sort_id=3975&form_id=3968&lang=3");
  assert.equal(parseLexDocumentUrl("https://lex.uz/docs/8383786")?.language, "uz-Cyrl");
  assert.equal(parseLexDocumentUrl("https://lex.uz/en/docs/8385445")?.language, "en");
  const current = parseLexDocumentUrl("https://lex.uz/ru/docs/8385395")!;
  const variants = discoverLexLanguageVariants(`
    <div class="docContentHeader__item-link active" title="На русском">Рус</div>
    <div class="docContentHeader__item-link" onclick="openUrl('/ru/docs/8385445')" title="In english">Eng</div>
    <div class="docContentHeader__item-link" onclick="openUrl('/ru/docs/8383786')" title="Ўзбекча">Ўзб</div>
    <div class="docContentHeader__item-link" onclick="openUrl('/ru/docs/-8383786')" title="O'zbekcha">O’zb</div>
  `, current);
  assert.deepEqual(variants.map((variant) => variant.language).sort(), ["en", "ru", "uz-Cyrl", "uz-Latn"]);
  assert.equal(variants.find((variant) => variant.language === "uz-Cyrl")?.sourceUrl, "https://lex.uz/docs/8383786");
  assert.equal(variants.find((variant) => variant.language === "uz-Latn")?.sourceUrl, "https://lex.uz/uz/docs/-8383786");
  assert.equal(lexLanguageFamilyId(variants), "lexuz-family:8383786");
});

test("catalog fetch rejects arbitrary URLs and honors robots crawl delay", async () => {
  await assert.rejects(
    fetchLexCatalogPage({ searchUrl: "https://lex.uz/ru/search/all" }),
    /LEX_CATALOG_URL_REJECTED/,
  );
  const waits: number[] = [];
  const robotsAcceptHeaders: Array<string | null> = [];
  const result = await fetchLexCatalogPage({
    searchUrl: lexCatalogSearchUrl("laws", "ru"),
    wait: async (delay) => { waits.push(delay); },
    fetchImpl: async (input, init) => {
      if (String(input).endsWith("robots.txt")) {
        robotsAcceptHeaders.push(new Headers(init?.headers).get("accept"));
        return new Response(robots, { headers: { "content-type": "text/plain" } });
      }
      return new Response(catalogPage({
        page: 1, count: 2, links: ["/ru/docs/100"], nextPage: 2,
        nextTarget: "ucFoundActsControl$rptPaging$ctl01$lbPaging", viewState: "state&amp;one",
      }), { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  assert.deepEqual(waits, [20_000]);
  assert.deepEqual(robotsAcceptHeaders, ["*/*"]);
  assert.equal(result.currentPage, 1);
  assert.equal(result.expectedDocumentCount, 2);
  assert.equal(result.documents[0]?.sourceUrl, "https://lex.uz/ru/docs/100");
  assert.equal(result.viewState, "state&one");
});

test("temporary catalog access denial remains retryable and old terminal rows self-heal", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  try {
    await assert.rejects(
      fetchLexCatalogPage({
        searchUrl: lexCatalogSearchUrl("laws", "ru"),
        wait: async () => undefined,
        fetchImpl: async (input) => String(input).endsWith("robots.txt")
          ? new Response(robots, { headers: { "content-type": "text/plain" } })
          : new Response("denied", { status: 403 }),
      }),
      (error: unknown) => error instanceof Error
        && "retryable" in error
        && (error as { retryable: boolean }).retryable,
    );
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints
      SET status='dead_letter',attempt_count=1,next_attempt_at=NULL,
        last_error_code='LEX_CATALOG_UPSTREAM_UNAVAILABLE'
      WHERE id='lex-catalog:central_election_commission:en'`).run();
    const seeded = await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:05:00.000Z"));
    assert.deepEqual(seeded, { considered: 44, created: 0 });
    const recovered = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,
      next_attempt_at AS nextAttemptAt FROM legal_corpus_discovery_checkpoints
      WHERE id='lex-catalog:central_election_commission:en'`).get() as {
      status: string; attemptCount: number; nextAttemptAt: string | null;
    };
    assert.equal(recovered.status, "retrying");
    assert.equal(recovered.attemptCount, 1);
    assert.equal(recovered.nextAttemptAt, "2026-08-15T00:05:00.000Z");
  } finally {
    sqlite.close();
  }
});

test("checkpoint crawler resumes POST-back pagination and queues each source once", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  const waits: number[] = [];
  let catalogRequests = 0;
  try {
    const seeded = await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    assert.deepEqual(seeded, { considered: 44, created: 44 });
    await d1.prepare("UPDATE legal_corpus_discovery_checkpoints SET status='completed' WHERE id<>?")
      .bind("lex-catalog:laws:ru").run();
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("robots.txt")) {
        return new Response(robots, { headers: { "content-type": "text/plain" } });
      }
      catalogRequests += 1;
      if (catalogRequests === 1) {
        assert.equal(init?.method, "GET");
        return new Response(catalogPage({
          page: 1, count: 2, links: ["/ru/docs/100"], nextPage: 2,
          nextTarget: "ucFoundActsControl$rptPaging$ctl01$lbPaging", viewState: "state-one",
        }), { headers: { "content-type": "text/html" } });
      }
      assert.equal(init?.method, "POST");
      assert.match(String(init?.body), /__EVENTTARGET=ucFoundActsControl%24rptPaging%24ctl01%24lbPaging/u);
      assert.match(String(init?.body), /__VIEWSTATE=state-one/u);
      return new Response(catalogPage({
        page: 2, count: 2, links: ["/ru/docs/101"], viewState: "state-two",
      }), { headers: { "content-type": "text/html" } });
    };
    const first = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:01:00.000Z"), fetchImpl,
      wait: async (delay) => { waits.push(delay); },
    });
    assert.equal(first.status, "page_completed");
    assert.equal(first.queuedOnPage, 1);
    const second = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:02:00.000Z"), fetchImpl,
      wait: async (delay) => { waits.push(delay); },
    });
    assert.equal(second.status, "category_completed");
    assert.equal(second.pageNumber, 2);
    assert.deepEqual(waits, [20_000, 20_000]);
    const checkpoint = sqlite.prepare(`SELECT status,page_number AS pageNumber,
      discovered_document_count AS discovered FROM legal_corpus_discovery_checkpoints WHERE id=?`)
      .get("lex-catalog:laws:ru") as { status: string; pageNumber: number; discovered: number };
    assert.equal(checkpoint.status, "completed");
    assert.equal(checkpoint.pageNumber, 2);
    assert.equal(checkpoint.discovered, 2);
    const jobs = sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_ingestion_jobs").get() as { count: number };
    assert.equal(Number(jobs.count), 2);
  } finally {
    sqlite.close();
  }
});
