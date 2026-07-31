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
const workspaceInvitationClaimEntry = journal.entries.find(
  ({ idx }) => idx === 22,
);
const otpVerificationLockEntry = journal.entries.find(
  ({ idx }) => idx === 23,
);
const onboardingProfileEntry = journal.entries.find(
  ({ idx }) => idx === 24,
);
const legalSourceLifecycleEntry = journal.entries.find(
  ({ idx }) => idx === 25,
);
const legalSourceFetchEntry = journal.entries.find(
  ({ idx }) => idx === 26,
);
const legalSourceReviewEvidenceEntry = journal.entries.find(
  ({ idx }) => idx === 27,
);
const legalSourcePublicationEntry = journal.entries.find(
  ({ idx }) => idx === 28,
);
const sessionTokenRotationEntry = journal.entries.find(
  ({ idx }) => idx === 29,
);
const securityEmailJobEntry = journal.entries.find(({ idx }) => idx === 30);
const deviceContinuityEntry = journal.entries.find(({ idx }) => idx === 31);
const securityNotificationEntry = journal.entries.find(({ idx }) => idx === 32);
const accountDeletionLifecycleEntry = journal.entries.find(({ idx }) => idx === 33);
const businessWorkspaceIdentityEntry = journal.entries.find(({ idx }) => idx === 34);
const legalSourcePublicationLifecycleEntry = journal.entries.find(
  ({ idx }) => idx === 35,
);
const legalSourceCurrentUrlGuardEntry = journal.entries.find(
  ({ idx }) => idx === 36,
);

const legalSourceAdviceUrlGuardEntry = journal.entries.find(
  ({ idx }) => idx === 38,
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
assert.ok(
  workspaceInvitationClaimEntry,
  "Drizzle journal must contain migration 0022",
);
assert.ok(
  otpVerificationLockEntry,
  "Drizzle journal must contain migration 0023",
);
assert.ok(
  legalSourceLifecycleEntry,
  "Drizzle journal must contain migration 0025",
);
assert.ok(
  legalSourceFetchEntry,
  "Drizzle journal must contain migration 0026",
);
assert.ok(
  legalSourceReviewEvidenceEntry,
  "Drizzle journal must contain migration 0027",
);
assert.ok(
  legalSourcePublicationEntry,
  "Drizzle journal must contain migration 0028",
);
assert.ok(
  sessionTokenRotationEntry,
  "Drizzle journal must contain migration 0029",
);
assert.ok(
  securityEmailJobEntry,
  "Drizzle journal must contain migration 0030",
);
assert.ok(
  deviceContinuityEntry,
  "Drizzle journal must contain migration 0031",
);
assert.ok(
  securityNotificationEntry,
  "Drizzle journal must contain migration 0032",
);assert.ok(
  accountDeletionLifecycleEntry,
  "Drizzle journal must contain migration 0033",
);
assert.ok(
  businessWorkspaceIdentityEntry,
  "Drizzle journal must contain migration 0034",
);
assert.ok(
  legalSourcePublicationLifecycleEntry,
  "Drizzle journal must contain migration 0035",
);
assert.ok(
  legalSourceCurrentUrlGuardEntry,
  "Drizzle journal must contain migration 0036",
);
assert.ok(
  onboardingProfileEntry,
  "Drizzle journal must contain migration 0024",
);
assert.ok(
  legalSourceAdviceUrlGuardEntry,
  "Drizzle journal must contain migration 0038",
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

function foreignKeyCount(db: DatabaseSync): number {
  let count = 0;
  for (const table of tableDefinitions(db).keys()) {
    const escaped = table.replaceAll('"', '""');
    count += db.prepare(`PRAGMA foreign_key_list("${escaped}")`).all().length;
  }
  return count;
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

test("remote D1 trigger guards avoid SELECT CASE raise syntax", () => {
  for (const entry of journal.entries.filter(({ idx }) => idx >= 25)) {
    const sql = migrationSql(entry);
    assert.doesNotMatch(
      sql,
      /SELECT\s+CASE\b[\s\S]*?\bTHEN\s+RAISE\s*\(/i,
      `${entry.tag}.sql uses trigger syntax rejected by remote D1 migration parsing`,
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
    for (const entry of journal.entries.filter(({ idx }) => idx <= 21)) {
      applyMigration(db, entry);
    }
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

test("0022 adds a single-winner workspace invitation claim with sequential metadata", () => {
  const sql = migrationSql(workspaceInvitationClaimEntry);
  for (const statement of statements(sql)) {
    assert.match(
      statement,
      /^(?:ALTER TABLE|CREATE (?:UNIQUE INDEX|TRIGGER))\b/i,
      `unexpected workspace invitation claim statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const name of [
    "acceptance_claim_id",
    "workspace_invitations_acceptance_claim_uidx",
    "workspace_invitations_acceptance_insert_guard",
    "workspace_invitations_acceptance_update_guard",
    "workspace_invitations_acceptance_immutable_guard",
  ]) {
    assert.match(sql, new RegExp(`\`${name}\``));
  }
  assert.doesNotMatch(sql, /account_type|DROP TABLE|DELETE FROM/i);

  const previous = JSON.parse(
    readFileSync(
      new URL("meta/0021_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0022_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    id: string;
    prevId: string;
    tables: Record<string, {
      columns: Record<string, unknown>;
      indexes: Record<string, { isUnique: boolean }>;
    }>;
  };
  assert.equal(workspaceInvitationClaimEntry.idx, 22);
  assert.equal(
    workspaceInvitationClaimEntry.tag,
    "0022_workspace_invitation_claim",
  );
  assert.equal(snapshot.prevId, previous.id);
  assert.ok(
    snapshot.tables.workspace_invitations.columns.acceptance_claim_id,
  );
  assert.equal(
    snapshot.tables.workspace_invitations.indexes
      .workspace_invitations_acceptance_claim_uidx.isUnique,
    true,
  );
  assert.equal(
    Object.hasOwn(
      snapshot.tables.auth_otp_challenges.columns,
      "verification_locked_until",
    ),
    false,
  );
});

test("0022 permits exactly one guarded acceptance claim and makes it immutable", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx <= 22)) {
      applyMigration(db, entry);
    }
    const createdAt = "2026-07-28T12:00:00.000Z";
    db.prepare(
      `INSERT INTO user_profiles (id,email,created_at,updated_at)
       VALUES (?,?,?,?),(?,?,?,?)`,
    ).run(
      "invitation-owner",
      "invitation-owner@example.test",
      createdAt,
      createdAt,
      "invitation-recipient",
      "invitation-recipient@example.test",
      createdAt,
      createdAt,
    );
    db.prepare(
      `INSERT INTO workspaces
       (id,type,name,locale,created_at,updated_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(
      "invitation-workspace",
      "business",
      "Invitation workspace",
      "ru",
      createdAt,
      createdAt,
    );
    const insertInvitation = db.prepare(
      `INSERT INTO workspace_invitations (
         id,workspace_id,invited_by_user_id,email_hash,token_hash,role,
         expires_at,accepted_at,acceptance_claim_id,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    );
    insertInvitation.run(
      "invitation-claim-one",
      "invitation-workspace",
      "invitation-owner",
      "recipient-email-hash",
      "recipient-token-hash",
      "viewer",
      "2026-08-04T12:00:00.000Z",
      null,
      null,
      createdAt,
      createdAt,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE workspace_invitations
         SET accepted_at=? WHERE id='invitation-claim-one'`,
      ).run(createdAt),
      /acceptance evidence incomplete/,
    );

    const claim = db.prepare(
      `UPDATE workspace_invitations
       SET accepted_at=?,acceptance_claim_id=?,updated_at=?
       WHERE id=? AND accepted_at IS NULL AND acceptance_claim_id IS NULL
       RETURNING id`,
    );
    assert.equal(
      claim.all(
        createdAt,
        "acceptance-claim-one",
        createdAt,
        "invitation-claim-one",
      ).length,
      1,
    );
    assert.equal(
      claim.all(
        createdAt,
        "acceptance-claim-two",
        createdAt,
        "invitation-claim-one",
      ).length,
      0,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE workspace_invitations
         SET accepted_at=?,acceptance_claim_id=?
         WHERE id='invitation-claim-one'`,
      ).run(
        "2026-07-28T12:01:00.000Z",
        "acceptance-claim-rewritten",
      ),
      /acceptance is immutable/,
    );
    assert.throws(
      () => insertInvitation.run(
        "invitation-claim-two",
        "invitation-workspace",
        "invitation-owner",
        "other-email-hash",
        "other-token-hash",
        "viewer",
        "2026-08-04T12:00:00.000Z",
        createdAt,
        "acceptance-claim-one",
        createdAt,
        createdAt,
      ),
      /UNIQUE constraint failed/,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0023 adds OTP verification lock evidence after the invitation claim snapshot", () => {
  const sql = migrationSql(otpVerificationLockEntry);
  for (const statement of statements(sql)) {
    assert.match(
      statement,
      /^(?:ALTER TABLE|CREATE (?:INDEX|TRIGGER))\b/i,
      `unexpected OTP verification lock statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const name of [
    "verification_locked_until",
    "auth_otp_email_verification_lock_idx",
    "auth_otp_keyed_email_verification_lock_idx",
    "auth_otp_verification_lock_insert_guard",
    "auth_otp_verification_lock_update_guard",
    "auth_otp_verification_lock_immutable_guard",
  ]) {
    assert.match(sql, new RegExp(`\`${name}\``));
  }

  const previous = JSON.parse(
    readFileSync(
      new URL("meta/0022_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0023_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    id: string;
    prevId: string;
    tables: Record<string, {
      columns: Record<string, unknown>;
      indexes: Record<string, { isUnique: boolean }>;
      foreignKeys: Record<string, unknown>;
    }>;
  };
  assert.equal(otpVerificationLockEntry.idx, 23);
  assert.equal(
    otpVerificationLockEntry.tag,
    "0023_otp_verification_lock",
  );
  assert.equal(snapshot.prevId, previous.id);
  assert.ok(
    snapshot.tables.workspace_invitations.columns.acceptance_claim_id,
  );
  assert.ok(
    snapshot.tables.auth_otp_challenges.columns.verification_locked_until,
  );
  assert.equal(
    snapshot.tables.auth_otp_challenges.indexes
      .auth_otp_email_verification_lock_idx.isUnique,
    false,
  );
  assert.equal(
    snapshot.tables.auth_otp_challenges.indexes
      .auth_otp_keyed_email_verification_lock_idx.isUnique,
    false,
  );
  assert.equal(Object.keys(snapshot.tables).length, 71);
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    127,
  );
});

test("0023 requires exhausted attempts and keeps a verification lock immutable", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx <= 23)) {
      applyMigration(db, entry);
    }
    const createdAt = "2026-07-28T12:00:00.000Z";
    const expiresAt = "2026-07-28T12:10:00.000Z";
    const lockedUntil = "2026-07-28T12:15:00.000Z";
    const insertChallenge = db.prepare(
      `INSERT INTO auth_otp_challenges (
         id,email,email_hash,purpose,locale,account_type,code_salt,code_hash,
         attempt_count,max_attempts,expires_at,verification_locked_until,
         created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    assert.throws(
      () => insertChallenge.run(
        "otp-lock-incomplete",
        "locked@example.test",
        "locked-email-hash",
        "login",
        "ru",
        "individual",
        "salt",
        "code-hash",
        4,
        5,
        expiresAt,
        lockedUntil,
        createdAt,
      ),
      /lock requires exhausted attempts/,
    );
    insertChallenge.run(
      "otp-lock-complete",
      "locked@example.test",
      "locked-email-hash",
      "login",
      "ru",
      "individual",
      "salt",
      "code-hash",
      5,
      5,
      expiresAt,
      lockedUntil,
      createdAt,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE auth_otp_challenges
         SET attempt_count=4 WHERE id='otp-lock-complete'`,
      ).run(),
      /lock requires exhausted attempts/,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE auth_otp_challenges
         SET verification_locked_until=? WHERE id='otp-lock-complete'`,
      ).run("2026-07-28T12:20:00.000Z"),
      /verification lock is immutable/,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE auth_otp_challenges
         SET verification_locked_until=NULL WHERE id='otp-lock-complete'`,
      ).run(),
      /verification lock is immutable/,
    );
    assert.equal(tableDefinitions(db).size, 97);
    assert.equal(foreignKeyCount(db), 129);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0024 adds only nullable names and unverified phone evidence", () => {
  const sql = migrationSql(onboardingProfileEntry);
  const migrationStatements = statements(sql);
  assert.equal(migrationStatements.length, 5);
  for (const statement of migrationStatements) {
    assert.match(
      statement,
      /^ALTER TABLE `user_profiles` ADD\b/i,
      `unexpected onboarding profile statement: ${statement.slice(0, 80)}`,
    );
  }
  for (const name of [
    "last_name",
    "first_name",
    "middle_name",
    "phone_verified",
    "phone_verified_at",
  ]) {
    assert.match(sql, new RegExp(`\\\`${name}\\\``));
  }
  assert.match(
    sql,
    /`phone_verified` integer DEFAULT false NOT NULL/i,
  );
  assert.doesNotMatch(
    sql,
    /DROP TABLE|DELETE FROM|UPDATE `user_profiles`|account_type/i,
  );

  const previous = JSON.parse(
    readFileSync(
      new URL("meta/0023_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(
      new URL("meta/0024_snapshot.json", drizzleRoot),
      "utf8",
    ),
  ) as {
    id: string;
    prevId: string;
    tables: Record<string, {
      columns: Record<string, {
        notNull: boolean;
        default?: unknown;
      }>;
      foreignKeys: Record<string, unknown>;
    }>;
  };
  assert.equal(onboardingProfileEntry.idx, 24);
  assert.equal(onboardingProfileEntry.tag, "0024_parched_catseye");
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(
    snapshot.tables.user_profiles.columns.last_name.notNull,
    false,
  );
  assert.equal(
    snapshot.tables.user_profiles.columns.first_name.notNull,
    false,
  );
  assert.equal(
    snapshot.tables.user_profiles.columns.middle_name.notNull,
    false,
  );
  assert.equal(
    snapshot.tables.user_profiles.columns.phone_verified.notNull,
    true,
  );
  assert.equal(
    snapshot.tables.user_profiles.columns.phone_verified.default,
    false,
  );
  assert.equal(
    snapshot.tables.user_profiles.columns.phone_verified_at.notNull,
    false,
  );
  assert.equal(Object.keys(snapshot.tables).length, 71);
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    127,
  );
});

test("0024 preserves existing profiles with phone verification unset", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx <= 23)) {
      applyMigration(db, entry);
    }
    const now = "2026-07-28T12:00:00.000Z";
    db.prepare(
      `INSERT INTO user_profiles (id,email,account_type,created_at,updated_at)
       VALUES (?,?,?,?,?)`,
    ).run("onboarding-existing", "existing@example.test", "business", now, now);
    applyMigration(db, onboardingProfileEntry);
    const profile = db.prepare(
      `SELECT account_type AS accountType,last_name AS lastName,
         first_name AS firstName,middle_name AS middleName,
         phone_verified AS phoneVerified,
         phone_verified_at AS phoneVerifiedAt
       FROM user_profiles WHERE id='onboarding-existing'`,
    ).get() as Record<string, unknown>;
    assert.deepEqual({ ...profile }, {
      accountType: "business",
      lastName: null,
      firstName: null,
      middleName: null,
      phoneVerified: 0,
      phoneVerifiedAt: null,
    });
    assert.equal(tableDefinitions(db).size, 97);
    assert.equal(foreignKeyCount(db), 129);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0025 adds an additive fail-closed legal-source lifecycle", () => {
  const sql = migrationSql(legalSourceLifecycleEntry);
  const migrationStatements = statements(sql);
  assert.ok(migrationStatements.length >= 30);
  for (const statement of migrationStatements) {
    assert.match(
      statement,
      /^(?:CREATE (?:TABLE|INDEX|UNIQUE INDEX|TRIGGER)|ALTER TABLE `legal_sources` ADD)\b/i,
      `unexpected legal-source lifecycle statement: ${statement.slice(0, 100)}`,
    );
  }
  for (const table of [
    "legal_source_versions",
    "legal_source_sections",
    "legal_source_chunks",
    "source_sync_runs",
    "source_sync_errors",
    "legal_review_queue",
  ]) {
    assert.match(sql, new RegExp("CREATE TABLE `" + table + "`"));
  }
  for (const column of [
    "verification_state",
    "content_sha256",
    "fetched_at",
    "verified_at",
    "verified_by_user_id",
  ]) {
    assert.match(
      sql,
      new RegExp("ALTER TABLE `legal_sources` ADD `" + column + "`"),
    );
  }
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE `legal_sources` SET/i);
  assert.match(sql, /verified legal source requires exact evidence/);
  assert.match(sql, /verified legal source evidence is immutable/);
  assert.match(
    sql,
    /FOREIGN KEY \(`verified_by_user_id`\) REFERENCES `user_profiles`\(`id`\) ON UPDATE no action ON DELETE restrict/,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX `source_sync_runs_active_lock_uidx` ON `source_sync_runs` \(`lock_key`\) WHERE `status` = 'running'/,
  );

  const previous = JSON.parse(
    readFileSync(new URL("meta/0024_snapshot.json", drizzleRoot), "utf8"),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0025_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    id: string;
    prevId: string;
    tables: Record<string, { foreignKeys: Record<string, unknown> }>;
  };
  assert.equal(legalSourceLifecycleEntry.idx, 25);
  assert.equal(legalSourceLifecycleEntry.tag, "0025_clean_harpoon");
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, 77);
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    136,
  );
});

