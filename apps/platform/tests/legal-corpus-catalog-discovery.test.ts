import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_ACTIVE_LEX_CATALOG_PAGERS_STAGING,
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

test("catalog response deadline accommodates the published Lex crawl window", () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 20_000);
});

function catalogPage(input: {
  page: number;
  count?: number;
  links: string[];
  nextPage?: number;
  nextTarget?: string;
  viewState: string;
}): string {
  return `<!doctype html><html><body>
    ${input.count === undefined ? "" : `<div class="refind__result-export__title mb-3">По запросу найдено ${input.count} документа(ов)</div>`}
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

test("catalog fetch delegates its crawl delay only to the D1-backed pacer", async () => {
  const waits: number[] = [];
  const result = await fetchLexCatalogPage({
    searchUrl: lexCatalogSearchUrl("laws", "ru"),
    pacingAlreadyApplied: true,
    wait: async (delay) => { waits.push(delay); },
    fetchImpl: async (input) => String(input).endsWith("robots.txt")
      ? new Response(robots, { headers: { "content-type": "text/plain" } })
      : new Response(catalogPage({ page: 1, links: [], viewState: "state" }), {
        headers: { "content-type": "text/html" },
      }),
  });
  assert.deepEqual(waits, []);
  assert.equal(result.currentPage, 1);
});

test("catalog body deadline turns a stalled public response into a retryable timeout", async () => {
  const stalled = new ReadableStream<Uint8Array>({ start() {} });
  await assert.rejects(
    fetchLexCatalogPage({
      searchUrl: lexCatalogSearchUrl("laws", "ru"),
      timeoutMs: 5,
      wait: async () => undefined,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response(stalled, { headers: { "content-type": "text/html" } }),
    }),
    (error: unknown) => error instanceof Error
      && error.message === "LEX_CATALOG_TIMEOUT"
      && "retryable" in error
      && (error as { retryable: boolean }).retryable,
  );
});

test("catalog fetch keeps only the public Lex pager session from multiple Set-Cookie headers", async () => {
  const result = await fetchLexCatalogPage({
    searchUrl: lexCatalogSearchUrl("laws", "ru"),
    wait: async () => undefined,
    fetchImpl: async (input) => {
      if (String(input).endsWith("robots.txt")) {
        return new Response(robots, { headers: { "content-type": "text/plain" } });
      }
      const response = new Response(catalogPage({ page: 1, count: 1, links: [], viewState: "state" }), {
        headers: { "content-type": "text/html" },
      });
      Object.defineProperty(response.headers, "getSetCookie", {
        value: () => ["anti_bot=opaque; path=/", "ASP.NET_SessionId=lexpager99; path=/; HttpOnly"],
      });
      return response;
    },
  });
  assert.equal(result.sourceSessionCookie, "ASP.NET_SessionId=lexpager99");
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

test("seeding backfills a provable expected count for completed catalogues without totals", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints
      SET status='completed',expected_document_count=NULL,
        discovered_document_count=12,next_event_target=NULL
      WHERE id='lex-catalog:court_acts:ru'`).run();
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:05:00.000Z"));
    const checkpoint = sqlite.prepare(`SELECT expected_document_count AS expected
      FROM legal_corpus_discovery_checkpoints WHERE id='lex-catalog:court_acts:ru'`)
      .get() as { expected: number | null };
    assert.equal(checkpoint.expected, 12);
  } finally {
    sqlite.close();
  }
});

