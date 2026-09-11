import assert from "node:assert/strict";
import test from "node:test";
import {
  NPA_FUTURE_TARGETS,
  NPA_MASTER_TARGETS,
  assertNpaMasterTargets,
} from "../lib/legal-corpus/npa-master-registry";
import { extractNpaCrossReferences } from "../lib/legal-corpus/npa-cross-references";
import { buildNpaIngestionReport } from "../lib/legal-corpus/npa-report";
import {
  isConsolidatedNpaCandidate,
  npaTemporalState,
  npaCorpusAsOfDate,
  seedNpaMasterTargets,
  targetAcceptsLexMetadata,
} from "../lib/legal-corpus/npa-registry";
import { recordNpaCorpusVersion } from "../lib/legal-corpus/npa-registry";
import { retrieveLegalCorpus } from "../lib/legal-corpus/retrieval";
import { enqueueOfficialLexCorpusDocument, officialLexCorpusFetchJobId } from "../lib/legal-corpus/ingestion";
import {
  npaPriorityJobIds,
  npaPrioritySourceUrls,
  refreshVerifiedNpaTargetJobs,
  seedNpaTargetJobs,
} from "../lib/legal-corpus/lex-npa-target-discovery";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

test("NPA registry is exactly the mandatory 100 plus a separate future successor", () => {
  assert.doesNotThrow(() => assertNpaMasterTargets());
  assert.equal(NPA_MASTER_TARGETS.length, 100);
  assert.equal(new Set(NPA_MASTER_TARGETS.map((target) => target.documentKey)).size, 100);
  assert.deepEqual(NPA_FUTURE_TARGETS.map((target) => target.documentKey), ["realtor_activity_2026"]);
  const oldRealtor = NPA_MASTER_TARGETS.find((target) => target.documentKey === "realtor_activity_2010");
  assert.equal(oldRealtor?.successorDocumentKey, "realtor_activity_2026");
  assert.equal(oldRealtor?.verifiedSourceSeed, "https://lex.uz/ru/docs/1714039");
  assert.equal(NPA_FUTURE_TARGETS[0]?.replacesDocumentKey, "realtor_activity_2010");
});

test("LexUZ title is the identity boundary; amendments and incomplete cards never verify", () => {
  const laborCode = NPA_MASTER_TARGETS.find((target) => target.documentKey === "labor_code");
  assert.ok(laborCode);
  assert.equal(isConsolidatedNpaCandidate("О внесении изменений в Трудовой кодекс"), false);
  assert.equal(targetAcceptsLexMetadata(laborCode, {
    title: "Трудовой кодекс Республики Узбекистан",
    actType: "code", actNumber: "ЗРУ-798", adoptionDate: "2022-10-28",
  }), true);
  assert.equal(targetAcceptsLexMetadata(laborCode, {
    title: "О внесении изменений в Трудовой кодекс Республики Узбекистан",
    actType: "law", actNumber: "ЗРУ-999", adoptionDate: "2026-01-01",
  }), false);
  assert.equal(targetAcceptsLexMetadata(laborCode, {
    title: "Трудовой кодекс Республики Узбекистан",
    actType: null, actNumber: "ЗРУ-798", adoptionDate: "2022-10-28",
  }), false);
});

test("the 2010 realtor law remains active on 2026-09-11 and its successor remains future", () => {
  assert.deepEqual(npaTemporalState({
    asOfDate: "2026-09-11", effectiveFrom: "2011-01-01", effectiveTo: null,
    sourceStatus: "active", replacementScheduled: true,
  }), { status: "active", ragEnabled: true, futureStatus: "scheduled_replacement" });
  assert.deepEqual(npaTemporalState({
    asOfDate: "2026-09-11", effectiveFrom: "2026-11-08", effectiveTo: null,
    sourceStatus: "active",
  }), { status: "future", ragEnabled: false, futureStatus: "scheduled_activation" });
  assert.deepEqual(npaTemporalState({
    asOfDate: "2026-11-08", effectiveFrom: "2026-11-08", effectiveTo: null,
    sourceStatus: "active",
  }), { status: "active", ragEnabled: true, futureStatus: null });
});

