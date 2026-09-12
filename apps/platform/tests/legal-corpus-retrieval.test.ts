import assert from "node:assert/strict";
import test from "node:test";
import { ingestOfficialLexDocument } from "../lib/legal-corpus/ingestion";
import {
  assessLegalCorpusCoverage,
  reciprocalRankFusion,
  retrieveLegalCorpus,
  type LegalCorpusRetrievalItem,
} from "../lib/legal-corpus/retrieval";
import { recordNpaCorpusVersion, seedNpaMasterTargets } from "../lib/legal-corpus/npa-registry";
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
    documentNumber: "ЗРУ-1",
    adoptingAuthority: "Олий Мажлис Республики Узбекистан",
    sourceClass: "OFFICIAL_LEGISLATION",
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

test("RRF retains a hydrated dense-only result without inventing a sparse rank", () => {
  const denseOnly = source("dense-only");
  const fused = reciprocalRankFusion([], [{ chunkId: denseOnly.chunkId, score: 0.9 }], 12, [denseOnly]);
  assert.deepEqual(fused.map((item) => item.chunkId), ["dense-only"]);
  assert.equal(fused[0]?.denseRank, 1);
  assert.equal(fused[0]?.sparseRank, undefined);
  assert.equal(fused[0]?.fusionScore, 1 / 61);
});

