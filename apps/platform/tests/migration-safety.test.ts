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
const identityProtectionEntry = journal.entries.find(({ idx }) => idx === 16);
const invitationEvidenceEntry = journal.entries.find(({ idx }) => idx === 17);
const challengeEvidenceEntry = journal.entries.find(({ idx }) => idx === 18);
const emailChangeEntry = journal.entries.find(({ idx }) => idx === 19);
const platformStaffEntry = journal.entries.find(({ idx }) => idx === 20);
const platformStaffRoleEventEntry = journal.entries.find(
  ({ idx }) => idx === 21,
);

assert.ok(phaseOneEntry, "Drizzle journal must contain migration 0011");
assert.ok(phaseTwoEntry, "Drizzle journal must contain migration 0012");
assert.ok(sessionSecurityEntry, "Drizzle journal must contain migration 0013");
assert.ok(mfaEntry, "Drizzle journal must contain migration 0014");
assert.ok(
  policyDeletionEntry,
  "Drizzle journal must contain migration 0015",
);
assert.ok(
  identityProtectionEntry,
  "Drizzle journal must contain migration 0016",
);
assert.ok(
  invitationEvidenceEntry,
  "Drizzle journal must contain migration 0017",
);
assert.ok(
  challengeEvidenceEntry,
  "Drizzle journal must contain migration 0018",
);
assert.ok(
  emailChangeEntry,
  "Drizzle journal must contain migration 0019",
);
assert.ok(
  platformStaffEntry,
  "Drizzle journal must contain migration 0020",
);
assert.ok(
  platformStaffRoleEventEntry,
  "Drizzle journal must contain migration 0021",
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

test("remote D1 migrations retain LF line endings on every checkout", () => {
  const attributes = readFileSync(
    new URL("../../../.gitattributes", import.meta.url),
    "utf8",
  );

  assert.match(
    attributes,
    /^apps\/platform\/drizzle\/\*\.sql text eol=lf$/m,
  );
  for (const entry of journal.entries) {
    assert.doesNotMatch(
      migrationSql(entry),
      /\r/,
      `${entry.tag}.sql contains CRLF/CR that remote D1 rejects in compound triggers`,
    );
  }
});

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
    for (const entry of journal.entries.filter(({ idx }) => idx <= 15)) {
      applyMigration(db, entry);
    }
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

test("0016 is an additive expand migration with protected lookup indexes", () => {
  const sql = migrationSql(identityProtectionEntry);
  for (const statement of statements(sql)) {
    assert.match(
      statement,
      /^(?:ALTER TABLE|CREATE (?:UNIQUE )?INDEX|CREATE TRIGGER)\b/i,
      `unexpected identity migration statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const column of [
    "email_ciphertext",
    "email_iv",
    "email_key_version",
    "email_lookup_hash",
    "email_lookup_key_version",
    "phone_ciphertext",
    "phone_iv",
    "phone_key_version",
    "phone_lookup_hash",
    "phone_lookup_key_version",
  ]) {
    assert.match(
      sql,
      new RegExp(`ALTER TABLE \\\`user_profiles\\\` ADD \\\`${column}\\\``),
    );
  }
  for (const name of [
    "user_profiles_email_lookup_uidx",
    "user_profiles_phone_lookup_idx",
    "user_profiles_identity_insert_guard",
    "user_profiles_identity_update_guard",
  ]) {
    assert.match(sql, new RegExp(`\\\`${name}\\\``));
  }
  assert.doesNotMatch(
    sql,
    /IDENTITY_KEYRING|BEGIN (?:RSA |EC )?PRIVATE KEY|RESEND_API_KEY/i,
  );

  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0016_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    tables: Record<string, { indexes: Record<string, unknown> }>;
  };
  assert.ok(
    snapshot.tables.user_profiles.indexes.user_profiles_email_lookup_uidx,
  );
  assert.ok(
    snapshot.tables.user_profiles.indexes.user_profiles_phone_lookup_idx,
  );
});