test("NPA target and report tables preserve an explicit 100-target zero-ingestion state", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const result = await seedNpaMasterTargets(d1, new Date("2026-09-11T00:00:00.000Z"));
    assert.deepEqual(result, { mandatory: 100, future: 1 });
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM npa_master_targets WHERE target_set='mandatory'").get() as { count: number }).count), 100);
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM npa_master_targets").get() as { count: number }).count), 101);
    assert.equal(await npaCorpusAsOfDate(d1, new Date("2026-09-12T00:00:00.000Z")), "2026-09-11");
    const report = await buildNpaIngestionReport(d1, "2026-09-11");
    assert.deepEqual(report, {
      targetNpas: 100,
      located: 0, verified: 0, active: 0, future: 0, manualReview: 0,
      documentsIngested: 0, articlesIngested: 0, chunksGenerated: 0, embeddingsCreated: 0,
      errors: 0, warnings: 0, asOfDate: "2026-09-11", lastVerification: null,
    });
  } finally {
    sqlite.close();
  }
});

test("a previously discovered NPA card receives its own current-card verification job", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const now = new Date("2026-09-11T00:00:00.000Z");
  const sourceUrl = "https://lex.uz/ru/docs/7283074";
  const env = {
    APP_ENV: "staging",
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  } as const;
  try {
    await seedNpaMasterTargets(d1, now);
    await enqueueOfficialLexCorpusDocument(env, { sourceUrl, now, correlationId: "legacy-generic" });
    sqlite.prepare(`UPDATE npa_discovery_state SET status='verified',candidate_source_url=?,
      candidate_lexuz_doc_id='7283074' WHERE document_key='telecommunications'`).run(sourceUrl);

    await seedNpaTargetJobs(env, { now });

    const scoped = sqlite.prepare(`SELECT source_url AS sourceUrl,correlation_id AS correlationId
      FROM legal_corpus_ingestion_jobs
      WHERE correlation_id='npa:telecommunications:current-card:2026-09-11'`).get() as {
        sourceUrl: string; correlationId: string;
      } | undefined;
    assert.equal(scoped?.sourceUrl, sourceUrl);
    assert.equal(scoped?.correlationId, "npa:telecommunications:current-card:2026-09-11");
    assert.equal(Number((sqlite.prepare(`SELECT count(*) AS count FROM legal_corpus_ingestion_jobs
      WHERE source_url=?`).get(sourceUrl) as { count: number }).count), 2);
  } finally {
    sqlite.close();
  }
});

test("the 2010 realtor target is re-seeded from its own LexUZ card, never from its future successor", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const now = new Date("2026-09-11T00:00:00.000Z");
  const env = {
    APP_ENV: "staging",
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  } as const;
  try {
    await seedNpaMasterTargets(d1, now);
    sqlite.prepare(`UPDATE npa_discovery_state SET status='candidate',candidate_source_url=?,
      candidate_lexuz_doc_id='8385395' WHERE document_key='realtor_activity_2010'`)
      .run("https://lex.uz/ru/docs/8385395");

    await seedNpaTargetJobs(env, { now });
    const state = sqlite.prepare(`SELECT candidate_source_url AS sourceUrl,candidate_lexuz_doc_id AS lexuzDocId
      FROM npa_discovery_state WHERE document_key='realtor_activity_2010'`).get() as {
        sourceUrl: string; lexuzDocId: string;
      };
    assert.deepEqual({ ...state }, {
      sourceUrl: "https://lex.uz/ru/docs/1714039",
      lexuzDocId: "1714039",
    });
  } finally {
    sqlite.close();
  }
});