test("0025 keeps legacy sources untrusted and enforces verification evidence", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx <= 25)) {
      applyMigration(db, entry);
    }
    const now = "2026-07-28T12:00:00.000Z";
    const hash = "a".repeat(64);
    db.prepare(
      `INSERT INTO user_profiles (id,email,account_type,created_at,updated_at)
       VALUES (?,?,?,?,?)`,
    ).run("legal-reviewer", "reviewer@example.test", "lawyer", now, now);
    db.prepare(
      `INSERT INTO legal_sources
       (id,official_url,act_title,locale,source_type,status,last_checked_at,created_at,updated_at)
       VALUES (?,?,?,?,?,'verified',?,?,?)`,
    ).run(
      "legacy-lex",
      "https://lex.uz/docs/legacy",
      "Legacy source",
      "ru",
      "lex",
      now,
      now,
      now,
    );
    const legacy = db.prepare(
      "SELECT status,verification_state AS verificationState,verified_at AS verifiedAt FROM legal_sources WHERE id='legacy-lex'",
    ).get() as Record<string, unknown>;
    assert.deepEqual({ ...legacy }, {
      status: "verified",
      verificationState: "draft",
      verifiedAt: null,
    });
    assert.throws(
      () => db.prepare(
        "UPDATE legal_sources SET verification_state='verified' WHERE id='legacy-lex'",
      ).run(),
      /verified legal source requires exact evidence/,
    );
    assert.throws(
      () => db.prepare(
        `UPDATE legal_sources
         SET status='verified',verification_state='verified',content_sha256=?,
           verified_at=?,verified_by_user_id='missing-reviewer',fetched_at=?
         WHERE id='legacy-lex'`,
      ).run(hash, now, now),
      /verified legal source requires exact evidence/,
    );
    db.prepare(
      `UPDATE legal_sources
       SET status='verified',verification_state='verified',content_sha256=?,
         verified_at=?,verified_by_user_id=?,fetched_at=?
       WHERE id='legacy-lex'`,
    ).run(hash, now, "legal-reviewer", now);
    assert.throws(
      () => db.prepare(
        "UPDATE legal_sources SET content_sha256=? WHERE id='legacy-lex'",
      ).run("b".repeat(64)),
      /verified legal source evidence is immutable/,
    );
    assert.throws(
      () => db.prepare(
        `INSERT INTO legal_source_versions
         (id,source_id,language,status,content_sha256,raw_object_key,fetched_at,created_at,updated_at)
         VALUES ('invalid-version','legacy-lex','ru','verified',?,'legal-sources/invalid',?,?,?)`,
      ).run(hash, now, now, now),
      /verified legal source version requires evidence/,
    );
    db.prepare(
      `INSERT INTO legal_source_versions
       (id,source_id,language,status,content_sha256,raw_object_key,fetched_at,created_at,updated_at)
       VALUES ('pending-version','legacy-lex','ru','pending_review',?,'legal-sources/lex/aa/raw',?,?,?)`,
    ).run(hash, now, now, now);
    assert.throws(
      () => db.prepare(
        `INSERT INTO source_sync_runs
         (id,environment,source_kind,run_type,status,lock_key,started_at,created_at,updated_at)
         VALUES ('bad-run','staging','lex','incremental','success','lex:staging',?,?,?)`,
      ).run(now, now, now),
      /source sync completion evidence invalid/,
    );
    db.prepare(
      `INSERT INTO source_sync_runs
       (id,environment,source_kind,run_type,status,lock_key,started_at,created_at,updated_at)
       VALUES ('running-lex','staging','lex','incremental','running','lex:staging',?,?,?)`,
    ).run(now, now, now);
    assert.throws(
      () => db.prepare(
        `INSERT INTO source_sync_runs
         (id,environment,source_kind,run_type,status,lock_key,started_at,created_at,updated_at)
         VALUES ('duplicate-running-lex','staging','lex','incremental','running','lex:staging',?,?,?)`,
      ).run("2026-07-28T12:01:00.000Z", now, now),
      /UNIQUE constraint failed: source_sync_runs\.lock_key/,
    );
    assert.throws(
      () => db.prepare(
        `INSERT INTO legal_review_queue
         (id,source_id,version_id,reason_code,confidence,status,created_at,updated_at)
         VALUES ('bad-review','legacy-lex','pending-version','new_version','high','approved',?,?)`,
      ).run(now, now),
      /legal review decision evidence required/,
    );
    assert.equal(tableDefinitions(db).size, 103);
    assert.equal(foreignKeyCount(db), 138);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0026 adds only the fail-closed legal source fetch request contract", () => {
  const sql = migrationSql(legalSourceFetchEntry);
  const migrationStatements = statements(sql);
  assert.equal(migrationStatements.length, 7);
  for (const statement of migrationStatements) {
    assert.match(
      statement,
      /^CREATE (?:TABLE|INDEX|UNIQUE INDEX|TRIGGER)\b/i,
      `unexpected legal source fetch statement: ${statement.slice(0, 100)}`,
    );
  }
  assert.match(sql, /CREATE TABLE `legal_source_fetch_requests`/);
  assert.match(sql, /legal source fetch request lifecycle invalid/);
  assert.match(sql, /completed legal source fetch request is immutable/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX `legal_review_queue_version_reason_uidx`/,
  );
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE `legal_sources` SET/i);

  const previous = JSON.parse(
    readFileSync(new URL("meta/0025_snapshot.json", drizzleRoot), "utf8"),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0026_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    id: string;
    prevId: string;
    tables: Record<string, { foreignKeys: Record<string, unknown> }>;
  };
  assert.equal(legalSourceFetchEntry.idx, 26);
  assert.equal(legalSourceFetchEntry.tag, "0026_panoramic_toad_men");
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, 78);
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    139,
  );
});

