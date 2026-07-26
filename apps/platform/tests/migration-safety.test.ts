import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

type JournalEntry = {
  idx: number;
  tag: string;
};

const drizzleRoot = new URL("../drizzle/", import.meta.url);
const journal = JSON.parse(
  readFileSync(new URL("meta/_journal.json", drizzleRoot), "utf8"),
) as { entries: JournalEntry[] };
const phaseOneEntry = journal.entries.find(({ idx }) => idx === 11);
const phaseTwoEntry = journal.entries.find(({ idx }) => idx === 12);
const sessionSecurityEntry = journal.entries.find(({ idx }) => idx === 13);
const mfaEntry = journal.entries.find(({ idx }) => idx === 14);
const policyDeletionEntry = journal.entries.find(({ idx }) => idx === 15);

assert.ok(phaseOneEntry, "Drizzle journal must contain migration 0011");
assert.ok(phaseTwoEntry, "Drizzle journal must contain migration 0012");
assert.ok(sessionSecurityEntry, "Drizzle journal must contain migration 0013");
assert.ok(mfaEntry, "Drizzle journal must contain migration 0014");
assert.ok(
  policyDeletionEntry,
  "Drizzle journal must contain migration 0015",
);

function migrationSql(entry: JournalEntry): string {
  return readFileSync(new URL(`${entry.tag}.sql`, drizzleRoot), "utf8");
}

function statements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function applyMigration(db: DatabaseSync, entry: JournalEntry): void {
  for (const statement of statements(migrationSql(entry))) {
    db.exec(statement);
  }
}

function tableDefinitions(db: DatabaseSync): Map<string, string> {
  const rows = db.prepare(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string; sql: string }>;
  return new Map(rows.map(({ name, sql }) => [name, sql]));
}

const expectedTables = [
  "backup_runs",
  "cleanup_runs",
  "idempotency_keys",
  "job_outbox",
  "job_runs",
  "scheduled_locks",
  "scheduled_runs",
] as const;

test("0011 is additive and declares the durable foundation indexes", () => {
  const sql = migrationSql(phaseOneEntry);
  const migrationStatements = statements(sql);

  for (const statement of migrationStatements) {
    assert.match(
      statement,
      /^CREATE (?:TABLE|INDEX|UNIQUE INDEX)\b/i,
      `unexpected non-additive statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const table of expectedTables) {
    assert.match(sql, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }

  for (const indexName of [
    "idempotency_keys_expiry_idx",
    "job_outbox_idempotency_uidx",
    "job_outbox_status_idx",
    "job_outbox_lease_idx",
    "job_outbox_workspace_idx",
    "job_runs_idempotency_uidx",
    "job_runs_message_uidx",
    "job_runs_status_idx",
    "job_runs_lease_idx",
    "job_runs_workspace_idx",
    "scheduled_locks_expiry_idx",
    "scheduled_runs_idempotency_uidx",
  ]) {
    assert.match(sql, new RegExp(`\\\`${indexName}\\\``));
  }
});

test("0011 journal entry and schema snapshot agree", () => {
  assert.equal(phaseOneEntry.idx, 11);
  assert.match(phaseOneEntry.tag, /^0011_/);
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0011_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    tables: Record<string, { indexes: Record<string, unknown> }>;
  };

  for (const table of expectedTables) {
    assert.ok(snapshot.tables[table], `${table} missing from snapshot`);
  }
  assert.ok(
    snapshot.tables.job_outbox.indexes.job_outbox_lease_idx,
    "outbox lease index missing from snapshot",
  );
  assert.ok(
    snapshot.tables.job_runs.indexes.job_runs_idempotency_uidx,
    "job idempotency index missing from snapshot",
  );
});

test("all migrations apply cleanly with foreign-key integrity", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) {
      applyMigration(db, entry);
    }
    assert.deepEqual(
      db.prepare("PRAGMA foreign_key_check").all(),
      [],
    );
    const tables = tableDefinitions(db);
    for (const table of expectedTables) {
      assert.ok(tables.has(table));
    }
  } finally {
    db.close();
  }
});