test("a due retry is claimed before queued catalogues", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET status='completed'
      WHERE id NOT IN ('lex-catalog:laws:ru','lex-catalog:central_election_commission:en')`).run();
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints
      SET status='retrying',attempt_count=1,next_attempt_at='2026-08-15T00:01:00.000Z'
      WHERE id='lex-catalog:central_election_commission:en'`).run();
    const result = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:02:00.000Z"),
      wait: async () => undefined,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response(catalogPage({ page: 1, links: [], viewState: "state" }), {
          headers: { "content-type": "text/html" },
        }),
    });
    assert.equal(result.checkpointId, "lex-catalog:central_election_commission:en");
    assert.equal(result.status, "category_completed");
    const checkpoint = sqlite.prepare(`SELECT expected_document_count AS expected
      FROM legal_corpus_discovery_checkpoints WHERE id=?`)
      .get(result.checkpointId) as { expected: number | null };
    assert.equal(checkpoint.expected, 0);
  } finally {
    sqlite.close();
  }
});

test("catalog discovery completes laws before a lower-priority President catalogue", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET status='completed'
      WHERE id NOT IN ('lex-catalog:laws:ru','lex-catalog:president:ru')`).run();
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints
      SET page_number=2,next_event_target='pager',view_state='state',
        view_state_generator='4CEDEDF5',source_session_cookie='ASP.NET_SessionId=deferredpager',
        source_session_expires_at='2026-08-15T00:17:00.000Z',updated_at='2026-08-15T00:01:00.000Z'
      WHERE id='lex-catalog:laws:ru'`).run();

    const result = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:02:00.000Z"),
      wait: async () => undefined,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response(catalogPage({ page: 3, links: [], viewState: "state" }), {
          headers: { "content-type": "text/html" },
        }),
    });

    assert.equal(result.checkpointId, "lex-catalog:laws:ru");
    assert.equal(result.status, "category_completed");
    const deferred = sqlite.prepare(`SELECT status,page_number AS pageNumber
      FROM legal_corpus_discovery_checkpoints WHERE id='lex-catalog:president:ru'`).get() as {
      status: string; pageNumber: number;
    };
    assert.deepEqual({ ...deferred }, { status: "queued", pageNumber: 0 });
  } finally {
    sqlite.close();
  }
});

test("a higher-priority retry backoff does not open a lower-priority catalogue", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET status='completed'
      WHERE id NOT IN ('lex-catalog:government:ru','lex-catalog:president:ru')`).run();
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET
      status='retrying',attempt_count=1,next_attempt_at='2026-08-15T00:10:00.000Z',
      last_error_code='LEX_CATALOG_TIMEOUT',updated_at='2026-08-15T00:01:00.000Z'
      WHERE id='lex-catalog:government:ru'`).run();

    const result = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:02:00.000Z"),
      wait: async () => undefined,
      fetchImpl: async () => {
        throw new Error("lower-priority catalogue must not be fetched during higher-priority backoff");
      },
    });

    assert.deepEqual(result, {
      claimed: false,
      status: "empty",
      checkpointId: null,
      pageNumber: null,
      discoveredOnPage: 0,
      queuedOnPage: 0,
      safeErrorCode: null,
    });
    const president = sqlite.prepare(`SELECT status FROM legal_corpus_discovery_checkpoints
      WHERE id='lex-catalog:president:ru'`).get() as { status: string };
    assert.equal(president.status, "queued");
  } finally {
    sqlite.close();
  }
});

