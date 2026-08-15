import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PlatformStaffAccess } from "../lib/auth/staff-access";
import { adminRoleAllows } from "../lib/auth/admin-domain-session";
import { legalCorpusAdminRuntimeEnv } from "../lib/auth/admin-internal-api";
import {
  LegalCorpusAdminError,
  performLegalCorpusAdminAction,
  readLegalCorpusAdminDashboard,
  readLegalCorpusQdrantHealth,
  verifyLegalCorpusAdminHistory,
} from "../lib/legal-corpus/admin-operations";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = new Date("2026-08-15T12:00:00.000Z");
const staff: PlatformStaffAccess = {
  userId: "staff-admin-1",
  sessionId: "session-admin-1",
  capability: "staff.operations.manage",
  roles: ["administrator"],
  assignmentIds: ["assignment-admin-1"],
  mfaVerifiedAt: "2026-08-15T11:55:00.000Z",
};

function enabledEnv(db: D1Database) {
  return {
    DB: db,
    APP_ENV: "staging" as const,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    LEGAL_CORPUS_MULTILINGUAL_ENABLED: "true",
  };
}

test("admin runtime copies non-enumerable Cloudflare corpus bindings explicitly", () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const runtime = {} as Parameters<typeof legalCorpusAdminRuntimeEnv>[0];
    Object.defineProperties(runtime, {
      LEGAL_CORPUS_ENABLED: { value: "true", enumerable: false },
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: { value: "true", enumerable: false },
      LEGAL_CORPUS_DENSE_ENABLED: { value: "false", enumerable: false },
      QDRANT_URL: { value: "https://qdrant.internal", enumerable: false },
      QDRANT_API_KEY: { value: "secret", enumerable: false },
      QDRANT_COLLECTION: { value: "juro_legal_staging", enumerable: false },
    });
    const copied = legalCorpusAdminRuntimeEnv(runtime, d1, "staging");
    assert.equal(copied.DB, d1);
    assert.equal(copied.APP_ENV, "staging");
    assert.equal(copied.LEGAL_CORPUS_ENABLED, "true");
    assert.equal(copied.LEGAL_CORPUS_AUTO_INGEST_ENABLED, "true");
    assert.equal(copied.LEGAL_CORPUS_DENSE_ENABLED, "false");
    assert.equal(copied.QDRANT_URL, "https://qdrant.internal");
    assert.equal(copied.QDRANT_API_KEY, "secret");
    assert.equal(copied.QDRANT_COLLECTION, "juro_legal_staging");
  } finally { sqlite.close(); }
});

test("admin Qdrant health stays dormant when dense retrieval is disabled", async () => {
  let calls = 0;
  const health = await readLegalCorpusQdrantHealth({
    env: {
      DB: {} as D1Database,
      APP_ENV: "staging",
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_DENSE_ENABLED: "false",
      QDRANT_URL: "https://qdrant.internal",
      QDRANT_API_KEY: "secret",
      QDRANT_COLLECTION: "juro_legal_staging",
      QDRANT_SERVICE: { fetch: async () => { calls += 1; return new Response(); } } as unknown as Fetcher,
    },
    now,
  });
  assert.deepEqual(health, {
    configured: true,
    enabled: false,
    status: "disabled",
    totalPoints: null,
    currentPoints: null,
    errorCode: null,
    checkedAt: now.toISOString(),
  });
  assert.equal(calls, 0);
});

test("admin Qdrant health validates the collection and exact point counts", async () => {
  const requests: Request[] = [];
  const service = {
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/points/count")) {
        const body = await request.clone().json() as { filter?: unknown };
        return Response.json({ status: "ok", result: { count: body.filter ? 17 : 23 } });
      }
      return Response.json({
        status: "ok",
        result: { config: { params: {
          vectors: { dense: { size: 1536, distance: "Cosine" } },
          sparse_vectors: { sparse: {} },
        } } },
      });
    },
  } as unknown as Fetcher;
  const health = await readLegalCorpusQdrantHealth({
    env: {
      DB: {} as D1Database,
      APP_ENV: "staging",
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_DENSE_ENABLED: "true",
      QDRANT_URL: "https://qdrant.internal",
      QDRANT_API_KEY: "secret",
      QDRANT_COLLECTION: "juro_legal_staging",
      QDRANT_SERVICE: service,
    },
    now,
  });
  assert.deepEqual(health, {
    configured: true,
    enabled: true,
    status: "ready",
    totalPoints: 23,
    currentPoints: 17,
    errorCode: null,
    checkedAt: now.toISOString(),
  });
  assert.equal(requests.length, 4);
  assert.ok(requests.every((request) => request.headers.get("api-key") === "secret"));
});