test("0011 preserves existing schema and workspace data", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx < 11)) {
      applyMigration(db, entry);
    }

    db.prepare(`
      INSERT INTO workspaces (
        id, type, name, locale, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "ws_phase1_sentinel",
      "business",
      "Phase 1 sentinel",
      "ru",
      "2026-07-26T00:00:00.000Z",
      "2026-07-26T00:00:00.000Z",
    );

    const before = tableDefinitions(db);
    applyMigration(db, phaseOneEntry);
    const after = tableDefinitions(db);

    assert.equal(after.size - before.size, expectedTables.length);
    for (const [name, definition] of before) {
      assert.equal(after.get(name), definition, `${name} definition changed`);
    }
    assert.equal(
      (
        db.prepare(
          "SELECT name FROM workspaces WHERE id = ?",
        ).get("ws_phase1_sentinel") as { name: string }
      ).name,
      "Phase 1 sentinel",
    );
    assert.deepEqual(
      db.prepare("PRAGMA foreign_key_check").all(),
      [],
    );
  } finally {
    db.close();
  }
});

test("0012 backfills tenant links only through active workspace ownership", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE user_profiles (
        id TEXT PRIMARY KEY,
        default_workspace_id TEXT
      );
      CREATE TABLE workspace_members (
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        workspace_id TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE document_files (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        document_id TEXT,
        workspace_id TEXT
      );
      CREATE TABLE auth_otp_challenges (
        id TEXT PRIMARY KEY,
        request_ip_hash TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO user_profiles VALUES
        ('active-owner', 'workspace-active'),
        ('removed-owner', 'workspace-removed');
      INSERT INTO workspace_members VALUES
        ('workspace-active', 'active-owner', 'active'),
        ('workspace-removed', 'removed-owner', 'removed');
      INSERT INTO documents VALUES
        ('active-document', 'active-owner', NULL, '2026-07-26T00:00:00.000Z'),
        ('removed-document', 'removed-owner', NULL, '2026-07-26T00:00:00.000Z');
      INSERT INTO document_files VALUES
        ('linked-file', 'active-owner', 'active-document', NULL),
        ('standalone-file', 'active-owner', NULL, NULL),
        ('removed-file', 'removed-owner', NULL, NULL);
    `);
    applyMigration(db, phaseTwoEntry);
    assert.equal(
      (
        db.prepare("SELECT workspace_id AS workspaceId FROM documents WHERE id = 'active-document'")
          .get() as { workspaceId: string | null }
      ).workspaceId,
      "workspace-active",
    );
    assert.equal(
      (
        db.prepare("SELECT workspace_id AS workspaceId FROM documents WHERE id = 'removed-document'")
          .get() as { workspaceId: string | null }
      ).workspaceId,
      null,
    );
    const files = db.prepare(`
      SELECT id, workspace_id AS workspaceId
      FROM document_files
      ORDER BY id
    `).all() as Array<{ id: string; workspaceId: string | null }>;
    assert.deepEqual(
      files.map((row) => ({ ...row })),
      [
        { id: "linked-file", workspaceId: "workspace-active" },
        { id: "removed-file", workspaceId: null },
        { id: "standalone-file", workspaceId: "workspace-active" },
      ],
    );
  } finally {
    db.close();
  }
});

test("0012 snapshot and SQL declare workspace and OTP lookup indexes", () => {
  const sql = migrationSql(phaseTwoEntry);
  assert.match(sql, /UPDATE `documents`/);
  assert.match(sql, /UPDATE `document_files`/);
  assert.match(sql, /m\.`status` = 'active'/);
  assert.match(sql, /auth_otp_ip_created_idx/);
  assert.match(sql, /documents_workspace_updated_idx/);
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0012_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    tables: Record<string, { indexes: Record<string, unknown> }>;
  };
  assert.ok(
    snapshot.tables.auth_otp_challenges.indexes.auth_otp_ip_created_idx,
  );
  assert.ok(
    snapshot.tables.documents.indexes.documents_workspace_updated_idx,
  );
});

test("0013 adds device-aware sessions and an append-only security chain", () => {
  const sql = migrationSql(sessionSecurityEntry);
  for (const table of ["auth_devices", "security_events"]) {
    assert.match(sql, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }
  for (const column of [
    "device_id",
    "auth_method",
    "assurance_level",
    "authenticated_at",
    "idle_expires_at",
  ]) {
    assert.match(
      sql,
      new RegExp(`ALTER TABLE \\\`auth_sessions\\\` ADD \\\`${column}\\\``),
    );
  }
  for (const name of [
    "auth_sessions_device_idx",
    "security_events_hash_uidx",
    "security_events_chain_uidx",
    "security_events_no_update",
    "security_events_no_delete",
  ]) {
    assert.match(sql, new RegExp(`\\\`${name}\\\``));
  }
  assert.doesNotMatch(sql, /TOTP_ENCRYPTION|IDENTITY_KEYRING|secret[_-]?key/i);

  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0013_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    tables: Record<string, { indexes: Record<string, unknown> }>;
  };
  assert.ok(snapshot.tables.auth_devices);
  assert.ok(snapshot.tables.security_events);
  assert.ok(
    snapshot.tables.security_events.indexes.security_events_chain_uidx,
  );
});

