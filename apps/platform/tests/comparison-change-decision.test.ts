import assert from "node:assert/strict";
import test from "node:test";
import {
  ComparisonDecisionError,
  decideComparisonChange,
} from "../lib/document-comparison/review-decision";
import { batchBarrier, sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = "2026-08-04T12:00:00.000Z";

test("comparison decisions are tenant-scoped, durable, reversible, and audited without document text", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    await assert.rejects(
      decideComparisonChange(d1, {
        comparisonId: "comparison-a",
        changeId: "change-a",
        workspaceId: "workspace-b",
        userId: "user-b",
        decision: "accepted",
      }),
      (error: unknown) => error instanceof ComparisonDecisionError
        && error.code === "COMPARISON_CHANGE_NOT_FOUND"
        && error.status === 404,
    );

    const accepted = await decideComparisonChange(d1, {
      comparisonId: "comparison-a",
      changeId: "change-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      decision: "accepted",
    });
    assert.equal(accepted.replay, false);
    assert.equal(accepted.change.reviewDecision, "accepted");
    assert.equal(accepted.change.reviewDecisionVersion, 1);
    assert.ok(accepted.change.decidedAt);
    assert.ok(accepted.change.reviewedAt, "a decision must also mark the change reviewed");

    const replay = await decideComparisonChange(d1, {
      comparisonId: "comparison-a",
      changeId: "change-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      decision: "accepted",
    });
    assert.equal(replay.replay, true);
    assert.equal(replay.change.reviewDecisionVersion, 1);

    const rejected = await decideComparisonChange(d1, {
      comparisonId: "comparison-a",
      changeId: "change-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      decision: "rejected",
    });
    assert.equal(rejected.change.reviewDecision, "rejected");
    assert.equal(rejected.change.reviewDecisionVersion, 2);

    const cleared = await decideComparisonChange(d1, {
      comparisonId: "comparison-a",
      changeId: "change-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      decision: null,
    });
    assert.equal(cleared.change.reviewDecision, null);
    assert.equal(cleared.change.decidedAt, null);
    assert.ok(cleared.change.reviewedAt, "clearing a decision must not erase review evidence");
    assert.equal(cleared.change.reviewDecisionVersion, 3);

    const events = sqlite.prepare(
      `SELECT action,metadata_json AS metadataJson
       FROM workspace_audit_events WHERE entity_type='comparison_change' ORDER BY created_at,id`,
    ).all() as Array<{ action: string; metadataJson: string }>;
    assert.deepEqual(events.map((event) => event.action).sort(), [
      "comparison_change_accepted",
      "comparison_change_decision_cleared",
      "comparison_change_rejected",
    ]);
    for (const event of events) {
      const metadata = JSON.parse(event.metadataJson) as Record<string, unknown>;
      assert.equal(metadata.comparisonId, "comparison-a");
      assert.equal(typeof metadata.decisionVersion, "number");
      assert.doesNotMatch(event.metadataJson, /Срок|дней|before|after/i);
    }
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS count FROM analysis_document_versions").get() as { count: number }).count,
      0,
      "a review decision must not create a merged third version",
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("same concurrent comparison decision records one transition and one audit event", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seed(sqlite);
    const synchronized = batchBarrier(d1, 2);
    const input = {
      comparisonId: "comparison-a",
      changeId: "change-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      decision: "accepted" as const,
    };
    const results = await Promise.all([
      decideComparisonChange(synchronized, input),
      decideComparisonChange(synchronized, input),
    ]);
    assert.deepEqual(results.map((result) => result.replay).sort(), [false, true]);
    assert.equal(
      (sqlite.prepare("SELECT review_decision_version AS version FROM comparison_changes WHERE id='change-a'").get() as { version: number }).version,
      1,
    );
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS count FROM workspace_audit_events WHERE action='comparison_change_accepted'").get() as { count: number }).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("0072 rejects preset, malformed, and cross-owner decisions while allowing actor redaction", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    seed(sqlite);
    assert.throws(
      () => sqlite.prepare(
        `INSERT INTO comparison_changes
         (id,comparison_id,ordinal,change_type,word_diff_json,summary,legal_effect,affected_party,
          risk_effect,risk_level,recommendation,source_ids_json,review_decision,decided_by_user_id,
          decided_at,review_decision_version,review_decision_event_id,extraction_warning,created_at)
         VALUES ('preset','comparison-a',2,'changed','[]','summary','effect','party','neutral','low',
          'review','[]','accepted','user-a',?,1,'00000000-0000-4000-8000-000000000001',0,?)`,
      ).run(now, now),
      /comparison_change_decision_insert_invalid/,
    );
    assert.throws(
      () => sqlite.prepare(
        "UPDATE comparison_changes SET review_decision='accepted',decided_by_user_id='user-a' WHERE id='change-a'",
      ).run(),
      /comparison_change_decision_transition_invalid/,
    );
    assert.throws(
      () => sqlite.prepare(
        `UPDATE comparison_changes SET review_decision='accepted',decided_by_user_id='user-b',decided_at=?,
         reviewed_at=?,review_decision_version=1,review_decision_event_id='00000000-0000-4000-8000-000000000002'
         WHERE id='change-a'`,
      ).run(now, now),
      /comparison_change_decision_tenant_mismatch/,
    );
    sqlite.prepare(
      `UPDATE comparison_changes SET review_decision='accepted',decided_by_user_id='user-a',decided_at=?,
       reviewed_at=?,review_decision_version=1,review_decision_event_id='00000000-0000-4000-8000-000000000003'
       WHERE id='change-a'`,
    ).run(now, now);
    sqlite.prepare("UPDATE comparison_changes SET decided_by_user_id=NULL WHERE id='change-a'").run();
    const redacted = sqlite.prepare(
      `SELECT review_decision AS decision,decided_by_user_id AS actor,decided_at AS decidedAt,
       review_decision_version AS version,review_decision_event_id AS eventId
       FROM comparison_changes WHERE id='change-a'`,
    ).get() as { decision: string; actor: string | null; decidedAt: string; version: number; eventId: string };
    assert.equal(redacted.decision, "accepted");
    assert.equal(redacted.actor, null);
    assert.equal(redacted.decidedAt, now);
    assert.equal(redacted.version, 1);
    assert.equal(redacted.eventId, "00000000-0000-4000-8000-000000000003");
  } finally {
    sqlite.close();
  }
});

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]) {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES (?,?,?,?),(?,?,?,?)")
    .run("user-a", "a@example.test", now, now, "user-b", "b@example.test", now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES (?,?,?,?,?),(?,?,?,?,?)")
    .run("workspace-a", "individual", "A", now, now, "workspace-b", "individual", "B", now, now);
  sqlite.prepare(
    `INSERT INTO document_files
     (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
     VALUES ('file-one','workspace-a','user-a','analysis_safe','safe/one','v1.pdf','application/pdf',1200,?,?,?),
            ('file-two','workspace-a','user-a','analysis_safe','safe/two','v2.pdf','application/pdf',1200,?,?,?)`,
  ).run("1".repeat(64), now, now, "2".repeat(64), now, now);
  sqlite.prepare(
    `INSERT INTO document_comparisons
     (id,workspace_id,owner_user_id,version_one_file_id,version_two_file_id,status,stage,locale,created_at,updated_at)
     VALUES ('comparison-a','workspace-a','user-a','file-one','file-two','completed','completed','ru',?,?)`,
  ).run(now, now);
  sqlite.prepare(
    `INSERT INTO comparison_changes
     (id,comparison_id,ordinal,change_type,before_text,after_text,word_diff_json,summary,legal_effect,
      affected_party,risk_effect,risk_level,recommendation,source_ids_json,confidence_percent,
      extraction_warning,created_at)
     VALUES ('change-a','comparison-a',1,'changed','Срок — 5 дней','Срок — 10 дней','[]',
      'Срок увеличен','Изменён срок исполнения','Заказчик','increased','medium',
      'Проверить приемлемость срока','[]',95,0,?)`,
  ).run(now);
}