test("0026 rejects unsafe fetch scope and makes completed evidence immutable", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    const now = "2026-07-28T12:00:00.000Z";
    const finished = "2026-07-28T12:01:00.000Z";
    const hash = "c".repeat(64);

    assert.throws(
      () => db.prepare(`
        INSERT INTO legal_source_fetch_requests (
          id, environment, source_kind, locale, requested_url, canonical_id,
          idempotency_key, status, attempt_count, created_at, updated_at
        ) VALUES (
          'unsafe-url', 'staging', 'lex', 'ru',
          'http://lex.uz/ru/docs/-42', '-42', 'unsafe-url-key',
          'queued', 0, ?, ?
        )
      `).run(now, now),
      /legal source fetch request URL invalid/,
    );
    for (const [id, url] of [
      ["trailing-slash", "https://lex.uz/ru/docs/-42/"],
      ["non-numeric", "https://lex.uz/ru/docs/-42garbage"],
    ]) {
      assert.throws(
        () => db.prepare(`
          INSERT INTO legal_source_fetch_requests (
            id, environment, source_kind, locale, requested_url, canonical_id,
            idempotency_key, status, attempt_count, created_at, updated_at
          ) VALUES (?, 'staging', 'lex', 'ru', ?, '-42', ?, 'queued', 0, ?, ?)
        `).run(id, url, `${id}-key`, now, now),
        /legal source fetch request URL invalid/,
      );
    }
    assert.throws(
      () => db.prepare(`
        INSERT INTO legal_source_fetch_requests (
          id, environment, source_kind, locale, requested_url, canonical_id,
          idempotency_key, status, attempt_count, started_at,
          created_at, updated_at
        ) VALUES (
          'bad-lifecycle', 'staging', 'lex', 'ru',
          'https://lex.uz/ru/docs/-42', '-42', 'bad-lifecycle-key',
          'queued', 1, ?, ?, ?
        )
      `).run(now, now, now),
      /legal source fetch request lifecycle invalid/,
    );

    db.prepare(`
      INSERT INTO legal_source_fetch_requests (
        id, environment, source_kind, locale, requested_url, canonical_id,
        idempotency_key, status, attempt_count, created_at, updated_at
      ) VALUES (
        'fetch-42', 'staging', 'lex', 'ru',
        'https://lex.uz/ru/docs/-42', '-42', 'fetch-42-key',
        'queued', 0, ?, ?
      )
    `).run(now, now);
    assert.throws(
      () => db.prepare(`
        UPDATE legal_source_fetch_requests
        SET requested_url='https://lex.uz/ru/docs/-43'
        WHERE id='fetch-42'
      `).run(),
      /legal source fetch request identity is immutable/,
    );
    db.prepare(`
      UPDATE legal_source_fetch_requests
      SET status='running', attempt_count=1, started_at=?, updated_at=?
      WHERE id='fetch-42'
    `).run(now, now);
    assert.throws(
      () => db.prepare(`
        UPDATE legal_source_fetch_requests
        SET status='queued', attempt_count=0, started_at=NULL, updated_at=?
        WHERE id='fetch-42'
      `).run(now),
      /legal source fetch request lifecycle invalid/,
    );
    assert.throws(
      () => db.prepare(`
        UPDATE legal_source_fetch_requests
        SET status='completed', finished_at=?
        WHERE id='fetch-42'
      `).run(finished),
      /legal source fetch request lifecycle invalid/,
    );

    db.prepare(`
      INSERT INTO legal_sources (
        id, canonical_id, official_url, act_title, act_identifier,
        locale, source_type, status, verification_state, content_sha256,
        fetched_at, last_checked_at, created_at, updated_at
      ) VALUES (
        'source-42', '-42', 'https://lex.uz/ru/docs/-42', 'Act 42', '-42',
        'ru', 'lex', 'pending_review', 'fetched', ?, ?, ?, ?, ?
      )
    `).run(hash, now, now, now, now);
    db.prepare(`
      INSERT INTO legal_source_versions (
        id, source_id, language, status, content_sha256, raw_object_key,
        fetched_at, created_at, updated_at
      ) VALUES (
        'version-42', 'source-42', 'ru', 'pending_review', ?,
        'legal-sources/raw/lex/ru/cc/hash.html', ?, ?, ?
      )
    `).run(hash, now, now, now);
    db.prepare(`
      UPDATE legal_source_fetch_requests
      SET status='completed', source_id='source-42', version_id='version-42',
          finished_at=?, updated_at=?
      WHERE id='fetch-42'
    `).run(finished, finished);
    assert.throws(
      () => db.prepare(`
        UPDATE legal_source_fetch_requests
        SET status='failed', source_id=NULL, version_id=NULL,
            error_code='rewritten', updated_at=?
        WHERE id='fetch-42'
      `).run(finished),
      /completed legal source fetch request is immutable|legal source fetch request lifecycle invalid/,
    );

    db.prepare(`
      INSERT INTO legal_source_fetch_requests (
        id, environment, source_kind, locale, requested_url, canonical_id,
        idempotency_key, status, attempt_count, error_code, started_at,
        finished_at, created_at, updated_at
      ) VALUES (
        'failed-42', 'staging', 'lex', 'ru',
        'https://lex.uz/ru/docs/-43', '-43', 'failed-42-key',
        'failed', 1, 'LEGAL_SOURCE_UPSTREAM_UNAVAILABLE', ?, ?, ?, ?
      )
    `).run(now, finished, now, finished);
    assert.throws(
      () => db.prepare(`
        UPDATE legal_source_fetch_requests
        SET status='running', error_code=NULL, finished_at=NULL, updated_at=?
        WHERE id='failed-42'
      `).run(finished),
      /legal source fetch request lifecycle invalid/,
    );

    assert.equal(tableDefinitions(db).size, 120);
    assert.equal(foreignKeyCount(db), 193);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0027 adds verifiable and immutable legal-review decision evidence", () => {
  const sql = migrationSql(legalSourceReviewEvidenceEntry);
  const migrationStatements = statements(sql);
  assert.equal(migrationStatements.length, 10);
  for (const statement of migrationStatements) {
    assert.match(
      statement,
      /^(?:ALTER TABLE|CREATE INDEX|CREATE TRIGGER)\b/i,
      `unexpected legal review evidence statement: ${statement.slice(0, 100)}`,
    );
  }
  assert.match(sql, /ADD `decision_evidence_json` text/);
  assert.match(sql, /json_extract\(NEW\.`decision_evidence_json`, '\$\.reviewId'\) = NEW\.`id`/);
  assert.match(sql, /legal review terminal evidence is immutable/);
  assert.match(sql, /legal review terminal evidence cannot be deleted/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE `legal_sources` SET/i);

  const previous = JSON.parse(
    readFileSync(new URL("meta/0026_snapshot.json", drizzleRoot), "utf8"),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0027_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    id: string;
    prevId: string;
    tables: Record<string, { foreignKeys: Record<string, unknown> }>;
  };
  assert.equal(legalSourceReviewEvidenceEntry.idx, 27);
  assert.equal(
    legalSourceReviewEvidenceEntry.tag,
    "0027_closed_masked_marvel",
  );
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, 78);
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    140,
  );
});