test("0013 security events reject mutation, deletion, and chain forks", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    const insert = db.prepare(`
      INSERT INTO security_events (
        id,user_id,event_type,severity,previous_hash,event_hash,created_at
      ) VALUES (?,?,?,'info',?,?,?)
    `);
    insert.run(
      "event-1",
      "user-1",
      "session.created",
      "0".repeat(64),
      "1".repeat(64),
      "2026-07-26T12:00:00.000Z",
    );
    assert.throws(
      () => db.prepare(
        "UPDATE security_events SET severity='warning' WHERE id='event-1'",
      ).run(),
      /append-only/,
    );
    assert.throws(
      () => db.prepare(
        "DELETE FROM security_events WHERE id='event-1'",
      ).run(),
      /append-only/,
    );
    assert.throws(
      () => insert.run(
        "event-2",
        "user-1",
        "session.revoked",
        "0".repeat(64),
        "2".repeat(64),
        "2026-07-26T12:01:00.000Z",
      ),
      /UNIQUE constraint failed/,
    );
  } finally {
    db.close();
  }
});

test("0014 adds encrypted MFA state and exact factor-claim constraints", () => {
  const sql = migrationSql(mfaEntry);
  for (const table of [
    "auth_totp_credentials",
    "auth_backup_codes",
    "auth_mfa_challenges",
    "auth_mfa_factor_claims",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }
  assert.match(
    sql,
    /ALTER TABLE `auth_sessions` ADD `mfa_verified_at` text/,
  );
  for (const name of [
    "auth_totp_live_user_uidx",
    "auth_backup_codes_hmac_uidx",
    "auth_mfa_challenges_token_uidx",
    "auth_mfa_challenges_email_otp_uidx",
    "auth_mfa_claims_operation_uidx",
    "auth_mfa_claims_factor_uidx",
  ]) {
    assert.match(sql, new RegExp(`\\\`${name}\\\``));
  }
  assert.doesNotMatch(
    sql,
    /IDENTITY_KEYRING|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|otpauth:\/\//i,
  );

  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0014_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    tables: Record<string, { indexes: Record<string, unknown> }>;
  };
  assert.ok(snapshot.tables.auth_totp_credentials);
  assert.ok(snapshot.tables.auth_backup_codes);
  assert.ok(snapshot.tables.auth_mfa_challenges);
  assert.ok(snapshot.tables.auth_mfa_factor_claims);
  assert.ok(
    snapshot.tables.auth_mfa_factor_claims
      .indexes.auth_mfa_claims_operation_uidx,
  );
});

test("0014 reaches 92 tables and rejects operation or factor replay", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx <= 14)) {
      applyMigration(db, entry);
    }
    assert.equal(tableDefinitions(db).size, 92);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.ok(
      (
        db.prepare("PRAGMA table_info(auth_sessions)").all() as Array<{
          name: string;
        }>
      ).some(({ name }) => name === "mfa_verified_at"),
    );

    const timestamp = "2026-07-26T00:00:00.000Z";
    db.prepare(
      `INSERT INTO user_profiles (id,email,created_at,updated_at)
       VALUES (?,?,?,?)`,
    ).run("mfa-user", "mfa@example.com", timestamp, timestamp);
    db.prepare(
      `INSERT INTO auth_totp_credentials (
         id,user_id,status,secret_ciphertext,secret_iv,key_version,
         enrollment_expires_at,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      "mfa-credential",
      "mfa-user",
      "active",
      "ciphertext",
      "iv",
      "v1",
      "2026-07-27T00:00:00.000Z",
      timestamp,
      timestamp,
    );
    const insert = db.prepare(
      `INSERT INTO auth_mfa_factor_claims (
         id,operation_id,credential_id,factor_type,factor_key,created_at
       ) VALUES (?,?,?,?,?,?)`,
    );
    insert.run(
      "claim-1",
      "operation-1",
      "mfa-credential",
      "totp",
      "100",
      timestamp,
    );
    assert.throws(
      () => insert.run(
        "claim-2",
        "operation-1",
        "mfa-credential",
        "totp",
        "101",
        timestamp,
      ),
      /UNIQUE constraint failed/,
    );
    assert.throws(
      () => insert.run(
        "claim-3",
        "operation-2",
        "mfa-credential",
        "totp",
        "100",
        timestamp,
      ),
      /UNIQUE constraint failed/,
    );
  } finally {
    db.close();
  }
});

test("0015 adds immutable policy evidence and deletion verification state", () => {
  const sql = migrationSql(policyDeletionEntry);
  for (const table of [
    "policy_documents",
    "account_deletion_challenges",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }
  for (const name of [
    "policy_documents_version_uidx",
    "account_deletion_challenges_active_user_uidx",
    "account_deletion_challenges_operation_uidx",
    "account_deletion_requests_active_user_uidx",
    "account_deletion_requests_challenge_uidx",
    "user_acceptances_policy_idx",
    "policy_documents_no_update",
    "policy_documents_no_delete",
    "user_acceptances_policy_guard",
    "user_acceptances_no_update",
    "user_acceptances_no_delete",
    "account_deletion_requests_verification_guard",
  ]) {
    assert.match(sql, new RegExp(`\\\`${name}\\\``));
  }
  for (const column of [
    "policy_document_id",
    "locale",
    "content_sha256",
    "acceptance_method",
    "auth_source",
    "session_id",
    "evidence_json",
  ]) {
    assert.match(
      sql,
      new RegExp(`ALTER TABLE \\\`user_acceptances\\\` ADD \\\`${column}\\\``),
    );
  }
  assert.match(sql, /legacy_unverified/);
  assert.match(sql, /verification_method/);
  assert.match(sql, /verified_at/);
  assert.doesNotMatch(
    sql,
    /RESEND_API_KEY|IDENTITY_KEYRING|BEGIN (?:RSA |EC )?PRIVATE KEY/i,
  );

  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0015_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    tables: Record<string, { indexes: Record<string, unknown> }>;
  };
  assert.ok(snapshot.tables.policy_documents);
  assert.ok(snapshot.tables.account_deletion_challenges);
  assert.ok(
    snapshot.tables.account_deletion_requests
      .indexes.account_deletion_requests_active_user_uidx,
  );
});