test("0016 preserves raw identities and rejects partial protected state", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx < 16)) {
      applyMigration(db, entry);
    }
    const now = "2026-07-26T12:00:00.000Z";
    db.prepare(
      `INSERT INTO user_profiles (id,email,phone,created_at,updated_at)
       VALUES (?,?,?,?,?)`,
    ).run(
      "identity-sentinel",
      "sentinel@example.test",
      "+998 90 123 45 67",
      now,
      now,
    );
    applyMigration(db, identityProtectionEntry);

    const preserved = db.prepare(
      `SELECT email,phone,email_ciphertext AS emailCiphertext,
        phone_ciphertext AS phoneCiphertext
       FROM user_profiles WHERE id='identity-sentinel'`,
    ).get() as {
      email: string;
      phone: string;
      emailCiphertext: string | null;
      phoneCiphertext: string | null;
    };
    assert.deepEqual({ ...preserved }, {
      email: "sentinel@example.test",
      phone: "+998 90 123 45 67",
      emailCiphertext: null,
      phoneCiphertext: null,
    });
    assert.throws(
      () => db.prepare(
        `UPDATE user_profiles
         SET email_ciphertext='${"a".repeat(22)}'
         WHERE id='identity-sentinel'`,
      ).run(),
      /identity protection fields incomplete/,
    );
    db.prepare(
      `UPDATE user_profiles SET
         email_ciphertext=?,email_iv=?,email_key_version=?,
         email_lookup_hash=?,email_lookup_key_version=?
       WHERE id='identity-sentinel'`,
    ).run(
      "a".repeat(22),
      "b".repeat(16),
      "v1",
      "c".repeat(43),
      "v1",
    );
    assert.throws(
      () => db.prepare(
        `INSERT INTO user_profiles (
           id,email,email_ciphertext,email_iv,email_key_version,
           email_lookup_hash,email_lookup_key_version,created_at,updated_at
         ) VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(
        "identity-duplicate",
        "different@example.test",
        "d".repeat(22),
        "e".repeat(16),
        "v1",
        "c".repeat(43),
        "v1",
        now,
        now,
      ),
      /UNIQUE constraint failed/,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0017 is additive and declares invitation evidence guards", () => {
  const sql = migrationSql(invitationEvidenceEntry);
  for (const statement of statements(sql)) {
    assert.match(
      statement,
      /^(?:ALTER TABLE|CREATE INDEX|CREATE TRIGGER)\b/i,
      `unexpected invitation migration statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const column of [
    "target_identifier_kind",
    "target_identifier_lookup_hash",
    "target_identifier_lookup_key_version",
    "email_ciphertext",
    "email_iv",
    "email_key_version",
    "email_lookup_hash",
    "email_lookup_key_version",
  ]) {
    assert.match(sql, new RegExp(`ADD \\\`${column}\\\``));
  }
  for (const name of [
    "workspace_invitations_email_lookup_idx",
    "document_invitations_target_lookup_idx",
    "workspace_invitations_identity_insert_guard",
    "workspace_invitations_identity_update_guard",
    "document_invitations_identity_insert_guard",
    "document_invitations_identity_update_guard",
  ]) {
    assert.match(sql, new RegExp(`\\\`${name}\\\``));
  }
  assert.doesNotMatch(
    sql,
    /IDENTITY_KEYRING|BEGIN (?:RSA |EC )?PRIVATE KEY|RESEND_API_KEY/i,
  );

  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0017_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    tables: Record<string, { indexes: Record<string, unknown> }>;
  };
  assert.ok(
    snapshot.tables.workspace_invitations
      .indexes.workspace_invitations_email_lookup_idx,
  );
  assert.ok(
    snapshot.tables.document_invitations
      .indexes.document_invitations_target_lookup_idx,
  );
});