test("admin corpus actions are fail-closed behind both ingestion flags", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await assert.rejects(
      performLegalCorpusAdminAction({
        env: { DB: d1, APP_ENV: "staging", LEGAL_CORPUS_ENABLED: "true" },
        staff,
        value: { action: "seed_discovery", reason: "Create the bounded catalog checkpoints." },
        now,
      }),
      (error: unknown) => error instanceof LegalCorpusAdminError && error.code === "LEGAL_CORPUS_ADMIN_DISABLED",
    );
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_admin_events").get() as { count: number }).count), 0);
  } finally { sqlite.close(); }
});

test("MFA-bound corpus actions seed and retry without a legal approval queue", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = enabledEnv(d1);
    const seeded = await performLegalCorpusAdminAction({
      env, staff,
      value: { action: "seed_discovery", reason: "Initialize the official Lex catalog checkpoints." },
      now,
    });
    assert.deepEqual(seeded, { action: "seed_discovery", affected: 44 });
    sqlite.prepare("UPDATE legal_corpus_discovery_checkpoints SET status='dead_letter',last_error_code='LEX_TIMEOUT' WHERE id=?")
      .run("lex-catalog:laws:ru");
    const retried = await performLegalCorpusAdminAction({
      env, staff,
      value: { action: "retry_discovery", checkpointId: "lex-catalog:laws:ru", reason: "Retry after the bounded Lex timeout window." },
      // Identical timestamps must still form one chain; random UUID ordering
      // is not a valid substitute for previous_event_hash traversal.
      now,
    });
    assert.deepEqual(retried, { action: "retry_discovery", affected: 1 });
    assert.equal((sqlite.prepare("SELECT status FROM legal_corpus_discovery_checkpoints WHERE id=?").get("lex-catalog:laws:ru") as { status: string }).status, "queued");
    assert.deepEqual(await verifyLegalCorpusAdminHistory(d1, "staging"), { valid: true, checked: 2 });
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_admin_events WHERE actor_mfa_verified_at=?").get(staff.mfaVerifiedAt) as { count: number }).count), 2);
    assert.throws(
      () => sqlite.prepare("UPDATE legal_corpus_admin_events SET reason='tampered reason' WHERE 1=1").run(),
      /LEGAL_CORPUS_ADMIN_EVENT_IMMUTABLE/u,
    );
    assert.equal(
      Number((sqlite.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name LIKE '%approval%' AND name LIKE 'legal_corpus%'").get() as { count: number }).count),
      0,
    );
  } finally { sqlite.close(); }
});