test("a resumed higher-priority pager is retained ahead of a lower-priority page-zero catalogue", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET status='completed'
      WHERE id NOT IN ('lex-catalog:laws:ru','lex-catalog:president:ru')`).run();
    // A successful resumed page clears next_attempt_at. The laws pager must
    // nevertheless retain priority over the untouched President catalogue.
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET
      page_number=4,next_event_target='pager',view_state='state',
      view_state_generator='4CEDEDF5',source_session_cookie='ASP.NET_SessionId=activepager',
      source_session_expires_at='2026-08-15T00:30:00.000Z',next_attempt_at=NULL,
      updated_at='2026-08-15T00:10:00.000Z'
      WHERE id='lex-catalog:laws:ru'`).run();
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET
      next_attempt_at='2026-08-15T00:05:00.000Z',updated_at='2026-08-15T00:05:00.000Z'
      WHERE id='lex-catalog:president:ru'`).run();

    const result = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:15:00.000Z"),
      wait: async () => undefined,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response(catalogPage({ page: 5, links: [], viewState: "state" }), {
          headers: { "content-type": "text/html" },
        }),
    });

    assert.equal(result.checkpointId, "lex-catalog:laws:ru");
    assert.equal(result.status, "category_completed");
  } finally {
    sqlite.close();
  }
});

test("higher-priority laws displace lower active pager sessions", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    APP_ENV: "staging" as const,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  const activeIds = [
    "lex-catalog:laws:ru",
    "lex-catalog:president:ru",
    "lex-catalog:ministries:ru",
    "lex-catalog:government:ru",
    "lex-catalog:international:ru",
    "lex-catalog:local_authorities:ru",
    "lex-catalog:court_acts:ru",
    "lex-catalog:court_practice:ru",
    "lex-catalog:oliy_majlis:ru",
    "lex-catalog:central_election_commission:ru",
    "lex-catalog:technical:ru",
    "lex-catalog:laws:en",
    "lex-catalog:president:en",
  ];
  try {
    assert.equal(activeIds.length, MAX_ACTIVE_LEX_CATALOG_PAGERS_STAGING + 1);
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    const quoted = activeIds.map(() => "?").join(",");
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET status='completed'
      WHERE id NOT IN (${quoted},'lex-catalog:laws:uz-Latn')`).run(...activeIds);
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET
      page_number=2,next_event_target='pager',view_state='state',
      view_state_generator='4CEDEDF5',source_session_cookie='ASP.NET_SessionId=boundedpager',
      source_session_expires_at='2026-08-15T00:25:00.000Z',next_attempt_at=NULL,
      updated_at='2026-08-15T00:01:00.000Z'
      WHERE id IN (${quoted})`).run(...activeIds);
    // The unfinished laws/uz-Latn checkpoint must take precedence over the
    // lower-priority sessions even though the previous fairness scheduler had
    // filled the pool with them.
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints
      SET source_session_expires_at='2026-08-15T00:20:00.000Z'
      WHERE id='lex-catalog:laws:ru'`).run();

    const result = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:05:00.000Z"),
      wait: async () => undefined,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response(catalogPage({
          page: 1, links: [], viewState: "new-laws-page",
        }), {
          headers: { "content-type": "text/html" },
        }),
    });

    assert.equal(result.checkpointId, "lex-catalog:laws:uz-Latn");
    assert.equal(result.status, "category_completed");
    const activeCount = Number((sqlite.prepare(`SELECT count(*) AS count
      FROM legal_corpus_discovery_checkpoints
      WHERE status='queued' AND page_number>0 AND source_session_cookie IS NOT NULL
        AND source_session_expires_at IS NOT NULL`).get() as { count: number }).count);
    assert.equal(activeCount, 2);
    const displaced = sqlite.prepare(`SELECT page_number AS pageNumber,source_session_cookie AS sessionCookie
      FROM legal_corpus_discovery_checkpoints WHERE id='lex-catalog:technical:ru'`).get() as {
        pageNumber: number; sessionCookie: string | null;
      };
    assert.equal(displaced.pageNumber, 0);
    assert.equal(displaced.sessionCookie, null);
  } finally {
    sqlite.close();
  }
});