test("0017 preserves legacy invitations and rejects partial evidence", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx < 17)) {
      applyMigration(db, entry);
    }
    const now = "2026-07-26T12:00:00.000Z";
    db.prepare(
      `INSERT INTO user_profiles (id,email,created_at,updated_at)
       VALUES (?,?,?,?)`,
    ).run("invitation-owner", "owner@example.test", now, now);
    db.prepare(
      `INSERT INTO workspaces (
         id,type,name,locale,created_at,updated_at
       ) VALUES (?,?,?,?,?,?)`,
    ).run(
      "invitation-workspace",
      "business",
      "Invitation workspace",
      "ru",
      now,
      now,
    );
    db.prepare(
      `INSERT INTO workspace_invitations (
         id,workspace_id,invited_by_user_id,email,email_hash,token_hash,
         role,expires_at,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "legacy-workspace-invitation",
      "invitation-workspace",
      "invitation-owner",
      "invitee@example.test",
      "legacy-email-hash",
      "legacy-workspace-token",
      "viewer",
      "2026-08-02T12:00:00.000Z",
      now,
      now,
    );
    db.prepare(
      `INSERT INTO document_templates (
         id,key,category,active,created_at,updated_at
       ) VALUES (?,?,?,1,?,?)`,
    ).run("invitation-template", "invitation-test", "other", now, now);
    db.prepare(
      `INSERT INTO documents (
         id,workspace_id,owner_user_id,template_id,language,
         participant_mode,title,category,status,revision,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`,
    ).run(
      "invitation-document",
      "invitation-workspace",
      "invitation-owner",
      "invitation-template",
      "ru",
      "single",
      "Invitation document",
      "other",
      "draft",
      now,
      now,
    );
    db.prepare(
      `INSERT INTO document_invitations (
         id,document_id,invited_by_user_id,target_identifier_hash,role,
         token_hash,expires_at,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      "legacy-document-invitation",
      "invitation-document",
      "invitation-owner",
      "legacy-target-hash",
      "viewer",
      "legacy-document-token",
      "2026-08-02T12:00:00.000Z",
      now,
      now,
    );

    applyMigration(db, invitationEvidenceEntry);
    const workspace = db.prepare(
      `SELECT email,email_hash AS emailHash,
        email_ciphertext AS emailCiphertext
       FROM workspace_invitations
       WHERE id='legacy-workspace-invitation'`,
    ).get() as {
      email: string;
      emailHash: string;
      emailCiphertext: string | null;
    };
    assert.deepEqual({ ...workspace }, {
      email: "invitee@example.test",
      emailHash: "legacy-email-hash",
      emailCiphertext: null,
    });
    const document = db.prepare(
      `SELECT target_identifier_hash AS targetIdentifierHash,
        target_identifier_kind AS targetIdentifierKind
       FROM document_invitations
       WHERE id='legacy-document-invitation'`,
    ).get() as {
      targetIdentifierHash: string;
      targetIdentifierKind: string | null;
    };
    assert.deepEqual({ ...document }, {
      targetIdentifierHash: "legacy-target-hash",
      targetIdentifierKind: null,
    });

    assert.throws(
      () => db.prepare(
        `UPDATE workspace_invitations
         SET email_ciphertext=?
         WHERE id='legacy-workspace-invitation'`,
      ).run("a".repeat(22)),
      /workspace invitation identity protection fields incomplete/,
    );
    db.prepare(
      `UPDATE workspace_invitations SET
         email_ciphertext=?,email_iv=?,email_key_version=?,
         email_lookup_hash=?,email_lookup_key_version=?
       WHERE id='legacy-workspace-invitation'`,
    ).run(
      "a".repeat(22),
      "b".repeat(16),
      "v1",
      "c".repeat(43),
      "v1",
    );
    assert.throws(
      () => db.prepare(
        `UPDATE document_invitations
         SET target_identifier_kind='email'
         WHERE id='legacy-document-invitation'`,
      ).run(),
      /document invitation identity protection fields incomplete/,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE document_invitations SET
           target_identifier_kind='username',
           target_identifier_lookup_hash=?,
           target_identifier_lookup_key_version='v1'
         WHERE id='legacy-document-invitation'`,
      ).run("d".repeat(43)),
      /document invitation identity protection fields incomplete/,
    );
    db.prepare(
      `UPDATE document_invitations SET
         target_identifier_kind='email',
         target_identifier_lookup_hash=?,
         target_identifier_lookup_key_version='v1'
       WHERE id='legacy-document-invitation'`,
    ).run("d".repeat(43));
    assert.equal(tableDefinitions(db).size, 94);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0018 adds only keyed challenge evidence columns, indexes, and guards", () => {
  const sql = migrationSql(challengeEvidenceEntry);
  for (const statement of statements(sql)) {
    assert.match(
      statement,
      /^(?:ALTER TABLE|CREATE INDEX|CREATE TRIGGER)\b/i,
      `unexpected non-additive statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const column of [
    "email_lookup_hash",
    "email_lookup_key_version",
    "code_hmac",
    "code_key_version",
    "request_ip_lookup_hash",
    "request_ip_lookup_key_version",
  ]) {
    assert.match(sql, new RegExp(`ADD \\\`${column}\\\``));
  }
  for (const name of [
    "auth_otp_email_lookup_idx",
    "auth_otp_ip_lookup_created_idx",
    "auth_otp_challenge_evidence_insert_guard",
    "auth_otp_challenge_evidence_update_guard",
    "account_deletion_challenge_evidence_insert_guard",
    "account_deletion_challenge_evidence_update_guard",
  ]) {
    assert.match(sql, new RegExp(`\\\`${name}\\\``));
  }
  assert.doesNotMatch(
    sql,
    /IDENTITY_KEYRING|RESEND_API_KEY|BEGIN (?:RSA |EC )?PRIVATE KEY/i,
  );

  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0018_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    tables: Record<string, {
      columns: Record<string, unknown>;
      indexes: Record<string, unknown>;
    }>;
  };
  assert.ok(
    snapshot.tables.auth_otp_challenges.columns.email_lookup_hash,
  );
  assert.ok(snapshot.tables.auth_otp_challenges.columns.code_hmac);
  assert.ok(
    snapshot.tables.auth_otp_challenges
      .columns.request_ip_lookup_hash,
  );
  assert.ok(
    snapshot.tables.auth_otp_challenges
      .indexes.auth_otp_email_lookup_idx,
  );
  assert.ok(
    snapshot.tables.auth_otp_challenges
      .indexes.auth_otp_ip_lookup_created_idx,
  );
  assert.ok(
    snapshot.tables.account_deletion_challenges
      .columns.email_lookup_hash,
  );
  assert.ok(
    snapshot.tables.account_deletion_challenges.columns.code_hmac,
  );
});

