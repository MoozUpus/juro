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

    const target = LEX_CORE_CODE_TARGETS.find((candidate) => candidate.id === "administrative_responsibility")!;
    const now = new Date(0);
    const discovered = await runNextLexCoreCodeDiscovery(env, {
      now,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response([
          `<a href="/ru/docs/777">О внесении изменений в ${target.titleRu}</a>`,
          `<a href="/ru/docs/778">${target.titleRu}</a>`,
        ].join("\n"), { headers: { "content-type": "text/html" } }),
    });
    assert.equal(discovered.status, "queued");
    assert.equal(discovered.targetId, target.id);
    assert.equal(discovered.canonicalDocumentId, "lexuz:778");
    assert.equal(discovered.queued, true);
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_ingestion_jobs WHERE canonical_document_id='lexuz:777'").get() as { count: number }).count), 0);
  } finally {
    sqlite.close();
  }
});

test("a verified seed URL settles a code even when Lex reader metadata keeps an Uzbek title", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = {
      DB: d1,
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    };
    const timestamp = "2026-08-17T00:00:00.000Z";
    for (const [index, sourceUrl] of LEX_CORE_CODE_SEED_URLS.entries()) {
      const documentId = `seed-code-${index}`;
      sqlite.prepare(`INSERT INTO legal_corpus_documents
        (id,provider,jurisdiction,source_class,scope,visibility,canonical_url,title,short_title,
          availability_status,trusted,verification_status,approval_required,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        documentId, "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global", sourceUrl,
        "ЎЗБЕКИСТОН РЕСПУБЛИКАСИНИНГ КОДЕКСИ", "Ўзбекистон Республикасининг кодекси",
        "ready", 1, "official_source", 0, timestamp, timestamp,
      );
      sqlite.prepare(`INSERT INTO legal_corpus_variants
        (id,document_id,language,is_official_language_version,translation_type,source_url,last_verified_at,
          current_version_id,created_at,updated_at,title,short_title)
        VALUES (?,?,?,1,NULL,?,?,NULL,?,?,?,?)`).run(
        `${documentId}:ru`, documentId, "ru", sourceUrl, timestamp, timestamp, timestamp,
        "ЎЗБЕКИСТОН РЕСПУБЛИКАСИНИНГ КОДЕКСИ", "Ўзбекистон Республикасининг кодекси",
      );
    }
    const discovered = await runNextLexCoreCodeDiscovery(env, {
      now: new Date(0),
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response("<main></main>", { headers: { "content-type": "text/html" } }),
    });
    assert.equal(discovered.status, "not_found");
    assert.equal(["family", "civil", "tax", "labor"].includes(discovered.targetId ?? ""), false);
  } finally {
    sqlite.close();
  }
});

test("a discovered code remains prioritized until its exact source is indexed", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = { DB: d1, LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true" };
    const target = LEX_CORE_CODE_TARGETS.find((candidate) => candidate.id === "administrative_responsibility")!;
    const now = new Date(0);
    const discovered = await runNextLexCoreCodeDiscovery(env, {
      now,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response(`<a href="/ru/docs/777">${target.titleRu}</a>`, {
          headers: { "content-type": "text/html" },
        }),
    });
    assert.equal(discovered.priorityCanonicalDocumentIds.includes("lexuz:777"), true);
    const state = sqlite.prepare(`SELECT status,source_url AS sourceUrl,canonical_document_id AS canonicalDocumentId
      FROM legal_corpus_core_code_targets WHERE target_id=?`).get(target.id) as {
        status: string; sourceUrl: string; canonicalDocumentId: string;
      };
    assert.deepEqual({ ...state }, {
      status: "awaiting_ingestion", sourceUrl: "https://lex.uz/ru/docs/777", canonicalDocumentId: "lexuz:777",
    });

    const timestamp = now.toISOString();
    sqlite.prepare(`INSERT INTO legal_corpus_documents
      (id,provider,jurisdiction,source_class,scope,visibility,canonical_url,title,short_title,
        availability_status,trusted,verification_status,approval_required,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "code-777", "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global",
      "https://lex.uz/ru/docs/777", target.titleRu, target.titleRu, "ready", 1,
      "official_source", 0, timestamp, timestamp,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_variants
      (id,document_id,language,is_official_language_version,translation_type,source_url,last_verified_at,
        current_version_id,created_at,updated_at,title,short_title)
      VALUES (?,?,?,1,NULL,?,?,NULL,?,?,?,?)`).run(
      "code-777:ru", "code-777", "ru", "https://lex.uz/ru/docs/777", timestamp, timestamp,
      timestamp, target.titleRu, target.titleRu,
    );
    await runNextLexCoreCodeDiscovery(env, { now: new Date(4 * 60_000) });
    const indexed = sqlite.prepare("SELECT status FROM legal_corpus_core_code_targets WHERE target_id=?")
      .get(target.id) as { status: string };
    assert.equal(indexed.status, "indexed");
  } finally {
    sqlite.close();
  }
});

test("a paced core-code retry does not unlock generic catalogue discovery", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = { DB: d1, LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true" };
    const target = LEX_CORE_CODE_TARGETS.find((candidate) => candidate.id === "administrative_responsibility")!;
    const now = new Date(0);
    await runNextLexCoreCodeDiscovery(env, {
      now,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : new Response("<main></main>", { headers: { "content-type": "text/html" } }),
    });
    sqlite.prepare(`UPDATE legal_corpus_core_code_targets
      SET status='indexed',next_attempt_at=NULL WHERE target_id<>?`).run(target.id);
    const delayed = await runNextLexCoreCodeDiscovery(env, {
      now: new Date(4 * 60_000),
      fetchImpl: async () => { throw new Error("a future retry must not fetch"); },
    });
    assert.equal(delayed.status, "queued");
    assert.equal(delayed.targetId, null);
  } finally {
    sqlite.close();
  }
});

test("core-code discovery resumes the official pager before deferring a title", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = { DB: d1, LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true" };
    const target = LEX_CORE_CODE_TARGETS.find((candidate) => candidate.id === "administrative_court_procedure")!;
    const first = await runNextLexCoreCodeDiscovery(env, {
      now: new Date(4 * 60_000),
      fetchImpl: async (input, init) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : init?.method === "POST"
          ? new Response('<a class="aspNetDisabled">2</a><a href="/ru/docs/888">' + target.titleRu + "</a>", {
            headers: { "content-type": "text/html" },
          })
          : new Response('<input name="__VIEWSTATE" value="state-1"><a class="aspNetDisabled">1</a><a href="javascript:__doPostBack(\'pager2\',\'\')">2</a>', {
            headers: { "content-type": "text/html", "set-cookie": "ASP.NET_SessionId=corepager1; path=/; HttpOnly" },
          }),
    });
    assert.equal(first.status, "queued");
    assert.equal(first.canonicalDocumentId, null);
    const paged = sqlite.prepare(`SELECT status,page_number AS pageNumber,next_event_target AS nextEventTarget
      FROM legal_corpus_core_code_targets WHERE target_id=?`).get(target.id) as {
        status: string; pageNumber: number; nextEventTarget: string;
      };
    assert.deepEqual({ ...paged }, { status: "retrying", pageNumber: 1, nextEventTarget: "pager2" });

    const second = await runNextLexCoreCodeDiscovery(env, {
      now: new Date(8 * 60_000),
      fetchImpl: async (input, init) => String(input).endsWith("robots.txt")
        ? new Response(robots, { headers: { "content-type": "text/plain" } })
        : init?.method === "POST"
          ? (() => {
            assert.equal(new Headers(init.headers).get("cookie"), "ASP.NET_SessionId=corepager1");
            return new Response('<a class="aspNetDisabled">2</a><a href="/ru/docs/888">' + target.titleRu + "</a>", {
              headers: { "content-type": "text/html" },
            });
          })()
          : new Response("<main></main>", { headers: { "content-type": "text/html" } }),
    });
    assert.equal(second.canonicalDocumentId, "lexuz:888");
    const awaiting = sqlite.prepare(`SELECT status,page_number AS pageNumber,next_event_target AS nextEventTarget
      FROM legal_corpus_core_code_targets WHERE target_id=?`).get(target.id) as {
        status: string; pageNumber: number; nextEventTarget: string | null;
      };
    assert.deepEqual({ ...awaiting }, { status: "awaiting_ingestion", pageNumber: 0, nextEventTarget: null });
  } finally {
    sqlite.close();
  }
});