test("a truncated terminal page retries instead of claiming complete coverage", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    sqlite.prepare("UPDATE legal_corpus_discovery_checkpoints SET status='completed' WHERE id<>'lex-catalog:laws:ru'").run();
    const result = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:01:00.000Z"),
      wait: async () => undefined,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response(catalogPage({
          page: 1, count: 2, links: ["/ru/docs/100"], viewState: "state",
        }), { headers: { "content-type": "text/html" } }),
    });
    assert.equal(result.status, "retrying");
    assert.equal(result.safeErrorCode, "LEX_CATALOG_INCOMPLETE_RESULT_SET");
    const checkpoint = sqlite.prepare(`SELECT status,page_number AS pageNumber,
      discovered_document_count AS discovered FROM legal_corpus_discovery_checkpoints
      WHERE id='lex-catalog:laws:ru'`).get() as {
      status: string; pageNumber: number; discovered: number;
    };
    assert.deepEqual({ ...checkpoint }, { status: "retrying", pageNumber: 0, discovered: 0 });
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
        }), { headers: { "content-type": "text/html", "set-cookie": "ASP.NET_SessionId=catalogpager1; path=/; HttpOnly" } });
      }
      assert.equal(init?.method, "POST");
      assert.match(String(init?.body), /__EVENTTARGET=ucFoundActsControl%24rptPaging%24ctl01%24lbPaging/u);
      assert.match(String(init?.body), /__VIEWSTATE=state-one/u);
      assert.equal(new Headers(init?.headers).get("cookie"), "ASP.NET_SessionId=catalogpager1");
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

test("catalog discovery completes an undeclared empty pager tail without advancing forever", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  let catalogRequests = 0;
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    await d1.prepare("UPDATE legal_corpus_discovery_checkpoints SET status='completed' WHERE id<>?")
      .bind("lex-catalog:laws:ru").run();
    const fetchImpl = async (input: RequestInfo | URL) => {
      if (String(input).endsWith("robots.txt")) {
        return new Response(robots, { headers: { "content-type": "text/plain" } });
      }
      catalogRequests += 1;
      if (catalogRequests === 1) {
        return new Response(catalogPage({
          page: 1, links: ["/ru/docs/100"], nextPage: 2,
          nextTarget: "pager-two", viewState: "state-one",
        }), { headers: { "content-type": "text/html", "set-cookie": "ASP.NET_SessionId=emptytail; path=/; HttpOnly" } });
      }
      assert.equal(catalogRequests, 2);
      return new Response(catalogPage({
        page: 2, links: [], nextPage: 3, nextTarget: "pager-three", viewState: "state-two",
      }), { headers: { "content-type": "text/html" } });
    };

    const first = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:01:00.000Z"), fetchImpl, wait: async () => undefined,
    });
    assert.equal(first.status, "page_completed");
    const second = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:02:00.000Z"), fetchImpl, wait: async () => undefined,
    });
    assert.equal(second.status, "category_completed");
    assert.equal(second.pageNumber, 2);
    const checkpoint = sqlite.prepare(`SELECT status,page_number AS pageNumber,
      expected_document_count AS expected,discovered_document_count AS discovered
      FROM legal_corpus_discovery_checkpoints WHERE id='lex-catalog:laws:ru'`).get() as {
        status: string; pageNumber: number; expected: number | null; discovered: number;
      };
    assert.deepEqual({ ...checkpoint }, { status: "completed", pageNumber: 2, expected: 1, discovered: 1 });
    const jobs = sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_ingestion_jobs").get() as { count: number };
    assert.equal(Number(jobs.count), 1);
  } finally {
    sqlite.close();
  }
});