test("0018 preserves legacy challenges and rejects partial keyed groups", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE auth_otp_challenges (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
      CREATE TABLE account_deletion_challenges (
        id TEXT PRIMARY KEY
      );
    `);
    applyMigration(db, challengeEvidenceEntry);
    db.prepare(
      "INSERT INTO auth_otp_challenges (id,created_at) VALUES (?,?)",
    ).run("legacy-otp", "2026-07-26T12:00:00.000Z");
    db.prepare(
      "INSERT INTO account_deletion_challenges (id) VALUES (?)",
    ).run("legacy-deletion");

    assert.throws(
      () => db.prepare(
        `UPDATE auth_otp_challenges
         SET email_lookup_hash=? WHERE id='legacy-otp'`,
      ).run("a".repeat(43)),
      /auth OTP challenge evidence incomplete/,
    );
    db.prepare(
      `UPDATE auth_otp_challenges SET
         email_lookup_hash=?,email_lookup_key_version='v1',
         code_hmac=?,code_key_version='v1'
       WHERE id='legacy-otp'`,
    ).run("a".repeat(43), "b".repeat(43));
    assert.throws(
      () => db.prepare(
        `UPDATE auth_otp_challenges
         SET request_ip_lookup_hash=? WHERE id='legacy-otp'`,
      ).run("c".repeat(43)),
      /auth OTP challenge evidence incomplete/,
    );
    db.prepare(
      `UPDATE auth_otp_challenges SET
         request_ip_lookup_hash=?,
         request_ip_lookup_key_version='v1'
       WHERE id='legacy-otp'`,
    ).run("c".repeat(43));

    assert.throws(
      () => db.prepare(
        `UPDATE account_deletion_challenges
         SET code_hmac=? WHERE id='legacy-deletion'`,
      ).run("d".repeat(43)),
      /account deletion challenge evidence incomplete/,
    );
    db.prepare(
      `UPDATE account_deletion_challenges SET
         email_lookup_hash=?,email_lookup_key_version='v1',
         code_hmac=?,code_key_version='v1'
       WHERE id='legacy-deletion'`,
    ).run("e".repeat(43), "f".repeat(43));
  } finally {
    db.close();
  }
});

test("0019 adds an additive, state-gated dual-email challenge table", () => {
  const sql = migrationSql(emailChangeEntry);
  for (const statement of statements(sql)) {
    assert.match(
      statement,
      /^CREATE (?:TABLE|INDEX|UNIQUE INDEX|TRIGGER)\b/i,
      `unexpected email-change migration statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const name of [
    "email_change_challenges",
    "email_change_challenges_operation_uidx",
    "email_change_challenges_active_user_uidx",
    "email_change_challenges_new_email_lookup_idx",
    "email_change_challenge_evidence_insert_guard",
    "email_change_challenge_evidence_update_guard",
    "email_change_challenge_state_insert_guard",
    "email_change_challenge_state_update_guard",
    "email_change_challenge_attempt_update_guard",
  ]) {
    assert.match(sql, new RegExp(`\\\`${name}\\\``));
  }
  for (const column of [
    "current_email_hash",
    "current_email_lookup_hash",
    "new_email_ciphertext",
    "new_email_lookup_hash",
    "current_code_hmac",
    "new_code_hmac",
    "codes_queued_at",
    "consumed_by_operation_id",
  ]) {
    assert.match(sql, new RegExp(`\\\`${column}\\\``));
  }
  assert.doesNotMatch(
    sql,
    /IDENTITY_KEYRING|RESEND_API_KEY|BEGIN (?:RSA |EC )?PRIVATE KEY/i,
  );

  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0019_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    tables: Record<string, {
      columns: Record<string, unknown>;
      indexes: Record<string, unknown>;
    }>;
  };
  assert.ok(snapshot.tables.email_change_challenges);
  assert.ok(
    snapshot.tables.email_change_challenges
      .columns.current_email_lookup_hash,
  );
  assert.ok(
    snapshot.tables.email_change_challenges.columns.new_email_ciphertext,
  );
  assert.ok(
    snapshot.tables.email_change_challenges
      .indexes.email_change_challenges_active_user_uidx,
  );
  assert.ok(
    snapshot.tables.email_change_challenges
      .indexes.email_change_challenges_new_email_lookup_idx,
  );
});