test("dashboard proves coverage from indexed or technically unavailable documents", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = enabledEnv(d1);
    await performLegalCorpusAdminAction({
      env, staff,
      value: { action: "seed_discovery", reason: "Initialize dashboard coverage checkpoints." },
      now,
    });
    sqlite.exec(`
      INSERT INTO legal_corpus_documents
        (id,provider,jurisdiction,source_class,scope,tenant_id,owner_user_id,matter_id,visibility,canonical_url,title,availability_status,trusted,verification_status,approval_required,created_at,updated_at)
      VALUES ('lexuz:100','lex_uz','UZ','OFFICIAL_LEGISLATION','global',NULL,NULL,NULL,'global','https://lex.uz/ru/docs/100','Test Act','ready',1,'official_source',0,'2026-08-15T10:00:00.000Z','2026-08-15T10:00:00.000Z');
      INSERT INTO legal_corpus_variants
        (id,document_id,language,is_official_language_version,translation_type,source_url,last_verified_at,current_version_id,created_at,updated_at)
      VALUES ('variant-100','lexuz:100','ru',1,NULL,'https://lex.uz/ru/docs/100','2026-08-15T10:00:00.000Z',NULL,'2026-08-15T10:00:00.000Z','2026-08-15T10:00:00.000Z');
      INSERT INTO legal_corpus_versions
        (id,variant_id,previous_version_id,version_number,status,valid_from,valid_to,version_date,content_sha256,source_url,fetched_at,change_type,created_at)
      VALUES ('version-old','variant-100',NULL,1,'historical','2020-01-01','2026-01-01','2020-01-01','${"a".repeat(64)}','https://lex.uz/ru/docs/100','2026-08-15T09:00:00.000Z','new','2026-08-15T09:00:00.000Z');
      INSERT INTO legal_corpus_versions
        (id,variant_id,previous_version_id,version_number,status,valid_from,valid_to,version_date,content_sha256,source_url,fetched_at,change_type,created_at)
      VALUES ('version-current','variant-100','version-old',2,'active','2026-01-01',NULL,'2026-01-01','${"b".repeat(64)}','https://lex.uz/ru/docs/100','2026-08-15T10:00:00.000Z','modified','2026-08-15T10:00:00.000Z');
      UPDATE legal_corpus_variants SET current_version_id='version-current' WHERE id='variant-100';
      INSERT INTO legal_corpus_provisions
        (id,document_id,variant_id,version_id,article_number,article_number_normalized,article_title,sequence,text,exact_quote_source,language,status,valid_from,valid_to,source_url,content_sha256,created_at)
      VALUES ('provision-100','lexuz:100','variant-100','version-current','1','1','Rule',0,'Official rule text','Official rule text','ru','active','2026-01-01',NULL,'https://lex.uz/ru/docs/100','${"c".repeat(64)}','2026-08-15T10:00:00.000Z');
      INSERT INTO legal_corpus_chunks
        (id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,sparse_terms_json,indexed_at,created_at)
      VALUES ('chunk-100','provision-100','version-current',0,1,'Official rule text','${"c".repeat(64)}','[]','2026-08-15T10:00:00.000Z','2026-08-15T10:00:00.000Z');
      INSERT INTO legal_corpus_source_aliases (source_url,document_id,provider_source_id,language,created_at)
      VALUES ('https://lex.uz/ru/docs/100','lexuz:100','lexuz:100','ru','2026-08-15T10:00:00.000Z');
      INSERT INTO legal_corpus_discovery_documents (checkpoint_id,source_url,provider_source_id,language,discovered_at)
      VALUES ('lex-catalog:laws:ru','https://lex.uz/ru/docs/100','lexuz:100','ru','2026-08-15T10:00:00.000Z'),
             ('lex-catalog:laws:ru','https://lex.uz/ru/docs/101','lexuz:101','ru','2026-08-15T10:00:00.000Z');
      UPDATE legal_corpus_discovery_checkpoints SET status='completed',expected_document_count=2,discovered_document_count=2,page_number=1 WHERE id='lex-catalog:laws:ru';
      INSERT INTO legal_corpus_failures
        (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,safe_message,retryable,retry_count,retry_state)
      VALUES ('failure-101',NULL,'lexuz:101','https://lex.uz/ru/docs/101','ru','2026-08-15T10:00:00.000Z',404,'LEX_DOCUMENT_NOT_FOUND','Official document was not available.',0,5,'technically_unavailable');
      INSERT INTO legal_source_health_checks
        (id,environment,source_kind,status,checked_at,latency_ms,error_code,endpoint_url,created_at)
      VALUES ('health-lex','staging','lex','healthy','2026-08-15T11:59:00.000Z',120,NULL,'https://lex.uz/robots.txt','2026-08-15T11:59:00.000Z');
      INSERT INTO scheduled_runs
        (id,schedule_name,cron,scheduled_for,idempotency_key,holder_id,status,error_code,started_at,finished_at,created_at,updated_at)
      VALUES ('corpus-run-1','legal-corpus-worker','*/5 * * * *','2026-08-15T11:55:00.000Z','staging:corpus-run-1','holder-1','completed',NULL,'2026-08-15T11:55:00.000Z','2026-08-15T11:58:00.000Z','2026-08-15T11:55:00.000Z','2026-08-15T11:58:00.000Z');
    `);
    const dashboard = await readLegalCorpusAdminDashboard({ env, now });
    assert.equal(dashboard.lexHealth.state, "fresh");
    assert.equal(dashboard.qdrantHealth.status, "disabled");
    assert.equal(dashboard.qdrantHealth.enabled, false);
    assert.equal(dashboard.totals.canonicalDocuments, 1);
    assert.equal(dashboard.totals.languageVariants, 1);
    assert.equal(dashboard.totals.uniqueProvisions, 1);
    assert.equal(dashboard.totals.currentProvisions, 1);
    assert.equal(dashboard.totals.indexedChunks, 1);
    assert.equal(dashboard.totals.historicalVersions, 1);
    assert.equal(dashboard.totals.lastSuccessfulUpdate, "2026-08-15T11:58:00.000Z");
    const coverage = dashboard.coverage.find((row) => row.categoryKey === "laws" && row.language === "ru");
    assert.deepEqual(coverage && {
      discovered: coverage.discoveredDocuments,
      fetched: coverage.fetchedDocuments,
      extracted: coverage.extractedDocuments,
      indexed: coverage.indexedDocuments,
      unavailable: coverage.technicallyUnavailable,
      complete: coverage.complete,
    }, { discovered: 2, fetched: 1, extracted: 1, indexed: 1, unavailable: 1, complete: true });
    sqlite.prepare("UPDATE legal_corpus_discovery_checkpoints SET expected_document_count=3 WHERE id='lex-catalog:laws:ru'").run();
    const incomplete = await readLegalCorpusAdminDashboard({ env, now });
    assert.equal(incomplete.coverage.find((row) => row.categoryKey === "laws" && row.language === "ru")?.complete, false);
  } finally { sqlite.close(); }
});