test("catalog discovery completes only after two undeclared duplicate-only pager pages", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  let catalogRequests = 0;
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    await d1.prepare("UPDATE legal_corpus_discovery_checkpoints SET status='completed' WHERE id<>?")
      .bind("lex-catalog:laws:ru").run();
    const fetchImpl = async (input: RequestInfo | URL) => {
      if (String(input).endsWith("robots.txt")) {
        return new Response(robots, { headers: { "content-type": "text/plain" } });
      }
      catalogRequests += 1;
      const page = catalogRequests;
      return new Response(catalogPage({
        page,
        links: ["/ru/docs/100"],
        nextPage: page + 1,
        nextTarget: `pager-${page + 1}`,
        viewState: `state-${page}`,
      }), { headers: {
        "content-type": "text/html",
        ...(page === 1 ? { "set-cookie": "ASP.NET_SessionId=duplicatetail; path=/; HttpOnly" } : {}),
      } });
    };

    const first = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:01:00.000Z"), fetchImpl, wait: async () => undefined,
    });
    assert.equal(first.status, "page_completed");
    const firstDuplicate = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:02:00.000Z"), fetchImpl, wait: async () => undefined,
    });
    assert.equal(firstDuplicate.status, "page_completed");
    const intermediate = sqlite.prepare(`SELECT status,page_number AS pageNumber,
      expected_document_count AS expected,discovered_document_count AS discovered,last_error_code AS lastErrorCode
      FROM legal_corpus_discovery_checkpoints WHERE id='lex-catalog:laws:ru'`).get() as {
        status: string; pageNumber: number; expected: number | null; discovered: number; lastErrorCode: string | null;
      };
    assert.deepEqual({ ...intermediate }, {
      status: "queued", pageNumber: 2, expected: null, discovered: 1, lastErrorCode: "LEX_CATALOG_DUPLICATE_PAGE",
    });
    const secondDuplicate = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:03:00.000Z"), fetchImpl, wait: async () => undefined,
    });
    assert.equal(secondDuplicate.status, "category_completed");
    const completed = sqlite.prepare(`SELECT status,page_number AS pageNumber,
      expected_document_count AS expected,discovered_document_count AS discovered,last_error_code AS lastErrorCode
      FROM legal_corpus_discovery_checkpoints WHERE id='lex-catalog:laws:ru'`).get() as {
        status: string; pageNumber: number; expected: number | null; discovered: number; lastErrorCode: string | null;
      };
    assert.deepEqual({ ...completed }, {
      status: "completed", pageNumber: 3, expected: 1, discovered: 1, lastErrorCode: null,
    });
  } finally {
    sqlite.close();
  }
});

test("a successful pager POST renews the public session lease for long catalogues", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  let catalogRequests = 0;
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
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
          page: 1, count: 3, links: ["/ru/docs/100"], nextPage: 2,
          nextTarget: "pager-two", viewState: "state-one",
        }), { headers: { "content-type": "text/html", "set-cookie": "ASP.NET_SessionId=longpager; path=/; HttpOnly" } });
      }
      if (catalogRequests === 2) {
        assert.equal(init?.method, "POST");
        assert.match(String(init?.body), /__EVENTTARGET=pager-two/u);
        assert.equal(new Headers(init?.headers).get("cookie"), "ASP.NET_SessionId=longpager");
        return new Response(catalogPage({
          page: 2, count: 3, links: ["/ru/docs/101"], nextPage: 3,
          nextTarget: "pager-three", viewState: "state-two",
        }), { headers: { "content-type": "text/html" } });
      }
      assert.equal(catalogRequests, 3);
      assert.equal(init?.method, "POST");
      assert.match(String(init?.body), /__EVENTTARGET=pager-three/u);
      assert.equal(new Headers(init?.headers).get("cookie"), "ASP.NET_SessionId=longpager");
      return new Response(catalogPage({
        page: 3, count: 3, links: ["/ru/docs/102"], viewState: "state-three",
      }), { headers: { "content-type": "text/html" } });
    };
    await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:00:00.000Z"), wait: async () => undefined, fetchImpl,
    });
    await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:14:00.000Z"), wait: async () => undefined, fetchImpl,
    });
    const third = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:16:00.000Z"), wait: async () => undefined, fetchImpl,
    });
    assert.equal(third.status, "category_completed");
    assert.equal(third.pageNumber, 3);
    assert.equal(catalogRequests, 3);
  } finally {
    sqlite.close();
  }
});