test("sparse retrieval returns only the current, scope-authorized version", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const sparseTable = sqlite.prepare(
      "SELECT type FROM sqlite_master WHERE name='legal_corpus_sparse_terms'",
    ).get() as { type: string } | undefined;
    const virtualSearch = sqlite.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE sql LIKE 'CREATE VIRTUAL TABLE legal_corpus_search%'",
    ).get() as { count: number };
    assert.equal(sparseTable?.type, "table");
    assert.equal(virtualSearch.count, 0);

    const html = `<!doctype html><main id="divCont">
      <div>Дата вступления в силу</div><div>01.01.2020</div>
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
    assert.ok((sqlite.prepare(
      "SELECT COUNT(*) AS count FROM legal_corpus_sparse_postings",
    ).get() as { count: number }).count > 0);
    assert.equal((sqlite.prepare(
      "SELECT sparse_terms_json AS sparseTermsJson FROM legal_corpus_chunks LIMIT 1",
    ).get() as { sparseTermsJson: string }).sparseTermsJson, "[]");
    assert.equal(assessLegalCorpusCoverage({ query: "статья 25", sources: results }), "good_coverage");
  } finally {
    sqlite.close();
  }
});

test("an unresolved master NPA cannot leak through generic sparse or dense retrieval", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const rejectedSourceUrl = "https://lex.uz/ru/docs/111189";
  const canonicalSourceUrl = "https://lex.uz/ru/docs/111181";
  try {
    await seedNpaMasterTargets(d1, new Date("2026-09-11T00:00:00.000Z"));
    sqlite.prepare(`UPDATE npa_discovery_state SET status='manual_review',candidate_source_url=?,
      candidate_lexuz_doc_id='111189',last_error_code='IDENTITY_MISMATCH'
      WHERE document_key='civil_code_part_1'`).run(rejectedSourceUrl);
    const html = `<!doctype html><main id="divCont">
      <div>Дата вступления в силу</div><div>01.01.2020</div>
      <div class="lx_elem ACT_TITLE">Гражданский кодекс Республики Узбекистан</div>
      <div class="lx_elem ARTICLE">Статья 1. Непроверенная норма</div>
      <div class="lx_elem">${"Непроверенная норма не должна попасть в выдачу до завершения проверки LexUZ. ".repeat(6)}</div>
    </main>`;
    const result = await ingestOfficialLexDocument({
      APP_ENV: "staging", DB: d1, BUCKET: new MemoryBucket() as unknown as R2Bucket,
      LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    }, {
      sourceUrl: rejectedSourceUrl, now: new Date("2026-09-11T12:00:00.000Z"),
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response("User-agent: *\nAllow: /", { headers: { "content-type": "text/plain" } })
        : new Response(html, { headers: { "content-type": "text/html" } }),
    });
    const chunk = sqlite.prepare(`SELECT id FROM legal_corpus_chunks WHERE version_id=? LIMIT 1`)
      .get(result.versionId) as { id: string };
    assert.deepEqual(await retrieveLegalCorpus({ db: d1, query: "непроверенная норма" }), []);
    assert.deepEqual(await retrieveLegalCorpus({
      db: d1, query: "непроверенная норма", denseSearch: async () => [{ chunkId: chunk.id, score: 1 }],
    }), []);
    const hash = sqlite.prepare(`SELECT content_sha256 AS hash FROM legal_corpus_versions WHERE id=?`)
      .get(result.versionId) as { hash: string };
    assert.deepEqual(await recordNpaCorpusVersion({
      db: d1, sourceUrl: canonicalSourceUrl, lexuzDocId: "111181",
      legalCorpusDocumentId: result.documentId, legalCorpusVariantId: result.variantId,
      legalCorpusVersionId: result.versionId!, language: "ru",
      title: "Гражданский кодекс Республики Узбекистан",
      metadata: {
        title: "Гражданский кодекс Республики Узбекистан", actType: "code",
        actNumber: "163-I", adoptionDate: "1995-12-21",
      },
      effectiveFrom: "1996-04-01", effectiveTo: null, sourceStatus: "active",
      versionEffectiveFrom: "2020-01-01", normativeChecksum: hash.hash,
      articleCount: 1, chunkCount: 1, isAsOfRevision: true,
      asOfDate: "2026-09-11", now: new Date("2026-09-11T12:00:01.000Z"),
    }), { attached: true, status: "active" });
    // The target is now verified through its canonical Russian LexUZ record,
    // but the previously rejected Uzbek-route provision must remain invisible.
    assert.deepEqual(await retrieveLegalCorpus({ db: d1, query: "непроверенная норма" }), []);
    assert.deepEqual(await retrieveLegalCorpus({
      db: d1, query: "непроверенная норма", denseSearch: async () => [{ chunkId: chunk.id, score: 1 }],
    }), []);
  } finally {
    sqlite.close();
  }
});

test("a LexUZ card without historical revision evidence becomes an explicit temporal review", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const sourceUrl = "https://lex.uz/ru/docs/5960609";
  try {
    await seedNpaMasterTargets(d1, new Date("2026-09-11T00:00:00.000Z"));
    sqlite.prepare(`UPDATE npa_discovery_state SET status='candidate',candidate_source_url=?,
      candidate_lexuz_doc_id='5960609' WHERE document_key='cybersecurity'`).run(sourceUrl);
    const html = `<!doctype html><div class="docHeader">
      Закон Республики Узбекистан от 15.04.2022 г. № ЗРУ-764
      Дата вступления в силу 17.07.2022
    </div><main id="divCont">
      <div class="lx_elem ACT_TITLE">О кибербезопасности</div>
      <div class="lx_elem ARTICLE">Статья 1. Цель настоящего Закона</div>
      <div class="lx_elem">Настоящий Закон регулирует отношения в сфере кибербезопасности. ${"Норма сохраняется только для аудита до завершения temporal review. ".repeat(6)}</div>
    </main>`;
    await ingestOfficialLexDocument({
      APP_ENV: "staging", DB: d1, BUCKET: new MemoryBucket() as unknown as R2Bucket,
      LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    }, {
      sourceUrl, now: new Date("2026-09-11T12:00:00.000Z"),
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response("User-agent: *\nAllow: /", { headers: { "content-type": "text/plain" } })
        : new Response(html, { headers: { "content-type": "text/html" } }),
    });
    const state = sqlite.prepare(`SELECT status,last_error_code AS errorCode
      FROM npa_discovery_state WHERE document_key='cybersecurity'`).get() as {
        status: string; errorCode: string | null;
      };
    assert.deepEqual({ ...state }, {
      status: "manual_review", errorCode: "VERSION_INTERVAL_AMBIGUOUS",
    });
    const review = sqlite.prepare(`SELECT reason_code AS reasonCode
      FROM npa_manual_review_report WHERE document_key='cybersecurity' AND resolved_at IS NULL`).get() as {
        reasonCode: string;
      };
    assert.equal(review.reasonCode, "VERSION_INTERVAL_AMBIGUOUS");
    const registered = sqlite.prepare(`SELECT count(*) AS count FROM npa_master_registry
      WHERE document_key='cybersecurity'`).get() as { count: number };
    assert.equal(registered.count, 0);
    assert.deepEqual(await retrieveLegalCorpus({ db: d1, query: "кибербезопасности" }), []);
  } finally {
    sqlite.close();
  }
});

test("dense-only retrieval hydrates evidence from D1 and enforces user scope", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const now = "2026-08-14T00:00:00.000Z";
  const hash = "b".repeat(64);
  try {
    sqlite.prepare(`INSERT INTO legal_corpus_documents (
      id,provider,jurisdiction,source_class,scope,tenant_id,owner_user_id,matter_id,visibility,
      canonical_url,title,availability_status,trusted,verification_status,approval_required,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "private:1", "user_upload", "UZ", "USER_TRUSTED_PRIVATE", "user", "tenant-1", "user-1", "matter-1",
      "private", null, "Private evidence", "ready", 1, "user_supplied", 0, now, now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_variants (
      id,document_id,language,is_official_language_version,translation_type,source_url,last_verified_at,current_version_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      "variant:1", "private:1", "ru", 1, null, null, now, "version:1", now, now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_versions (
      id,variant_id,previous_version_id,version_number,status,valid_from,valid_to,version_date,content_sha256,
      raw_object_key,normalized_object_key,source_url,fetched_at,change_type,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "version:1", "variant:1", null, 1, "active", "2026-01-01", null, "2026-01-01", hash,
      "private/raw", "private/normalized", null, now, "new", now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_provisions (
      id,document_id,variant_id,version_id,article_number,article_number_normalized,article_title,part,chapter,section,
      sequence,text,exact_quote_source,language,status,valid_from,valid_to,source_url,content_sha256,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "provision:1", "private:1", "variant:1", "version:1", null, null, "Private note", null, null, null,
      0, "Confidential dense-only evidence", "Confidential dense-only evidence", "ru", "active", "2026-01-01", null,
      null, hash, now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_chunks (
      id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,sparse_terms_json,indexed_at,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      "chunk:private:1", "provision:1", "version:1", 0, 1, "Confidential dense-only evidence", hash, "[]", now, now,
    );

    const denseSearch = async () => [{ chunkId: "chunk:private:1", score: 0.99 }];
    assert.deepEqual(await retrieveLegalCorpus({
      db: d1, query: "unmatched query", denseSearch,
    }), []);
    assert.deepEqual(await retrieveLegalCorpus({
      db: d1, query: "unmatched query", denseSearch,
      scope: { tenantId: "tenant-1", userId: "other-user", matterId: "matter-1" },
    }), []);
    const allowed = await retrieveLegalCorpus({
      db: d1, query: "unmatched query", denseSearch,
      scope: { tenantId: "tenant-1", userId: "user-1", matterId: "matter-1" },
    });
    assert.equal(allowed.length, 1);
    assert.equal(allowed[0]?.chunkId, "chunk:private:1");
    assert.equal(allowed[0]?.denseRank, 1);
    assert.equal(allowed[0]?.sparseRank, undefined);
  } finally {
    sqlite.close();
  }
});

test("point-in-time retrieval selects one immutable historical interval", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  const page = (selected: string, body: string) => `<!doctype html><main id="divCont">
    <div>Дата вступления в силу</div><div>01.04.1996</div>
    <div class="dropdown-menu__item lx_date_selected stopProp">${selected}</div>
    <div class="lx_elem ACT_TITLE">Исторический закон</div>
    <div class="lx_elem ARTICLE">Статья 7. Проверяемая норма</div>
    <div class="lx_elem">${body.repeat(10)}</div>
  </main>`;
  let currentBody = "Текущее правило действует сейчас. ";
  const fetchImpl = async (input: RequestInfo | URL) => String(input).endsWith("robots.txt")
    ? new Response("User-agent: *\nAllow: /", { headers: { "content-type": "text/plain" } })
    : new Response(String(input).includes("ONDATE=")
      ? page("18.05.2022", "Историческое правило действует для прошлого периода. ")
      : page("30.04.2023", currentBody), {
      headers: { "content-type": "text/html" },
    });
  const env = {
    APP_ENV: "staging" as const,
    DB: d1,
    BUCKET: bucket as unknown as R2Bucket,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
  try {
    await ingestOfficialLexDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/777", now: new Date("2026-08-14T00:00:00Z"), fetchImpl,
    });
    await ingestOfficialLexDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/777?ONDATE=18.05.2022",
      now: new Date("2026-08-14T00:01:00Z"), fetchImpl,
    });

    const current = await retrieveLegalCorpus({ db: d1, query: "статья 7 правило" });
    assert.match(current[0]?.exactQuote ?? "", /Текущее правило/u);
    const historical = await retrieveLegalCorpus({
      db: d1, query: "статья 7 правило", scope: { asOfDate: "2022-12-01" },
    });
    assert.equal(historical[0]?.status, "historical");
    assert.match(historical[0]?.exactQuote ?? "", /Историческое правило/u);
    currentBody = "Исправленное текущее правило действует сейчас. ";
    await ingestOfficialLexDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/777",
      now: new Date("2026-08-14T00:02:00Z"),
      fetchImpl,
    });
    const correctedAtSameDate = await retrieveLegalCorpus({
      db: d1, query: "статья 7 правило", scope: { asOfDate: "2023-05-01" },
    });
    assert.ok(correctedAtSameDate.length > 0);
    assert.ok(correctedAtSameDate.every((item) => item.exactQuote.includes("Исправленное")));
    assert.deepEqual(await retrieveLegalCorpus({
      db: d1, query: "статья 7 правило", scope: { asOfDate: "2020-01-01" },
    }), []);
    await assert.rejects(() => retrieveLegalCorpus({
      db: d1, query: "статья 7", scope: { asOfDate: "01.01.2022" },
    }), /LEGAL_CORPUS_AS_OF_DATE_REJECTED/u);
  } finally {
    sqlite.close();
  }
});