test("isolated admin domain owns the corpus surface and rechecks CSRF plus super-admin role", () => {
  assert.equal(adminRoleAllows(["super_admin"], "legal.corpus.manage"), true);
  assert.equal(adminRoleAllows(["lawyer_moderator"], "legal.corpus.manage"), false);
  const worker = readFileSync(new URL("../../admin/src/worker.ts", import.meta.url), "utf8");
  const internal = readFileSync(new URL("../lib/auth/admin-internal-api.ts", import.meta.url), "utf8");
  assert.match(worker, /href="\/legal-corpus"/u);
  assert.match(worker, /url\.pathname === "\/legal-corpus"/u);
  assert.match(worker, /url\.pathname === "\/legal-corpus\/actions"/u);
  assert.match(worker, /if \(!await csrf\(request\)\)/u);
  assert.match(worker, /\/api\/internal\/admin\/legal-corpus/u);
  assert.match(internal, /adminRoleAllows\(authenticated\.principal\.roles, "legal\.corpus\.manage"\)/u);
  assert.match(internal, /sourceMfaVerifiedAt/u);
  assert.match(internal, /legalCorpusAdminActionSchema\.safeParse/u);
  assert.match(internal, /legalCorpusAdminActionSchema\.safeParse/u);
  assert.doesNotMatch(internal, /ownerMaterialMutation|roles\.includes\("lawyer_moderator"\)/u);
  assert.match(internal, /role='administrator'/u);
  assert.match(internal, /legal_corpus\.admin\.runtime_flags/u);
  assert.doesNotMatch(internal, /runtime_flags[\s\S]{0,600}(?:token|question|answer|document)/iu);
  assert.match(worker, /Добавить материал владельца/u);
  assert.match(worker, /name="reason" value="Автоматический первичный seed из защищённой панели\."/u);
  assert.match(worker, /Причина первичного запуска записывается в защищённый журнал автоматически/u);
  const seedFormSource = worker.slice(worker.indexOf("const seed ="), worker.indexOf("const checkpointForms"));
  assert.doesNotMatch(seedFormSource, /\$\{reason\}|textarea name="reason"/u);
});

test("owner ingestion has an independent deny-by-default flag without a legal approval field", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const action = {
      action: "publish_owner_material" as const,
      analysisId: "analysis-owner",
      workspaceId: "workspace-owner",
      title: "Owner legal material",
      language: "ru" as const,
      rightsConfirmed: true as const,
      reason: "Ingest automatically after the technical owner-material gate passes.",
    };
    await assert.rejects(
      performLegalCorpusAdminAction({
        env: { DB: d1, APP_ENV: "staging", LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true" },
        staff,
        value: action,
        now,
      }),
      (error: unknown) => error instanceof LegalCorpusAdminError && error.code === "LEGAL_CORPUS_ADMIN_DISABLED",
    );
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_owner_ingestions").get() as { count: number }).count), 0);
  } finally { sqlite.close(); }
});