test("catalog pager restarts safely when Lex rejects its source session", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    await d1.prepare("UPDATE legal_corpus_discovery_checkpoints SET status='completed' WHERE id<>?")
      .bind("lex-catalog:laws:ru").run();
    await d1.prepare(`UPDATE legal_corpus_discovery_checkpoints SET
      status='retrying',page_number=2,next_event_target='pager',view_state='state',
      view_state_generator='4CEDEDF5',source_session_cookie='ASP.NET_SessionId=stalesession',
      source_session_expires_at='2026-08-15T00:17:00.000Z',next_attempt_at=NULL
      WHERE id='lex-catalog:laws:ru'`).run();
    const result = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:02:00.000Z"),
      wait: async () => undefined,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response(catalogPage({ page: 1, count: 2, links: [], nextPage: 2, nextTarget: "pager", viewState: "fresh" }), {
          headers: { "content-type": "text/html" },
        }),
    });
    assert.equal(result.status, "retrying");
    assert.equal(result.safeErrorCode, "LEX_CATALOG_PAGE_SEQUENCE_REJECTED");
    const checkpoint = sqlite.prepare(`SELECT status,page_number AS pageNumber,next_event_target AS nextEventTarget,
      source_session_cookie AS sourceSessionCookie FROM legal_corpus_discovery_checkpoints
      WHERE id='lex-catalog:laws:ru'`).get() as {
        status: string; pageNumber: number; nextEventTarget: string | null; sourceSessionCookie: string | null;
      };
    assert.deepEqual({ ...checkpoint }, {
      status: "retrying", pageNumber: 0, nextEventTarget: null, sourceSessionCookie: null,
    });
  } finally {
    sqlite.close();
  }
});

test("completed checkpoints survive pager expiry and repair the legacy queued shape", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const env = {
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  try {
    await seedLexCatalogDiscoveryCheckpoints(env, new Date("2026-08-15T00:00:00.000Z"));
    sqlite.prepare("UPDATE legal_corpus_discovery_checkpoints SET status='completed' WHERE id NOT IN (?,?)")
      .run("lex-catalog:laws:ru", "lex-catalog:president:ru");
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET
      status='completed',page_number=2,expected_document_count=2,discovered_document_count=2,
      next_event_target=NULL,view_state=NULL,view_state_generator=NULL,
      source_session_cookie=NULL,source_session_expires_at=NULL,
      completed_at='2026-08-15T00:01:00.000Z',next_attempt_at=NULL
      WHERE id='lex-catalog:laws:ru'`).run();
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints SET
      status='queued',page_number=0,expected_document_count=3,discovered_document_count=3,
      next_event_target=NULL,view_state=NULL,view_state_generator=NULL,
      source_session_cookie=NULL,source_session_expires_at=NULL,
      completed_at='2026-08-15T00:01:00.000Z',next_attempt_at='2026-08-15T00:05:00.000Z'
      WHERE id='lex-catalog:president:ru'`).run();

    const result = await runNextLexCatalogDiscoveryPage(env, {
      now: new Date("2026-08-15T00:20:00.000Z"),
      wait: async () => undefined,
      fetchImpl: async () => assert.fail("completed checkpoints must not fetch Lex again"),
    });
    assert.equal(result.status, "empty");
    const completed = sqlite.prepare(`SELECT id,status,page_number AS pageNumber,next_attempt_at AS nextAttemptAt
      FROM legal_corpus_discovery_checkpoints WHERE id IN (?,?) ORDER BY id`)
      .all("lex-catalog:laws:ru", "lex-catalog:president:ru") as Array<{
        id: string; status: string; pageNumber: number; nextAttemptAt: string | null;
      }>;
    assert.deepEqual(completed.map((checkpoint) => ({ ...checkpoint })), [
      { id: "lex-catalog:laws:ru", status: "completed", pageNumber: 2, nextAttemptAt: null },
      { id: "lex-catalog:president:ru", status: "completed", pageNumber: 0, nextAttemptAt: null },
    ]);
  } finally {
    sqlite.close();
  }
});