test("0019 accepts rollback-safe legacy rows and rejects partial or impossible states", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx <= 19)) {
      applyMigration(db, entry);
    }
    const now = "2026-07-26T12:00:00.000Z";
    db.prepare(
      `INSERT INTO user_profiles (id,email,created_at,updated_at)
       VALUES (?,?,?,?)`,
    ).run("email-change-migration-user", "old@example.test", now, now);
    db.prepare(
      `INSERT INTO email_change_challenges (
         id,user_id,current_email_hash,new_email,
         current_code_salt,current_code_hash,new_code_salt,new_code_hash,
         locale,expires_at,created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "email-change-legacy",
      "email-change-migration-user",
      "current-email-hash",
      "new@example.test",
      "current-salt",
      "current-code-hash",
      "new-salt",
      "new-code-hash",
      "ru",
      "2026-07-26T12:10:00.000Z",
      now,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE email_change_challenges
         SET current_code_hmac=? WHERE id=?`,
      ).run("a".repeat(43), "email-change-legacy"),
      /email change challenge evidence incomplete/,
    );
    db.prepare(
      `UPDATE email_change_challenges
       SET codes_queued_at=? WHERE id=?`,
    ).run(
      "2026-07-26T12:00:01.000Z",
      "email-change-legacy",
    );
    assert.throws(
      () => db.prepare(
        `UPDATE email_change_challenges
         SET codes_queued_at=NULL WHERE id=?`,
      ).run("email-change-legacy"),
      /email change challenge state invalid/,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE email_change_challenges
         SET attempt_count=6 WHERE id=?`,
      ).run("email-change-legacy"),
      /email change challenge attempt state invalid/,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE email_change_challenges
         SET consumed_at=? WHERE id=?`,
      ).run(
        "2026-07-26T12:01:00.000Z",
        "email-change-legacy",
      ),
      /email change challenge state invalid/,
    );
    db.prepare(
      `UPDATE email_change_challenges
       SET consumed_at=?,consumed_by_operation_id=?
       WHERE id=?`,
    ).run(
      "2026-07-26T12:01:00.000Z",
      "email-change-operation",
      "email-change-legacy",
    );
    assert.throws(
      () => db.prepare(
        `UPDATE email_change_challenges
         SET consumed_at=?,consumed_by_operation_id=?
         WHERE id=?`,
      ).run(
        "2026-07-26T12:01:01.000Z",
        "email-change-operation-rewritten",
        "email-change-legacy",
      ),
      /email change challenge state invalid/,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE email_change_challenges
         SET invalidated_at=? WHERE id=?`,
      ).run(
        "2026-07-26T12:01:01.000Z",
        "email-change-legacy",
      ),
      /email change challenge state invalid/,
    );
    assert.equal(tableDefinitions(db).size, 95);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0020 adds only a separate, expiring platform staff assignment boundary", () => {
  const sql = migrationSql(platformStaffEntry);
  for (const statement of statements(sql)) {
    assert.match(
      statement,
      /^CREATE (?:TABLE|INDEX|UNIQUE INDEX|TRIGGER)\b/i,
      `unexpected platform-staff migration statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const name of [
    "platform_staff_assignments",
    "platform_staff_assignments_active_uidx",
    "platform_staff_assignments_user_idx",
    "platform_staff_assignments_role_idx",
    "platform_staff_assignments_revoke_only",
    "platform_staff_assignments_no_delete",
  ]) {
    assert.match(sql, new RegExp(`\\\`${name}\\\``));
  }
  assert.match(
    sql,
    /'administrator','support','legal_reviewer'/,
  );
  assert.doesNotMatch(
    sql,
    /workspace_members|account_type|IDENTITY_KEYRING|RESEND_API_KEY/i,
  );

  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0020_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    tables: Record<string, {
      indexes: Record<string, { where?: string }>;
      foreignKeys: Record<string, { onDelete: string }>;
      checkConstraints: Record<string, unknown>;
    }>;
  };
  const table = snapshot.tables.platform_staff_assignments;
  assert.ok(table);
  assert.match(
    table.indexes.platform_staff_assignments_active_uidx.where ?? "",
    /revoked_at.*IS NULL/,
  );
  assert.ok(table.checkConstraints.platform_staff_assignments_role_check);
  assert.ok(
    table.checkConstraints.platform_staff_assignments_revocation_check,
  );
  for (const foreignKey of Object.values(table.foreignKeys)) {
    assert.equal(foreignKey.onDelete, "no action");
  }
});