test("0027 preserves legacy decisions but requires coherent evidence for new ones", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx <= 26)) {
      applyMigration(db, entry);
    }
    const now = "2026-07-28T12:00:00.000Z";
    const rawHash = "a".repeat(64);
    const parsedHash = "b".repeat(64);
    db.prepare(`
      INSERT INTO user_profiles (
        id,email,locale,account_type,timezone,created_at,updated_at
      ) VALUES ('reviewer-27','reviewer27@example.test','ru','individual',
        'Asia/Tashkent',?,?)
    `).run(now, now);
    db.prepare(`
      INSERT INTO legal_sources (
        id,canonical_id,official_url,act_title,act_identifier,locale,
        source_type,status,verification_state,content_sha256,fetched_at,
        last_checked_at,created_at,updated_at
      ) VALUES (
        'source-27','-27','https://lex.uz/ru/docs/-27','Act 27','-27','ru',
        'lex','pending_review','fetched',?,?,?,?,?
      )
    `).run(rawHash, now, now, now, now);
    db.prepare(`
      INSERT INTO legal_source_versions (
        id,source_id,language,status,content_sha256,raw_object_key,
        parsed_object_key,fetched_at,created_at,updated_at
      ) VALUES (
        'version-27','source-27','ru','pending_review',?,
        'legal-sources/raw/lex/ru/aa/raw.html',
        'legal-sources/parsed/lex/ru/aa/parsed.json',?,?,?
      )
    `).run(rawHash, now, now, now);
    db.prepare(`
      INSERT INTO legal_review_queue (
        id,source_id,version_id,reason_code,confidence,status,
        assigned_to_user_id,decision,decided_at,created_at,updated_at
      ) VALUES (
        'legacy-review-27','source-27','version-27','legacy','low','approved',
        'reviewer-27','approve',?,?,?
      )
    `).run(now, now, now);

    applyMigration(db, legalSourceReviewEvidenceEntry);
    const legacy = db.prepare(`
      SELECT decision_evidence_json,decision_evidence_sha256
      FROM legal_review_queue WHERE id='legacy-review-27'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...legacy }, {
      decision_evidence_json: null,
      decision_evidence_sha256: null,
    });
    assert.throws(
      () => db.prepare(
        "DELETE FROM legal_review_queue WHERE id='legacy-review-27'",
      ).run(),
      /legal review terminal evidence cannot be deleted/,
    );

    db.prepare(`
      INSERT INTO legal_review_queue (
        id,source_id,version_id,reason_code,confidence,status,
        assigned_to_user_id,created_at,updated_at
      ) VALUES (
        'new-review-27','source-27','version-27','new-evidence','low',
        'in_review','reviewer-27',?,?
      )
    `).run(now, now);
    const notes = "Verified against the normalized official snapshot.";
    const evidence = JSON.stringify({
      schemaVersion: 1,
      reviewId: "new-review-27",
      sourceId: "source-27",
      versionId: "version-27",
      sourceKind: "lex",
      locale: "ru",
      canonicalId: "-27",
      canonicalUrl: "https://lex.uz/ru/docs/-27",
      rawContentSha256: rawHash,
      parsedContentSha256: parsedHash,
      parserProfile: "juro-legal-blocks-v1",
      decision: "approve",
      notes,
      reviewerUserId: "reviewer-27",
      reviewerSessionId: "session-27",
      reviewerAssignmentIds: ["assignment-27"],
      mfaVerifiedAt: now,
      decidedAt: now,
    });
    const missingSessionEvidence = JSON.parse(evidence) as Record<
      string,
      unknown
    >;
    delete missingSessionEvidence.reviewerSessionId;
    assert.throws(
      () => db.prepare(`
        UPDATE legal_review_queue
        SET status='approved',decision='approve',decision_notes=?,
          reviewed_parsed_sha256=?,decided_by_user_id='reviewer-27',
          decision_evidence_json=?,decision_evidence_sha256=?,decided_at=?
        WHERE id='new-review-27'
      `).run(
        notes,
        parsedHash,
        JSON.stringify(missingSessionEvidence),
        "c".repeat(64),
        now,
      ),
      /legal review decision evidence invalid/,
    );
    assert.throws(
      () => db.prepare(`
        UPDATE legal_review_queue
        SET status='approved',decision='approve',decision_notes=?,
          reviewed_parsed_sha256=?,decided_by_user_id='reviewer-27',
          decision_evidence_json=?,decision_evidence_sha256=?,decided_at=?
        WHERE id='new-review-27'
      `).run(
        notes,
        parsedHash,
        evidence.replace("new-review-27", "wrong-review-27"),
        "c".repeat(64),
        now,
      ),
      /legal review decision evidence invalid/,
    );
    db.prepare(`
      UPDATE legal_review_queue
      SET status='approved',decision='approve',decision_notes=?,
        reviewed_parsed_sha256=?,decided_by_user_id='reviewer-27',
        decision_evidence_json=?,decision_evidence_sha256=?,decided_at=?
      WHERE id='new-review-27'
    `).run(notes, parsedHash, evidence, "c".repeat(64), now);
    assert.throws(
      () => db.prepare(`
        UPDATE legal_review_queue SET confidence='high'
        WHERE id='new-review-27'
      `).run(),
      /legal review terminal evidence is immutable/,
    );
    assert.equal(tableDefinitions(db).size, 104);
    assert.equal(foreignKeyCount(db), 142);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0028 adds only append-only, review-bound publication evidence", () => {
  const sql = migrationSql(legalSourcePublicationEntry);
  const migrationStatements = statements(sql);
  assert.equal(migrationStatements.length, 14);
  for (const statement of migrationStatements) {
    assert.match(
      statement,
      /^CREATE (?:TABLE|INDEX|UNIQUE INDEX|TRIGGER)\b/i,
      `unexpected legal publication statement: ${statement.slice(0, 100)}`,
    );
  }
  assert.match(sql, /CREATE TABLE `legal_source_publications`/);
  assert.match(sql, /legal source publication review evidence invalid/);
  assert.match(sql, /legal source publication canonical evidence invalid/);
  assert.match(sql, /legal source publication evidence is immutable/);
  assert.match(sql, /legal source publication evidence cannot be deleted/);
  assert.match(sql, /published legal source sections are immutable/);
  assert.match(sql, /published legal source chunks are immutable/);
  assert.doesNotMatch(
    sql,
    /(?:^|\n)\s*(?:DROP|ALTER|DELETE|UPDATE)\b/im,
  );

  const previous = JSON.parse(
    readFileSync(new URL("meta/0027_snapshot.json", drizzleRoot), "utf8"),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0028_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    id: string;
    prevId: string;
    tables: Record<string, { foreignKeys: Record<string, unknown> }>;
  };
  assert.equal(legalSourcePublicationEntry.idx, 28);
  assert.equal(legalSourcePublicationEntry.tag, "0028_orange_nightmare");
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, 79);
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    144,
  );
});

test("0028 rejects incoherent publication and preserves accepted evidence", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    const now = "2026-07-28T13:00:00.000Z";
    const rawHash = "a".repeat(64);
    const parsedHash = "b".repeat(64);
    const reviewHash = "c".repeat(64);
    const publicationHash = "d".repeat(64);
    const notes = "Exact normalized source evidence approved for publication.";
    db.prepare(`
      INSERT INTO user_profiles (
        id,email,locale,account_type,timezone,created_at,updated_at
      ) VALUES ('publisher-28','publisher28@example.test','ru','individual',
        'Asia/Tashkent',?,?)
    `).run(now, now);
    db.prepare(`
      INSERT INTO legal_sources (
        id,canonical_id,official_url,act_title,act_identifier,locale,
        source_type,status,verification_state,content_sha256,fetched_at,
        last_checked_at,created_at,updated_at
      ) VALUES (
        'source-28','-28','https://lex.uz/ru/docs/-28','Act 28','-28','ru',
        'lex','pending_review','fetched',?,?,?,?,?
      )
    `).run(rawHash, now, now, now, now);
    db.prepare(`
      INSERT INTO legal_source_versions (
        id,source_id,language,status,content_sha256,raw_object_key,
        parsed_object_key,fetched_at,created_at,updated_at
      ) VALUES (
        'version-28','source-28','ru','pending_review',?,
        'legal-sources/raw/lex/ru/aa/raw.html',
        'legal-sources/parsed/lex/ru/aa/parsed.json',?,?,?
      )
    `).run(rawHash, now, now, now);
    const reviewEvidence = JSON.stringify({
      schemaVersion: 1,
      reviewId: "review-28",
      sourceId: "source-28",
      versionId: "version-28",
      sourceKind: "lex",
      locale: "ru",
      canonicalId: "-28",
      canonicalUrl: "https://lex.uz/ru/docs/-28",
      rawContentSha256: rawHash,
      parsedContentSha256: parsedHash,
      parserProfile: "juro-legal-blocks-v1",
      decision: "approve",
      notes,
      reviewerUserId: "publisher-28",
      reviewerSessionId: "review-session-28",
      reviewerAssignmentIds: ["review-assignment-28"],
      mfaVerifiedAt: now,
      decidedAt: now,
    });
    db.prepare(`
      INSERT INTO legal_review_queue (
        id,source_id,version_id,reason_code,confidence,status,
        assigned_to_user_id,decision,decision_notes,reviewed_parsed_sha256,
        decided_by_user_id,decision_evidence_json,decision_evidence_sha256,
        decided_at,created_at,updated_at
      ) VALUES (
        'review-28','source-28','version-28','new_source_version','low',
        'approved','publisher-28','approve',?,?,'publisher-28',?,?,?, ?,?
      )
    `).run(notes, parsedHash, reviewEvidence, reviewHash, now, now, now);
    db.prepare(`
      INSERT INTO legal_source_sections (
        id,version_id,canonical_ref,heading,body_text,sequence,
        content_sha256,created_at
      ) VALUES (
        'section-28','version-28','blocks:0-1','Act 28','Verified text',0,?,?
      )
    `).run("e".repeat(64), now);
    db.prepare(`
      INSERT INTO legal_source_chunks (
        id,version_id,section_id,chunk_index,language,content_text,
        content_sha256,metadata_json,created_at
      ) VALUES (
        'chunk-28','version-28','section-28',0,'ru','Verified text',?, '{}',?
      )
    `).run("e".repeat(64), now);
    const publicationEvidence = JSON.stringify({
      schemaVersion: 1,
      publicationId: "publication-28",
      reviewId: "review-28",
      sourceId: "source-28",
      versionId: "version-28",
      sourceKind: "lex",
      locale: "ru",
      canonicalId: "-28",
      canonicalUrl: "https://lex.uz/ru/docs/-28",
      reviewEvidenceSha256: reviewHash,
      rawContentSha256: rawHash,
      parsedContentSha256: parsedHash,
      parserProfile: "juro-legal-blocks-v1",
      publishedByUserId: "publisher-28",
      publisherSessionId: "publish-session-28",
      publisherAssignmentIds: ["publish-assignment-28"],
      mfaVerifiedAt: now,
      sectionCount: 1,
      chunkCount: 1,
      publishedAt: now,
    });
    const missingSessionEvidence = JSON.parse(
      publicationEvidence,
    ) as Record<string, unknown>;
    missingSessionEvidence.publicationId = "missing-session-publication-28";
    delete missingSessionEvidence.publisherSessionId;
    assert.throws(
      () => db.prepare(`
        INSERT INTO legal_source_publications (
          id,review_id,source_id,version_id,review_evidence_sha256,
          raw_content_sha256,parsed_content_sha256,published_by_user_id,
          publication_evidence_json,publication_evidence_sha256,
          published_at,created_at
        ) VALUES (
          'missing-session-publication-28','review-28','source-28','version-28',?,?,?,
          'publisher-28',?,?,?,?
        )
      `).run(
        reviewHash,
        rawHash,
        parsedHash,
        JSON.stringify(missingSessionEvidence),
        publicationHash,
        now,
        now,
      ),
      /legal source publication canonical evidence invalid/,
    );
    assert.throws(
      () => db.prepare(`
        INSERT INTO legal_source_publications (
          id,review_id,source_id,version_id,review_evidence_sha256,
          raw_content_sha256,parsed_content_sha256,published_by_user_id,
          publication_evidence_json,publication_evidence_sha256,
          published_at,created_at
        ) VALUES (
          'bad-publication-28','review-28','source-28','version-28',?,?,?,
          'publisher-28',?,?,?,?
        )
      `).run(
        reviewHash,
        rawHash,
        parsedHash,
        publicationEvidence,
        publicationHash,
        now,
        now,
      ),
      /legal source publication canonical evidence invalid/,
    );
    const badShapeEvidence = JSON.parse(
      publicationEvidence,
    ) as Record<string, unknown>;
    badShapeEvidence.publicationId = "bad-shape-publication-28";
    db.prepare(`
      UPDATE legal_source_chunks SET metadata_json='not-json'
      WHERE id='chunk-28'
    `).run();
    assert.throws(
      () => db.prepare(`
        INSERT INTO legal_source_publications (
          id,review_id,source_id,version_id,review_evidence_sha256,
          raw_content_sha256,parsed_content_sha256,published_by_user_id,
          publication_evidence_json,publication_evidence_sha256,
          published_at,created_at
        ) VALUES (
          'bad-shape-publication-28','review-28','source-28','version-28',?,?,?,
          'publisher-28',?,?,?,?
        )
      `).run(
        reviewHash,
        rawHash,
        parsedHash,
        JSON.stringify(badShapeEvidence),
        publicationHash,
        now,
        now,
      ),
      /legal source publication canonical evidence invalid/,
    );
    db.prepare(`
      UPDATE legal_source_chunks SET metadata_json='{}'
      WHERE id='chunk-28'
    `).run();
    db.prepare(`
      INSERT INTO legal_source_publications (
        id,review_id,source_id,version_id,review_evidence_sha256,
        raw_content_sha256,parsed_content_sha256,published_by_user_id,
        publication_evidence_json,publication_evidence_sha256,
        published_at,created_at
      ) VALUES (
        'publication-28','review-28','source-28','version-28',?,?,?,
        'publisher-28',?,?,?,?
      )
    `).run(
      reviewHash,
      rawHash,
      parsedHash,
      publicationEvidence,
      publicationHash,
      now,
      now,
    );
    db.prepare(`
      UPDATE legal_source_versions
      SET status='verified',verified_at=?,verified_by_user_id='publisher-28'
      WHERE id='version-28'
    `).run(now);
    db.prepare(`
      UPDATE legal_sources
      SET status='verified',verification_state='verified',verified_at=?,
        verified_by_user_id='publisher-28',content_sha256=?
      WHERE id='source-28'
    `).run(now, rawHash);
    assert.throws(
      () => db.prepare(`
        UPDATE legal_source_publications SET published_at=?
        WHERE id='publication-28'
      `).run("2026-07-28T13:01:00.000Z"),
      /legal source publication evidence is immutable/,
    );
    assert.throws(
      () => db.prepare(
        "DELETE FROM legal_source_publications WHERE id='publication-28'",
      ).run(),
      /legal source publication evidence cannot be deleted/,
    );
    assert.throws(
      () => db.prepare(`
        UPDATE legal_source_sections SET body_text='tampered'
        WHERE id='section-28'
      `).run(),
      /published legal source sections are immutable/,
    );
    assert.throws(
      () => db.prepare("DELETE FROM legal_source_chunks WHERE id='chunk-28'")
        .run(),
      /published legal source chunks are immutable/,
    );
    assert.throws(
      () => db.prepare(`
        INSERT INTO legal_source_chunks (
          id,version_id,section_id,chunk_index,language,content_text,
          content_sha256,metadata_json,created_at
        ) VALUES (
          'late-chunk-28','version-28','section-28',1,'ru','late',?, '{}',?
        )
      `).run("f".repeat(64), now),
      /published legal source chunks are immutable/,
    );
    assert.equal(tableDefinitions(db).size, 120);
    assert.equal(foreignKeyCount(db), 193);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});


test("0029 adds only constrained session token rotation evidence", () => {
  const sql = migrationSql(sessionTokenRotationEntry);
  const migrationStatements = statements(sql);
  assert.equal(migrationStatements.length, 9);
  for (const statement of migrationStatements) {
    assert.match(
      statement,
      /^CREATE (?:TABLE|INDEX|UNIQUE INDEX)\b/i,
      `unexpected session rotation statement: ${statement.slice(0, 100)}`,
    );
  }
  assert.match(sql, /CREATE TABLE .*auth_session_token_history/);
  assert.match(sql, /CREATE TABLE .*auth_session_token_replays/);
  assert.match(sql, /auth_session_token_history_reason_check/);
  assert.match(sql, /auth_session_token_replays_action_check/);
  assert.doesNotMatch(
    sql,
    /(?:^|\n)\s*(?:DROP|ALTER|DELETE|UPDATE)\b/im,
  );

  const previous = JSON.parse(
    readFileSync(new URL("meta/0028_snapshot.json", drizzleRoot), "utf8"),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0029_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    id: string;
    prevId: string;
    tables: Record<string, { foreignKeys: Record<string, unknown> }>;
  };
  assert.equal(sessionTokenRotationEntry.idx, 29);
  assert.equal(sessionTokenRotationEntry.tag, "0029_session_token_rotation");
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, 81);
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    149,
  );
});

test("0030 adds an encrypted, durable security email job boundary", () => {
  const sql = migrationSql(securityEmailJobEntry);
  const migrationStatements = statements(sql);
  assert.equal(migrationStatements.length, 5);
  assert.match(migrationStatements[0], /^CREATE TABLE\b/i);
  for (const statement of migrationStatements.slice(1, 4)) {
    assert.match(statement, /^CREATE (?:UNIQUE )?INDEX\b/i);
  }
  assert.match(migrationStatements[4], /^CREATE TRIGGER\b/i);
  assert.match(sql, /CREATE TABLE .*security_email_jobs/);
  assert.match(sql, /recipient_ciphertext/);
  assert.match(sql, /recipient_iv/);
  assert.match(sql, /recipient_key_version/);
  assert.match(sql, /security_email_jobs_challenge_event_uidx/);
  assert.match(sql, /security_email_jobs_recipient_immutable/);
  assert.doesNotMatch(sql, /recipient_email/);
  assert.doesNotMatch(sql, /(?:^|\n)\s*(?:DROP|ALTER|DELETE|UPDATE)\b/im);

  const previous = JSON.parse(
    readFileSync(new URL("meta/0029_snapshot.json", drizzleRoot), "utf8"),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0030_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    prevId: string;
    tables: Record<string, { foreignKeys: Record<string, unknown> }>;
  };
  assert.equal(securityEmailJobEntry.idx, 30);
  assert.equal(securityEmailJobEntry.tag, "0030_eager_shen");
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, 82);
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    152,
  );
});

test("0029 fences duplicate retirement and replay claims", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    const now = "2026-07-29T10:00:00.000Z";
    const expiresAt = "2026-07-30T10:00:00.000Z";
    db.prepare(`
      INSERT INTO user_profiles (
        id,email,locale,account_type,timezone,created_at,updated_at
      ) VALUES ('rotation-user','rotation@example.test','ru','individual',
        'Asia/Tashkent',?,?)
    `).run(now, now);
    db.prepare(`
      INSERT INTO auth_devices (
        id,user_id,display_name,first_seen_at,last_seen_at
      ) VALUES ('rotation-device','rotation-user','Test device',?,?)
    `).run(now, now);
    db.prepare(`
      INSERT INTO auth_sessions (
        id,user_id,device_id,token_hash,expires_at,idle_expires_at,
        created_at,last_seen_at
      ) VALUES (
        'rotation-session','rotation-user','rotation-device',?, ?, ?, ?, ?
      )
    `).run("b".repeat(64), expiresAt, expiresAt, now, now);
    db.prepare(`
      INSERT INTO auth_session_token_history (
        id,session_id,user_id,token_hash,rotation_reason,rotated_at,expires_at
      ) VALUES ('history-29','rotation-session','rotation-user',?,
        'mfa_elevation',?,?)
    `).run("a".repeat(64), now, expiresAt);
    assert.throws(
      () => db.prepare(`
        INSERT INTO auth_session_token_history (
          id,session_id,user_id,token_hash,rotation_reason,rotated_at,expires_at
        ) VALUES ('duplicate-history-29','rotation-session','rotation-user',?,
          'manual',?,?)
      `).run("a".repeat(64), now, expiresAt),
      /UNIQUE constraint failed/,
    );
    assert.throws(
      () => db.prepare(`
        INSERT INTO auth_session_token_history (
          id,session_id,user_id,token_hash,rotation_reason,rotated_at,expires_at
        ) VALUES ('bad-reason-29','rotation-session','rotation-user',?,
          'unknown',?,?)
      `).run("c".repeat(64), now, expiresAt),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => db.prepare(`
        INSERT INTO auth_session_token_history (
          id,session_id,user_id,token_hash,rotation_reason,rotated_at,expires_at
        ) VALUES ('bad-expiry-29','rotation-session','rotation-user',?,
          'manual',?,?)
      `).run("d".repeat(64), now, "2026-07-29T09:59:59.000Z"),
      /CHECK constraint failed/,
    );
    db.prepare(`
      INSERT INTO auth_session_token_replays (
        id,token_history_id,session_id,user_id,detected_at,action
      ) VALUES ('replay-29','history-29','rotation-session','rotation-user',?,
        'session_and_device_revoked')
    `).run(now);
    assert.throws(
      () => db.prepare(`
        INSERT INTO auth_session_token_replays (
          id,token_history_id,session_id,user_id,detected_at,action
        ) VALUES ('duplicate-replay-29','history-29','rotation-session',
          'rotation-user',?,'session_and_device_revoked')
      `).run(now),
      /UNIQUE constraint failed/,
    );
    db.prepare(`
      INSERT INTO auth_session_token_history (
        id,session_id,user_id,token_hash,rotation_reason,rotated_at,expires_at
      ) VALUES ('history-action-29','rotation-session','rotation-user',?,
        'manual',?,?)
    `).run("e".repeat(64), now, expiresAt);
    assert.throws(
      () => db.prepare(`
        INSERT INTO auth_session_token_replays (
          id,token_history_id,session_id,user_id,detected_at,action
        ) VALUES ('bad-action-29','history-action-29','rotation-session',
          'rotation-user',?,'ignored')
      `).run(now),
      /CHECK constraint failed/,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
test("0031 adds only HMAC-backed device continuity and a nullable device link", () => {
  const sql = migrationSql(deviceContinuityEntry);
  const migrationStatements = statements(sql);
  assert.equal(migrationStatements.length, 5);
  assert.match(migrationStatements[0], /^CREATE TABLE\b/i);
  assert.match(migrationStatements[1], /^CREATE UNIQUE INDEX\b/i);
  assert.match(migrationStatements[2], /^CREATE INDEX\b/i);
  assert.match(migrationStatements[3], /^ALTER TABLE\b/i);
  assert.match(migrationStatements[4], /^CREATE INDEX\b/i);
  assert.match(sql, /CREATE TABLE .*auth_device_continuities/);
  assert.match(sql, /auth_device_continuities_hmac_check/);
  assert.match(sql, /auth_device_continuities_country_check/);
  assert.match(sql, /auth_device_continuities_region_check/);
  assert.match(sql, /auth_device_continuities_lookup_uidx/);
  assert.match(sql, /ALTER TABLE .*auth_sessions|ALTER TABLE .*auth_devices/);
  assert.match(sql, /auth_devices.*ADD .*continuity_id/s);
  assert.match(sql, /continuity_id.*ON DELETE set null/i);
  assert.doesNotMatch(sql, /(?:^|\n)\s*(?:DROP|DELETE|UPDATE)\b/im);

  const previous = JSON.parse(
    readFileSync(new URL("meta/0030_snapshot.json", drizzleRoot), "utf8"),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0031_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    prevId: string;
    tables: Record<string, { foreignKeys: Record<string, unknown> }>;
  };
  assert.equal(deviceContinuityEntry.idx, 31);
  assert.equal(deviceContinuityEntry.tag, "0031_melted_nextwave");
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, 83);
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    154,
  );
});

test("0031 enforces tenant-scoped continuity evidence without touching old sessions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    const now = "2026-07-29T11:00:00.000Z";
    db.prepare(`
      INSERT INTO user_profiles (
        id,email,locale,account_type,timezone,created_at,updated_at
      ) VALUES ('continuity-user','continuity@example.test','ru','individual',
        'Asia/Tashkent',?,?)
    `).run(now, now);
    db.prepare(`
      INSERT INTO auth_device_continuities (
        id,user_id,token_hmac,key_version,first_country_code,
        first_region_code,last_country_code,last_region_code,
        first_seen_at,last_seen_at
      ) VALUES ('continuity-31','continuity-user',?,'v1','UZ','TK','UZ','TK',?,?)
    `).run("A".repeat(43), now, now);
    db.prepare(`
      INSERT INTO auth_devices (
        id,user_id,continuity_id,display_name,first_seen_at,last_seen_at
      ) VALUES ('device-31','continuity-user','continuity-31','Test device',?,?)
    `).run(now, now);
    assert.throws(
      () => db.prepare(`
        INSERT INTO auth_device_continuities (
          id,user_id,token_hmac,key_version,first_seen_at,last_seen_at
        ) VALUES ('duplicate-31','continuity-user',?,'v1',?,?)
      `).run("A".repeat(43), now, now),
      /UNIQUE constraint failed/,
    );
    assert.throws(
      () => db.prepare(`
        INSERT INTO auth_device_continuities (
          id,user_id,token_hmac,key_version,first_seen_at,last_seen_at
        ) VALUES ('bad-hmac-31','continuity-user','raw-token','v1',?,?)
      `).run(now, now),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => db.prepare(`
        INSERT INTO auth_device_continuities (
          id,user_id,token_hmac,key_version,first_country_code,
          first_seen_at,last_seen_at
        ) VALUES ('bad-country-31','continuity-user',?,'v1','uzb',?,?)
      `).run("B".repeat(43), now, now),
      /CHECK constraint failed/,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
test("0032 adds an additive encrypted login-security notification boundary", () => {
  const sql = migrationSql(securityNotificationEntry);
  const migrationStatements = statements(sql);
  assert.equal(migrationStatements.length, 5);
  assert.match(migrationStatements[0], /^CREATE TABLE\b/i);
  for (const statement of migrationStatements.slice(1, 4)) {
    assert.match(statement, /^CREATE (?:UNIQUE )?INDEX\b/i);
  }
  assert.match(migrationStatements[4], /^CREATE TRIGGER\b/i);
  assert.match(sql, /CREATE TABLE .*security_notification_jobs/);
  assert.match(sql, /login_new_device/);
  assert.match(sql, /login_new_region/);
  assert.match(sql, /security_notification_jobs_session_event_uidx/);
  assert.match(sql, /security_notification_jobs_content_immutable/);
  assert.match(sql, /recipient_ciphertext/);
  assert.doesNotMatch(sql, /recipient_email/);
  assert.doesNotMatch(sql, /(?:^|\n)\s*(?:DROP|ALTER|DELETE|UPDATE)\b/im);

  const previous = JSON.parse(
    readFileSync(new URL("meta/0031_snapshot.json", drizzleRoot), "utf8"),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0032_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    prevId: string;
    tables: Record<string, { foreignKeys: Record<string, unknown> }>;
  };
  assert.equal(securityNotificationEntry.idx, 32);
  assert.equal(securityNotificationEntry.tag, "0032_fixed_wasp");
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, 84);
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    156,
  );
});

test("0032 fences immutable login notification evidence and duplicate delivery", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    const now = "2026-07-29T12:00:00.000Z";
    db.prepare(`
      INSERT INTO user_profiles (
        id,email,locale,account_type,timezone,created_at,updated_at
      ) VALUES ('notification-user','notice@example.test','ru','individual',
        'Asia/Tashkent',?,?)
    `).run(now, now);
    db.prepare(`
      INSERT INTO workspaces (id,type,name,locale,created_at,updated_at)
      VALUES ('notification-workspace','individual','Notifications','ru',?,?)
    `).run(now, now);
    const insert = db.prepare(`
      INSERT INTO security_notification_jobs (
        id,user_id,workspace_id,session_id,event_type,delivery_channel,locale,
        recipient_ciphertext,recipient_iv,recipient_key_version,device_name,
        country_code,region_code,status,attempt_count,occurred_at,created_at,
        updated_at
      ) VALUES (?,?,?,?,?,'email','ru',?,?,?,?,?,?,'pending',0,?,?,?)
    `);
    insert.run(
      'notification-32',
      'notification-user',
      'notification-workspace',
      'session-32',
      'login_new_device',
      'ciphertext-value-long-enough',
      'A'.repeat(16),
      'v1',
      'Chrome · Windows',
      'UZ',
      'TK',
      now,
      now,
      now,
    );
    assert.throws(
      () => db.prepare(`
        UPDATE security_notification_jobs SET recipient_ciphertext='changed'
        WHERE id='notification-32'
      `).run(),
      /security notification content is immutable/,
    );
    assert.throws(
      () => insert.run(
        'duplicate-32',
        'notification-user',
        'notification-workspace',
        'session-32',
        'login_new_device',
        'ciphertext-value-long-enough',
        'B'.repeat(16),
        'v1',
        'Firefox · Linux',
        'UZ',
        'TK',
        now,
        now,
        now,
      ),
      /UNIQUE constraint failed/,
    );
    db.prepare(`
      UPDATE security_notification_jobs
      SET status='sending',attempt_count=1,updated_at=?
      WHERE id='notification-32'
    `).run(now);
    db.prepare("DELETE FROM workspaces WHERE id='notification-workspace'").run();
    const row = db.prepare(`
      SELECT status,workspace_id AS workspaceId
      FROM security_notification_jobs WHERE id='notification-32'
    `).get() as { status: string; workspaceId: string | null };
    assert.equal(row.status, "sending");
    assert.equal(row.workspaceId, null);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0033 adds a fenced account-deletion lifecycle and purge evidence boundary", () => {
  const sql = migrationSql(accountDeletionLifecycleEntry);
  const migrationStatements = statements(sql);
  assert.equal(migrationStatements.length, 34);
  assert.match(sql, /CREATE TABLE .*account_deletion_lifecycle_events/);
  assert.match(sql, /CREATE TABLE .*account_deletion_purge_evidence/);
  assert.match(sql, /ADD `purge_irreversible_at` text/);
  assert.match(sql, /account_deletion_lifecycle_chain_uidx/);
  assert.match(sql, /APPEND_ONLY_ACCOUNT_DELETION_LIFECYCLE/);
  assert.match(sql, /APPEND_ONLY_ACCOUNT_DELETION_PURGE_EVIDENCE/);
  assert.match(sql, /OLD\.status IN \('cancelled','completed'\)/);
  assert.match(sql, /OLD\.lifecycle_status='deleted'/);

  const previous = JSON.parse(
    readFileSync(new URL("meta/0032_snapshot.json", drizzleRoot), "utf8"),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0033_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    prevId: string;
    tables: Record<string, {
      columns: Record<string, unknown>;
      foreignKeys: Record<string, unknown>;
    }>;
  };
  assert.equal(accountDeletionLifecycleEntry.idx, 33);
  assert.equal(accountDeletionLifecycleEntry.tag, "0033_freezing_havok");
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, 86);
  assert.ok(
    snapshot.tables.account_deletion_requests.columns.purge_irreversible_at,
  );
  assert.equal(
    Object.values(snapshot.tables).reduce(
      (count, table) => count + Object.keys(table.foreignKeys).length,
      0,
    ),
    156,
  );
});

test("0033 prevents lifecycle forks, evidence mutation, cancellation after purge, and tombstone resurrection", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    const now = "2026-07-30T00:00:00.000Z";
    const subjectHash = "a".repeat(64);
    db.prepare(`
      INSERT INTO user_profiles (
        id,email,locale,account_type,timezone,created_at,updated_at
      ) VALUES ('deletion-33','deletion-33@example.test','ru','individual',
        'Asia/Tashkent',?,?)
    `).run(now, now);
    assert.throws(
      () => db.prepare(`
        INSERT INTO user_profiles (
          id,email,locale,account_type,timezone,lifecycle_status,
          deletion_completed_at,created_at,updated_at
        ) VALUES ('invalid-tombstone-33','invalid-33@example.test','ru',
          'individual','Asia/Tashkent','deleted',?,?,?)
      `).run(now, now, now),
      /USER_PROFILE_LIFECYCLE_INVALID/,
    );
    db.prepare(`
      INSERT INTO account_deletion_requests (
        id,user_id,status,deletion_mode,subject_hash,subject_key_version,
        verification_method,verified_at,requested_at,scheduled_purge_at
      ) VALUES ('request-33','deletion-33','scheduled','recoverable_30d',
        ?,'v1','email_otp',?,?,?)
    `).run(subjectHash, now, now, now);
    assert.throws(
      () => db.prepare(`
        UPDATE account_deletion_requests
        SET status='completed',completed_at=? WHERE id='request-33'
      `).run(now),
      /ACCOUNT_DELETION_REQUEST_STATE_INVALID/,
    );
    db.prepare(`
      INSERT INTO account_deletion_lifecycle_events (
        id,request_id,subject_hash,subject_key_version,event_type,
        deletion_mode,policy_version,summary_json,previous_hash,event_hash,
        created_at
      ) VALUES ('event-33','request-33',?,'v1','scheduled','recoverable_30d',
        'account-purge-v1','{}',?,?,?)
    `).run(subjectHash, "0".repeat(64), "b".repeat(64), now);
    assert.throws(
      () => db.prepare(`
        INSERT INTO account_deletion_lifecycle_events (
          id,request_id,subject_hash,subject_key_version,event_type,
          deletion_mode,policy_version,summary_json,previous_hash,event_hash,
          created_at
        ) VALUES ('fork-33','request-33',?,'v1','failed','recoverable_30d',
          'account-purge-v1','{}',?,?,?)
      `).run(subjectHash, "0".repeat(64), "c".repeat(64), now),
      /UNIQUE constraint failed/,
    );
    assert.throws(
      () => db.prepare(`
        UPDATE account_deletion_lifecycle_events
        SET summary_json='{"tampered":true}' WHERE id='event-33'
      `).run(),
      /APPEND_ONLY_ACCOUNT_DELETION_LIFECYCLE/,
    );
    db.prepare(`
      UPDATE account_deletion_requests
      SET status='purging',purge_started_at=?,purge_irreversible_at=?,
          purge_lease_owner='lease-33',purge_lease_expires_at=?
      WHERE id='request-33'
    `).run(now, now, "2026-07-30T00:05:00.000Z");
    assert.throws(
      () => db.prepare(`
        UPDATE account_deletion_requests
        SET status='cancelled',cancelled_at=? WHERE id='request-33'
      `).run(now),
      /ACCOUNT_DELETION_REQUEST_STATE_INVALID/,
    );
    db.prepare(`
      UPDATE account_deletion_requests
      SET status='completed',completed_at=?,purge_lease_owner=NULL,
          purge_lease_expires_at=NULL
      WHERE id='request-33'
    `).run(now);
    db.prepare(`
      INSERT INTO account_deletion_purge_evidence (
        request_id,subject_hash,subject_key_version,deletion_mode,
        policy_version,requested_at,completed_at,r2_deleted_count,
        d1_deleted_count,redacted_count,retained_evidence_json,evidence_hash
      ) VALUES ('request-33',?,'v1','recoverable_30d','account-purge-v1',
        ?,?,0,0,0,'[]',?)
    `).run(subjectHash, now, now, "d".repeat(64));
    assert.throws(
      () => db.prepare(`
        UPDATE account_deletion_purge_evidence
        SET redacted_count=1 WHERE request_id='request-33'
      `).run(),
      /APPEND_ONLY_ACCOUNT_DELETION_PURGE_EVIDENCE/,
    );
    db.prepare(`
      UPDATE user_profiles
      SET email='deleted.migration-33@invalid.juro',lifecycle_status='deleted',
          deletion_completed_at=?,updated_at=?
      WHERE id='deletion-33'
    `).run(now, now);
    assert.throws(
      () => db.prepare(`
        UPDATE user_profiles
        SET email='resurrected-33@example.test',lifecycle_status='active',
          deletion_completed_at=NULL WHERE id='deletion-33'
      `).run(),
      /USER_PROFILE_LIFECYCLE_INVALID/,
    );
    assert.throws(
      () => db.prepare(`
        UPDATE account_deletion_requests
        SET status='scheduled' WHERE id='request-33'
      `).run(),
      /ACCOUNT_DELETION_REQUEST_STATE_INVALID/,
    );
    assert.equal(tableDefinitions(db).size, 120);
    assert.equal(foreignKeyCount(db), 193);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
test("0034 safely backfills and guards business workspace identity", () => {
  const sql = migrationSql(businessWorkspaceIdentityEntry);
  assert.equal(statements(sql).length, 8);
  assert.match(sql, /workspaces_creation_request_uidx/);
  assert.match(sql, /workspaces_business_identity_insert_guard/);
  assert.match(sql, /workspaces_business_identity_update_guard/);

  const previous = JSON.parse(
    readFileSync(new URL("meta/0033_snapshot.json", drizzleRoot), "utf8"),
  ) as { id: string };
  const snapshot = JSON.parse(
    readFileSync(new URL("meta/0034_snapshot.json", drizzleRoot), "utf8"),
  ) as {
    prevId: string;
    tables: Record<string, {
      columns: Record<string, unknown>;
      indexes: Record<string, unknown>;
      foreignKeys: Record<string, unknown>;
    }>;
  };
  assert.equal(businessWorkspaceIdentityEntry.idx, 34);
  assert.equal(
    businessWorkspaceIdentityEntry.tag,
    "0034_business_workspace_identity",
  );
  assert.equal(snapshot.prevId, previous.id);
  assert.equal(Object.keys(snapshot.tables).length, 86);
  for (const column of [
    "full_name",
    "short_name",
    "created_by_user_id",
    "creation_request_id",
  ]) assert.ok(snapshot.tables.workspaces.columns[column]);
  assert.ok(
    snapshot.tables.workspaces.indexes.workspaces_creation_request_uidx,
  );

  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries.filter(({ idx }) => idx < 34)) {
      applyMigration(db, entry);
    }
    const now = "2026-07-30T00:00:00.000Z";
    const insert = db.prepare(`
      INSERT INTO workspaces (id,type,name,locale,created_at,updated_at)
      VALUES (?,?,?,?,?,?)
    `);
    insert.run("business-long-34", "business", "Ю".repeat(240), "ru", now, now);
    insert.run("business-short-34", "business", "X", "ru", now, now);
    insert.run("personal-34", "individual", "P", "ru", now, now);

    applyMigration(db, businessWorkspaceIdentityEntry);
    const long = db.prepare(`
      SELECT length(full_name) AS fullLength,length(short_name) AS shortLength
      FROM workspaces WHERE id='business-long-34'
    `).get() as { fullLength: number; shortLength: number };
    assert.equal(long.fullLength, 200);
    assert.equal(long.shortLength, 80);
    const short = db.prepare(`
      SELECT full_name AS fullName,short_name AS shortName
      FROM workspaces WHERE id='business-short-34'
    `).get() as { fullName: string; shortName: string };
    assert.equal(short.fullName, "Business");
    assert.equal(short.shortName, "Business");
    const personal = db.prepare(`
      SELECT full_name AS fullName,short_name AS shortName
      FROM workspaces WHERE id='personal-34'
    `).get() as { fullName: string | null; shortName: string | null };
    assert.equal(personal.fullName, null);
    assert.equal(personal.shortName, null);
    assert.throws(
      () => db.prepare(`
        INSERT INTO workspaces (id,type,name,locale,created_at,updated_at)
        VALUES ('invalid-business-34','business','Invalid','ru',?,?)
      `).run(now, now),
      /WORKSPACE_BUSINESS_IDENTITY_REQUIRED/,
    );
    db.prepare(`
      INSERT INTO workspaces (
        id,type,name,full_name,short_name,creation_request_id,
        locale,created_at,updated_at
      ) VALUES ('request-a-34','business','A business','A business','AB',
        '11111111-1111-4111-8111-111111111111','ru',?,?)
    `).run(now, now);
    assert.throws(
      () => db.prepare(`
        INSERT INTO workspaces (
          id,type,name,full_name,short_name,creation_request_id,
          locale,created_at,updated_at
        ) VALUES ('request-b-34','business','B business','B business','BB',
          '11111111-1111-4111-8111-111111111111','ru',?,?)
      `).run(now, now),
      /UNIQUE constraint failed/,
    );
    assert.equal(tableDefinitions(db).size, 112);
    assert.equal(foreignKeyCount(db), 158);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0035 adds current legal-source activation and append-only lifecycle evidence", () => {
  const sql = migrationSql(legalSourcePublicationLifecycleEntry);
  assert.equal(statements(sql).length, 18);
  for (const pattern of [
    /CREATE TABLE `legal_source_current_activations`/,
    /CREATE TABLE `legal_source_lifecycle_events`/,
    /legal_source_lifecycle_events_insert_guard/,
    /legal_source_lifecycle_events_update_guard/,
    /legal_source_lifecycle_events_delete_guard/,
    /legal_source_current_activations_insert_guard/,
    /legal_source_current_activations_update_guard/,
    /legal_source_current_activations_delete_guard/,
    /prior_replacement/,
    /prior_withdrawal/,
  ]) {
    assert.match(sql, pattern);
  }
  const snapshot = JSON.parse(readFileSync(
    new URL("meta/0035_snapshot.json", drizzleRoot),
    "utf8",
  )) as {
    tables: Record<string, {
      columns: Record<string, unknown>;
      foreignKeys: Record<string, unknown>;
    }>;
  };
  assert.deepEqual(
    Object.keys(snapshot.tables.legal_source_current_activations.columns),
    [
      "source_id",
      "publication_id",
      "version_id",
      "activated_by_user_id",
      "activated_at",
      "updated_at",
    ],
  );
  assert.equal(
    Object.keys(snapshot.tables.legal_source_current_activations.foreignKeys)
      .length,
    4,
  );
  assert.equal(
    Object.keys(snapshot.tables.legal_source_lifecycle_events.foreignKeys)
      .length,
    6,
  );
});

test("0036 accepts current Lex URL shapes without weakening source guards", () => {
  const sql = migrationSql(legalSourceCurrentUrlGuardEntry);
  assert.equal(statements(sql).length, 2);
  assert.match(sql, /DROP TRIGGER `legal_source_fetch_requests_insert_guard`/);
  assert.match(sql, /CREATE TRIGGER `legal_source_fetch_requests_insert_guard`/);
  assert.match(sql, /NEW.`canonical_id` <>/);

  const previous = JSON.parse(readFileSync(
    new URL("meta/0035_snapshot.json", drizzleRoot),
    "utf8",
  )) as { id: string; tables: Record<string, unknown> };
  const snapshot = JSON.parse(readFileSync(
    new URL("meta/0036_snapshot.json", drizzleRoot),
    "utf8",
  )) as {
    id: string;
    prevId: string;
    tables: Record<string, unknown>;
  };
  assert.equal(snapshot.prevId, previous.id);
  assert.deepEqual(snapshot.tables, previous.tables);

  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    const now = "2026-07-30T13:45:00.000Z";
    const insert = db.prepare(`
      INSERT INTO legal_source_fetch_requests (
        id, environment, source_kind, locale, requested_url, canonical_id,
        idempotency_key, status, attempt_count, created_at, updated_at
      ) VALUES (?, 'staging', 'lex', ?, ?, ?, ?, 'queued', 0, ?, ?)
    `);

    insert.run(
      "current-ru-positive",
      "ru",
      "https://lex.uz/ru/docs/8282675",
      "8282675",
      "current-ru-positive-key",
      now,
      now,
    );
    insert.run(
      "current-uz-negative",
      "uz",
      "https://lex.uz/uz/docs/-8283652",
      "-8283652",
      "current-uz-negative-key",
      now,
      now,
    );
    assert.equal(
      db.prepare(`
        SELECT count(*) AS count
        FROM legal_source_fetch_requests
        WHERE id IN ('current-ru-positive','current-uz-negative')
      `).get()!.count,
      2,
    );

    for (const [id, url, canonicalId] of [
      ["canonical-mismatch", "https://lex.uz/ru/docs/8282675", "-8282675"],
      ["plus-sign", "https://lex.uz/ru/docs/+42", "+42"],
      ["double-minus", "https://lex.uz/ru/docs/--42", "--42"],
      ["trailing-slash", "https://lex.uz/ru/docs/42/", "42/"],
      ["query", "https://lex.uz/ru/docs/42?download=1", "42"],
      ["foreign-host", "https://lex.uz.evil.example/ru/docs/42", "42"],
    ]) {
      assert.throws(
        () => insert.run(
          id,
          "ru",
          url,
          canonicalId,
          `${id}-key`,
          now,
          now,
        ),
        /legal source fetch request URL invalid/,
      );
    }
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("0038 accepts only current Advice RU and Uzbek Latin document URLs", () => {
  const sql = migrationSql(legalSourceAdviceUrlGuardEntry);
  assert.equal(statements(sql).length, 2);
  assert.match(sql, /DROP TRIGGER `legal_source_fetch_requests_insert_guard`/);
  assert.match(sql, /https:\/\/advice\.uz\/ru\/documents\//);
  assert.match(sql, /https:\/\/advice\.uz\/oz\/documents\//);
  assert.doesNotMatch(sql, /advice\.uz\/.*\/questions\//);

  const previous = JSON.parse(readFileSync(
    new URL("meta/0037_snapshot.json", drizzleRoot),
    "utf8",
  )) as { id: string; tables: Record<string, unknown> };
  const snapshot = JSON.parse(readFileSync(
    new URL("meta/0038_snapshot.json", drizzleRoot),
    "utf8",
  )) as {
    id: string;
    prevId: string;
    tables: Record<string, unknown>;
  };
  assert.equal(snapshot.prevId, previous.id);
  assert.deepEqual(snapshot.tables, previous.tables);

  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const entry of journal.entries) applyMigration(db, entry);
    const now = "2026-07-31T01:15:00.000Z";
    const insert = db.prepare(`
      INSERT INTO legal_source_fetch_requests (
        id, environment, source_kind, locale, requested_url, canonical_id,
        idempotency_key, status, attempt_count, created_at, updated_at
      ) VALUES (?, 'staging', 'advice', ?, ?, ?, ?, 'queued', 0, ?, ?)
    `);

    insert.run(
      "advice-current-ru",
      "ru",
      "https://advice.uz/ru/documents/1744",
      "1744",
      "advice-current-ru-key",
      now,
      now,
    );
    insert.run(
      "advice-current-uz-latin",
      "uz",
      "https://advice.uz/oz/documents/624",
      "624",
      "advice-current-uz-key",
      now,
      now,
    );
    assert.equal(
      db.prepare(`
        SELECT count(*) AS count
        FROM legal_source_fetch_requests
        WHERE id IN ('advice-current-ru','advice-current-uz-latin')
      `).get()!.count,
      2,
    );

    for (const [id, locale, url, canonicalId] of [
      ["legacy-question", "ru", "https://advice.uz/ru/questions/1744", "1744"],
      ["cyrillic-route", "uz", "https://advice.uz/uz/documents/624", "624"],
      ["locale-mismatch", "uz", "https://advice.uz/ru/documents/624", "624"],
      ["canonical-mismatch", "ru", "https://advice.uz/ru/documents/1744", "1745"],
      ["trailing-slash", "ru", "https://advice.uz/ru/documents/1744/", "1744"],
      ["query", "ru", "https://advice.uz/ru/documents/1744?print=1", "1744"],
      ["non-digits", "ru", "https://advice.uz/ru/documents/17a44", "17a44"],
      ["foreign-host", "ru", "https://advice.uz.evil.example/ru/documents/1744", "1744"],
    ]) {
      assert.throws(
        () => insert.run(
          id,
          locale,
          url,
          canonicalId,
          `${id}-key`,
          now,
          now,
        ),
        /legal source fetch request URL invalid/,
      );
    }
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