test("unresolved NPA identity reviews take priority over routine verified-card refreshes", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const now = new Date("2026-09-11T00:00:00.000Z");
  const env = {
    APP_ENV: "staging",
    DB: d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  } as const;
  try {
    await seedNpaMasterTargets(d1, now);
    sqlite.prepare(`UPDATE npa_discovery_state SET status='verified',candidate_source_url=?,
      updated_at='2026-09-11T00:00:00.000Z' WHERE document_key='telecommunications'`)
      .run("https://lex.uz/ru/docs/7283074");
    sqlite.prepare(`UPDATE npa_discovery_state SET status='manual_review',candidate_source_url=?,
      updated_at='2026-09-11T01:00:00.000Z' WHERE document_key='customs_code'`)
      .run("https://lex.uz/ru/docs/2876352");

    assert.deepEqual((await npaPrioritySourceUrls(d1)).slice(0, 2), [
      "https://lex.uz/ru/docs/2876352",
      "https://lex.uz/ru/docs/7283074",
    ]);
    await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/2876352", now,
      idempotencyScope: "npa-current-card:v5:customs_code:2026-09-11",
    });
    await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/7283074", now,
      idempotencyScope: "npa-current-card:v5:telecommunications:2026-09-11",
    });
    const expectedManualJobId = await officialLexCorpusFetchJobId({
      sourceUrl: "https://lex.uz/ru/docs/2876352",
      idempotencyScope: "npa-current-card:v5:customs_code:2026-09-11",
    });
    const expectedVerifiedJobId = await officialLexCorpusFetchJobId({
      sourceUrl: "https://lex.uz/ru/docs/7283074",
      idempotencyScope: "npa-current-card:v5:telecommunications:2026-09-11",
    });
    assert.deepEqual((await npaPriorityJobIds(d1, now)).slice(0, 2), [
      expectedManualJobId,
      expectedVerifiedJobId,
    ]);
  } finally {
    sqlite.close();
  }
});

test("cross-references retain explicit self and corpus-act links without fabricating targets", () => {
  const links = extractNpaCrossReferences({
    sourceDocumentKey: "labor_code",
    text: "В соответствии со статьей 160 настоящего Кодекса применяется Трудовой кодекс Республики Узбекистан.",
  });
  assert.deepEqual(links, [
    {
      relationType: "refers_to", targetDocumentKey: "labor_code", targetArticle: "160",
      rawReference: "статьей 160 настоящего Кодекса", resolutionStatus: "resolved",
    },
    {
      relationType: "refers_to", targetDocumentKey: "labor_code", targetArticle: null,
      rawReference: "Трудовой кодекс Республики Узбекистан", resolutionStatus: "resolved",
    },
  ]);
});