test("0020 rejects role confusion, self-grant, mutation, reactivation, and deletion", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx <= 20)) {
      applyMigration(db, entry);
    }
    const createdAt = "2026-07-26T12:00:00.000Z";
    const expiresAt = "2026-08-26T12:00:00.000Z";
    db.prepare(
      `INSERT INTO user_profiles (id,email,created_at,updated_at)
       VALUES (?,?,?,?),(?,?,?,?)`,
    ).run(
      "staff-subject",
      "staff-subject@example.test",
      createdAt,
      createdAt,
      "staff-grantor",
      "staff-grantor@example.test",
      createdAt,
      createdAt,
    );
    const insertSql = `
      INSERT INTO platform_staff_assignments (
        id,user_id,role,grant_source,granted_by_user_id,grant_reason,
        granted_at,expires_at,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `;
    db.prepare(insertSql).run(
      "staff-bootstrap",
      "staff-subject",
      "administrator",
      "operator_bootstrap",
      null,
      "Approved bootstrap",
      createdAt,
      expiresAt,
      createdAt,
      createdAt,
    );
    assert.throws(
      () => db.prepare(insertSql).run(
        "workspace-admin-confusion",
        "staff-subject",
        "admin",
        "operator_bootstrap",
        null,
        "Workspace admin is not platform staff",
        createdAt,
        expiresAt,
        createdAt,
        createdAt,
      ),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => db.prepare(insertSql).run(
        "staff-self-grant",
        "staff-subject",
        "support",
        "administrator",
        "staff-subject",
        "Self grant must fail",
        createdAt,
        expiresAt,
        createdAt,
        createdAt,
      ),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => db.prepare(insertSql).run(
        "staff-duplicate",
        "staff-subject",
        "administrator",
        "administrator",
        "staff-grantor",
        "Duplicate active role",
        createdAt,
        expiresAt,
        createdAt,
        createdAt,
      ),
      /UNIQUE constraint failed/,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE platform_staff_assignments
         SET role='support',updated_at=?
         WHERE id='staff-bootstrap'`,
      ).run("2026-07-26T12:01:00.000Z"),
      /immutable except revocation/,
    );
    db.prepare(
      `UPDATE platform_staff_assignments SET
         revoked_at=?,revocation_source='operator',
         revocation_reason='Operator deprovisioned role',updated_at=?
       WHERE id='staff-bootstrap'`,
    ).run(
      "2026-07-26T12:02:00.000Z",
      "2026-07-26T12:02:00.000Z",
    );
    assert.throws(
      () => db.prepare(
        `UPDATE platform_staff_assignments SET
           revoked_at=NULL,revocation_source=NULL,revocation_reason=NULL,
           updated_at=?
         WHERE id='staff-bootstrap'`,
      ).run("2026-07-26T12:03:00.000Z"),
      /immutable except revocation/,
    );
    assert.throws(
      () => db.prepare(
        "DELETE FROM platform_staff_assignments WHERE id='staff-bootstrap'",
      ).run(),
      /cannot be deleted/,
    );
    db.prepare(insertSql).run(
      "staff-renewed",
      "staff-subject",
      "administrator",
      "administrator",
      "staff-grantor",
      "Approved renewal after explicit revocation",
      "2026-07-26T12:03:00.000Z",
      expiresAt,
      "2026-07-26T12:03:00.000Z",
      "2026-07-26T12:03:00.000Z",
    );
    assert.throws(
      () => db.prepare(
        "DELETE FROM user_profiles WHERE id='staff-subject'",
      ).run(),
      /FOREIGN KEY constraint failed/,
    );
    assert.equal(tableDefinitions(db).size, 96);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0021 adds only an append-only, MFA-bound staff role event ledger", () => {
  const sql = migrationSql(platformStaffRoleEventEntry);
  for (const statement of statements(sql)) {
    assert.match(
      statement,
      /^CREATE (?:TABLE|INDEX|UNIQUE INDEX|TRIGGER)\b/i,
      `unexpected staff-role-event statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const name of [
    "platform_staff_role_events",
    "platform_staff_role_events_hash_uidx",
    "platform_staff_role_events_chain_uidx",
    "platform_staff_role_events_assignment_type_uidx",
    "platform_staff_role_events_actor_idx",
    "platform_staff_role_events_subject_idx",
    "platform_staff_role_events_chain_guard",
    "platform_staff_role_events_consistency",
    "platform_staff_role_events_no_update",
    "platform_staff_role_events_no_delete",
  ]) {
    assert.match(sql, new RegExp(`\\\`${name}\\\``));
  }
  assert.match(sql, /'staff\.role\.granted','staff\.role\.revoked'/);
  assert.match(sql, /'staff\.roles\.manage'/);
  assert.match(sql, /unixepoch\(NEW\.created_at\).*BETWEEN 0 AND 300/s);
  assert.match(sql, /actor\.role = 'administrator'/);
  assert.match(sql, /t\.status = 'active'/);
  assert.match(sql, /chain predecessor mismatch/);
  assert.doesNotMatch(
    sql,
    /workspace_members|account_type|IDENTITY_KEYRING|RESEND_API_KEY/i,
  );

  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0021_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    tables: Record<string, {
      indexes: Record<string, { isUnique: boolean }>;
      foreignKeys: Record<string, { onDelete: string }>;
      checkConstraints: Record<string, unknown>;
    }>;
  };
  const table = snapshot.tables.platform_staff_role_events;
  assert.ok(table);
  assert.equal(Object.keys(table.indexes).length, 5);
  assert.equal(Object.keys(table.foreignKeys).length, 4);
  assert.equal(Object.keys(table.checkConstraints).length, 6);
  assert.equal(
    table.indexes.platform_staff_role_events_chain_uidx.isUnique,
    true,
  );
  assert.equal(
    table.indexes.platform_staff_role_events_assignment_type_uidx.isUnique,
    true,
  );
  for (const foreignKey of Object.values(table.foreignKeys)) {
    assert.equal(foreignKey.onDelete, "no action");
  }
});