test("0015 backfills legacy acceptance without inventing content evidence", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx < 15)) {
      applyMigration(db, entry);
    }
    const now = "2026-07-26T00:00:00.000Z";
    db.prepare(
      `INSERT INTO user_profiles (
         id,email,locale,created_at,updated_at
       ) VALUES (?,?,?,?,?)`,
    ).run("legacy-policy-user", "legacy@example.test", "uz", now, now);
    db.prepare(
      `INSERT INTO user_acceptances (
         id,user_id,document_key,document_version,accepted_at
       ) VALUES (?,?,?,?,?)`,
    ).run(
      "legacy-acceptance",
      "legacy-policy-user",
      "terms",
      "2026-07-24",
      now,
    );

    applyMigration(db, policyDeletionEntry);
    const row = db.prepare(
      `SELECT
         policy_document_id AS policyDocumentId,locale,content_sha256 AS digest,
         acceptance_method AS method,auth_source AS authSource,evidence_json AS evidence
       FROM user_acceptances WHERE id='legacy-acceptance'`,
    ).get() as {
      policyDocumentId: string | null;
      locale: string;
      digest: string | null;
      method: string;
      authSource: string;
      evidence: string;
    };
    assert.deepEqual({ ...row }, {
      policyDocumentId: null,
      locale: "uz",
      digest: null,
      method: "legacy_unverified",
      authSource: "legacy",
      evidence: "{\"migration\":\"0015\",\"evidence\":\"legacy_version_only\"}",
    });
  } finally {
    db.close();
  }
});

test("0015 enforces immutable policies and exact deletion evidence", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    assert.equal(tableDefinitions(db).size, 94);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const now = "2026-07-26T12:00:00.000Z";
    db.prepare(
      `INSERT INTO user_profiles (id,email,created_at,updated_at)
       VALUES (?,?,?,?)`,
    ).run("policy-user", "policy@example.test", now, now);
    db.prepare(
      `INSERT INTO policy_documents (
         id,document_key,document_version,locale,content_sha256,status,created_at
       ) VALUES (?,?,?,?,?,'draft',?)`,
    ).run(
      "policy:terms:test:ru",
      "terms",
      "test",
      "ru",
      "a".repeat(64),
      now,
    );
    db.prepare(
      `INSERT INTO user_acceptances (
         id,user_id,policy_document_id,document_key,document_version,locale,
         content_sha256,acceptance_method,auth_source,accepted_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "acceptance-exact",
      "policy-user",
      "policy:terms:test:ru",
      "terms",
      "test",
      "ru",
      "a".repeat(64),
      "registration_checkbox",
      "email_otp",
      now,
    );
    assert.throws(
      () => db.prepare(
        "UPDATE policy_documents SET status='approved' WHERE id=?",
      ).run("policy:terms:test:ru"),
      /append-only/,
    );
    assert.throws(
      () => db.prepare(
        "DELETE FROM user_acceptances WHERE id='acceptance-exact'",
      ).run(),
      /append-only/,
    );
    assert.throws(
      () => db.prepare(
        `INSERT INTO user_acceptances (
           id,user_id,policy_document_id,document_key,document_version,locale,
           content_sha256,acceptance_method,auth_source,accepted_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        "acceptance-mismatch",
        "policy-user",
        "policy:terms:test:ru",
        "terms",
        "test-incorrect",
        "ru",
        "b".repeat(64),
        "registration_checkbox",
        "email_otp",
        now,
      ),
      /policy evidence mismatch/,
    );
  } finally {
    db.close();
  }
});
