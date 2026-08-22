import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const seed = read("../scripts/investor-demo-seed.sql");

test("lawyer time and conflict evidence remain append-only and one timer can run", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    sqlite.exec(seed);
    assert.throws(
      () => sqlite.prepare("DELETE FROM lawyer_time_entries WHERE id=?").run("90500000-0000-4000-8000-000000000001"),
      /LAWYER_TIME_ENTRY_APPEND_ONLY/,
    );
    assert.throws(
      () => sqlite.prepare("UPDATE lawyer_time_entries SET description='changed' WHERE id=?").run("90500000-0000-4000-8000-000000000001"),
      /LAWYER_TIME_ENTRY_IMMUTABLE/,
    );
    sqlite.prepare(
      `INSERT INTO lawyer_time_entries
        (id,lawyer_user_id,workspace_id,case_id,lawyer_request_id,source,status,description,billable,started_at,ended_at,duration_seconds,created_at,updated_at)
       VALUES (?,?,?,?,?,'timer','running','Synthetic running timer',0,?,NULL,NULL,?,?)`,
    ).run(
      "90500000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000001",
      "40000000-0000-4000-8000-000000000001",
      "90000000-0000-4000-8000-000000000001",
      "2026-08-22T10:00:00.000Z",
      "2026-08-22T10:00:00.000Z",
      "2026-08-22T10:00:00.000Z",
    );
    assert.throws(
      () => sqlite.prepare(
        `INSERT INTO lawyer_time_entries
          (id,lawyer_user_id,workspace_id,case_id,lawyer_request_id,source,status,description,billable,started_at,ended_at,duration_seconds,created_at,updated_at)
         VALUES (?,?,?,?,?,'timer','running','Second timer',0,?,NULL,NULL,?,?)`,
      ).run(
        "90500000-0000-4000-8000-000000000003",
        "10000000-0000-4000-8000-000000000002",
        "20000000-0000-4000-8000-000000000001",
        "40000000-0000-4000-8000-000000000001",
        "90000000-0000-4000-8000-000000000001",
        "2026-08-22T10:00:00.000Z",
        "2026-08-22T10:00:00.000Z",
        "2026-08-22T10:00:00.000Z",
      ),
      /UNIQUE constraint failed/,
    );

    sqlite.prepare(
      "INSERT INTO lawyer_conflict_search_events (id,lawyer_user_id,query_sha256,result_count,created_at) VALUES (?,?,?,?,?)",
    ).run("90800000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "a".repeat(64), 0, "2026-08-22T10:00:00.000Z");
    assert.throws(
      () => sqlite.prepare("UPDATE lawyer_conflict_search_events SET result_count=1 WHERE id=?").run("90800000-0000-4000-8000-000000000001"),
      /LAWYER_CONFLICT_SEARCH_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM lawyer_conflict_search_events WHERE id=?").run("90800000-0000-4000-8000-000000000001"),
      /LAWYER_CONFLICT_SEARCH_APPEND_ONLY/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM lawyer_knowledge_items WHERE id=?").run("90700000-0000-4000-8000-000000000001"),
      /LAWYER_KNOWLEDGE_ARCHIVE_REQUIRED/,
    );
  } finally {
    sqlite.close();
  }
});

test("professional APIs enforce access, safe writes and privacy boundaries", () => {
  const timeRoute = read("../app/api/platform/lawyer-time/route.ts");
  const conflictRoute = read("../app/api/platform/lawyer-conflicts/route.ts");
  const knowledgeRoute = read("../app/api/platform/lawyer-knowledge/route.ts");

  for (const source of [timeRoute, conflictRoute, knowledgeRoute]) {
    assert.match(source, /assertSafeWrite\(request\)/);
    assert.match(source, /requireApiUser\(\)/);
  }
  assert.match(timeRoute, /lawyer_access_grants/);
  assert.match(timeRoute, /g\.revoked_at IS NULL/);
  assert.match(timeRoute, /billable.*does not|billable/s);
  assert.match(conflictRoute, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(conflictRoute, /query_sha256/);
  assert.match(conflictRoute, /lawyer_knowledge_items/);
  assert.doesNotMatch(conflictRoute, /raw_query|query_text/);
  assert.match(conflictRoute, /manualReviewRequired: true/);
  assert.match(conflictRoute, /не гарантируют отсутствие конфликта/);
  assert.match(knowledgeRoute, /hostname === "lex\.uz" \|\| hostname === "www\.lex\.uz"/);
  assert.match(knowledgeRoute, /CASE_ACCESS_REQUIRED/);
  assert.match(knowledgeRoute, /lawyer_access_grants/);
});

test("lawyer workspace exposes time, conflict check and searchable knowledge UI", () => {
  const tools = read("../app/_platform/LawyerProfessionalTools.tsx");
  const knowledge = read("../app/_platform/LawyerKnowledgeClient.tsx");
  const workspace = read("../app/_platform/LawyerWorkspaceClient.tsx");
  const routing = read("../lib/platform/routing.ts");
  const shell = read("../app/_platform/PlatformShell.tsx");

  assert.match(workspace, /<LawyerProfessionalTools/);
  assert.match(tools, /Учёт времени/);
  assert.match(tools, /Conflict Check/);
  assert.match(tools, /juro-lawyer-time-/);
  assert.match(tools, /Ручная проверка всё равно обязательна/);
  assert.match(knowledge, /База знаний/);
  assert.match(knowledge, /Поиск по содержанию/);
  assert.match(knowledge, /Lex\.uz/);
  assert.match(knowledge, /action, itemId: item\.id/);
  assert.match(routing, /"knowledge"/);
  assert.match(shell, /\["knowledge", BookOpen/);
});