test("0021 rejects mismatched role-event evidence and makes accepted events immutable", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    const actorMfaAt = "2026-07-26T12:28:00.000Z";
    const createdAt = "2026-07-26T12:30:00.000Z";
    const expiresAt = "2026-07-27T12:30:00.000Z";
    db.prepare(
      `INSERT INTO user_profiles (id,email,created_at,updated_at)
       VALUES (?,?,?,?),(?,?,?,?)`,
    ).run(
      "role-actor",
      "role-actor@example.test",
      actorMfaAt,
      actorMfaAt,
      "role-subject",
      "role-subject@example.test",
      actorMfaAt,
      actorMfaAt,
    );
    db.prepare(
      `INSERT INTO auth_totp_credentials (
         id,user_id,status,secret_ciphertext,secret_iv,key_version,
         enrollment_expires_at,created_at,updated_at,verified_at
       ) VALUES (
         'role-actor-totp','role-actor','active','ciphertext',
         'abcdefghijklmnop','v1',?,?,?,?
       )`,
    ).run(expiresAt, actorMfaAt, actorMfaAt, actorMfaAt);
    db.prepare(
      `INSERT INTO auth_devices (
         id,user_id,display_name,first_seen_at,last_seen_at
       ) VALUES (
         'role-actor-device','role-actor','Role actor device',?,?
       )`,
    ).run(actorMfaAt, actorMfaAt);
    db.prepare(
      `INSERT INTO auth_sessions (
         id,user_id,device_id,token_hash,auth_method,assurance_level,
         authenticated_at,mfa_verified_at,expires_at,idle_expires_at,
         created_at,last_seen_at
       ) VALUES (
         'role-actor-session','role-actor','role-actor-device',
         'role-actor-token','email_otp+totp','mfa',?,?,?,?,?,?
       )`,
    ).run(
      actorMfaAt,
      actorMfaAt,
      expiresAt,
      expiresAt,
      actorMfaAt,
      actorMfaAt,
    );
    const assignmentInsert = db.prepare(
      `INSERT INTO platform_staff_assignments (
         id,user_id,role,grant_source,granted_by_user_id,grant_reason,
         granted_at,expires_at,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );
    assignmentInsert.run(
      "role-actor-assignment",
      "role-actor",
      "administrator",
      "operator_bootstrap",
      null,
      "Approved operator bootstrap",
      actorMfaAt,
      expiresAt,
      actorMfaAt,
      actorMfaAt,
    );
    assignmentInsert.run(
      "role-subject-assignment",
      "role-subject",
      "support",
      "administrator",
      "role-actor",
      "Approved support duty",
      createdAt,
      expiresAt,
      createdAt,
      createdAt,
    );
    const eventInsert = db.prepare(
      `INSERT INTO platform_staff_role_events (
         id,actor_user_id,actor_session_id,actor_assignment_id,
         subject_user_id,subject_assignment_id,event_type,capability,role,
         reason,actor_mfa_verified_at,previous_hash,event_hash,created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    assert.throws(
      () => eventInsert.run(
        "role-event-mismatch",
        "role-actor",
        "role-actor-session",
        "role-actor-assignment",
        "role-subject",
        "role-subject-assignment",
        "staff.role.granted",
        "staff.roles.manage",
        "support",
        "Mismatched reason",
        actorMfaAt,
        "0".repeat(64),
        "1".repeat(64),
        createdAt,
      ),
      /platform staff role event evidence mismatch/,
    );
    assert.throws(
      () => eventInsert.run(
        "role-event-orphan",
        "role-actor",
        "role-actor-session",
        "role-actor-assignment",
        "role-subject",
        "role-subject-assignment",
        "staff.role.granted",
        "staff.roles.manage",
        "support",
        "Approved support duty",
        actorMfaAt,
        "9".repeat(64),
        "1".repeat(64),
        createdAt,
      ),
      /platform staff role event chain predecessor mismatch/,
    );
    eventInsert.run(
      "role-event-grant",
      "role-actor",
      "role-actor-session",
      "role-actor-assignment",
      "role-subject",
      "role-subject-assignment",
      "staff.role.granted",
      "staff.roles.manage",
      "support",
      "Approved support duty",
      actorMfaAt,
      "0".repeat(64),
      "2".repeat(64),
      createdAt,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE platform_staff_role_events
         SET reason='Rewritten evidence' WHERE id='role-event-grant'`,
      ).run(),
      /append-only/,
    );
    assert.throws(
      () => db.prepare(
        "DELETE FROM platform_staff_role_events WHERE id='role-event-grant'",
      ).run(),
      /append-only/,
    );
    assert.equal(tableDefinitions(db).size, 97);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