test("future NPA chunks are excluded until a later LexUZ recheck activates their effective date", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const now = "2026-09-11T00:00:00.000Z";
  const hash = "a".repeat(64);
  const sourceUrl = "https://lex.uz/ru/docs/999001";
  try {
    await seedNpaMasterTargets(d1, new Date(now));
    sqlite.prepare(`UPDATE npa_discovery_state SET status='candidate',candidate_source_url=?,
      candidate_lexuz_doc_id='999001' WHERE document_key='realtor_activity_2026'`).run(sourceUrl);
    sqlite.prepare(`INSERT INTO legal_corpus_documents
      (id,provider,jurisdiction,source_class,scope,tenant_id,owner_user_id,matter_id,visibility,
       canonical_url,title,short_title,document_type,document_number,adopting_authority,adoption_date,
       publication_date,availability_status,trusted,verification_status,approval_required,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "lexuz:999001", "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", null, null, null, "global",
      sourceUrl, "О риэлторской деятельности", "Риэлторская деятельность", "law", "ЗРУ-1163", null,
      "2026-08-07", null, "ready", 1, "official_source", 0, now, now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_variants
      (id,document_id,language,is_official_language_version,translation_type,source_url,last_verified_at,
       current_version_id,created_at,updated_at,title,short_title)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "lexuz:999001:ru", "lexuz:999001", "ru", 1, null, sourceUrl, now,
      "lexuz:999001:ru:v1", now, now, "О риэлторской деятельности", "Риэлторская деятельность",
    );
    sqlite.prepare(`INSERT INTO legal_corpus_versions
      (id,variant_id,previous_version_id,version_number,status,valid_from,valid_to,version_date,content_sha256,
       raw_object_key,normalized_object_key,source_url,fetched_at,change_type,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "lexuz:999001:ru:v1", "lexuz:999001:ru", null, 1, "active", "2026-11-08", null,
      "2026-11-08", hash, "raw", "normalized", sourceUrl, now, "new", now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_provisions
      (id,document_id,variant_id,version_id,article_number,article_number_normalized,article_title,part,chapter,
       section,sequence,text,exact_quote_source,language,status,valid_from,valid_to,source_url,content_sha256,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "lexuz:999001:ru:v1:p1", "lexuz:999001", "lexuz:999001:ru", "lexuz:999001:ru:v1", "1", "1",
      "Основное правило", null, null, null, 1, "Риэлтор оказывает услуги по новому закону.",
      "Риэлтор оказывает услуги по новому закону.", "ru", "active", "2026-11-08", null, sourceUrl, hash, now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_chunks
      (id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,dense_vector_id,
       sparse_terms_json,indexed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      "lexuz:999001:ru:v1:p1:c0", "lexuz:999001:ru:v1:p1", "lexuz:999001:ru:v1", 0, 1,
      "Риэлтор оказывает услуги по новому закону.", hash, "vector:future", "[]", now, now,
    );
    const base = {
      db: d1, sourceUrl, lexuzDocId: "999001", legalCorpusDocumentId: "lexuz:999001",
      legalCorpusVariantId: "lexuz:999001:ru", legalCorpusVersionId: "lexuz:999001:ru:v1",
      language: "ru" as const, title: "О риэлторской деятельности",
      metadata: { title: "О риэлторской деятельности", actType: "law", actNumber: "ЗРУ-1163", adoptionDate: "2026-08-07" },
      effectiveFrom: "2026-11-08", effectiveTo: null, sourceStatus: "active" as const,
      versionEffectiveFrom: "2026-11-08", normativeChecksum: hash, articleCount: 1, chunkCount: 1,
      isAsOfRevision: false,
    };
    assert.deepEqual(await recordNpaCorpusVersion({ ...base, now: new Date(now) }), { attached: true, status: "future" });
    assert.deepEqual(await refreshVerifiedNpaTargetJobs({
      APP_ENV: "staging", DB: d1, LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    }, { now: new Date(now) }), { considered: 1, queued: 1, date: "2026-09-11" });
    assert.deepEqual(await refreshVerifiedNpaTargetJobs({
      APP_ENV: "staging", DB: d1, LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    }, { now: new Date(now) }), { considered: 1, queued: 0, date: "2026-09-11" });
    assert.deepEqual(await retrieveLegalCorpus({
      db: d1, query: "риэлтор", scope: { asOfDate: "2026-09-11" },
      denseSearch: async () => [{ chunkId: "lexuz:999001:ru:v1:p1:c0", score: 1 }],
    }), []);
    assert.deepEqual(await recordNpaCorpusVersion({
      ...base, now: new Date("2026-11-09T00:00:00.000Z"),
    }), { attached: true, status: "active" });
    const active = await retrieveLegalCorpus({
      db: d1, query: "риэлтор", scope: { asOfDate: "2026-11-09" },
      denseSearch: async () => [{ chunkId: "lexuz:999001:ru:v1:p1:c0", score: 1 }],
    });
    assert.equal(active[0]?.chunkId, "lexuz:999001:ru:v1:p1:c0");
  } finally {
    sqlite.close();
  }
});
