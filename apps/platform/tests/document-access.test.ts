import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ACCEPTED_COLLABORATOR_JOIN_SQL,
  documentListScope,
  isAcceptedDocumentCollaborator,
  isActiveWorkspaceDocumentOwner,
  type DocumentListFolder,
} from "../lib/document-builder/permissions/collaboration-policy";
import {
  acceptDocumentInvitation,
  declineDocumentInvitation,
} from "../lib/document-builder/permissions/invitation-transition";

test("collaborator access remains closed until invitation acceptance", () => {
  assert.equal(isAcceptedDocumentCollaborator({
    invitationStatus: "invited",
    status: "invited",
    canView: 1,
  }), false);
  assert.equal(isAcceptedDocumentCollaborator({
    invitationStatus: "accepted",
    status: "active",
    canView: 0,
  }), false);
  for (const status of ["active", "opened", "confirmed"]) {
    assert.equal(isAcceptedDocumentCollaborator({
      invitationStatus: "accepted",
      status,
      canView: 1,
    }), true);
  }
  assert.equal(isAcceptedDocumentCollaborator({
    invitationStatus: "revoked",
    status: "revoked",
    canView: 1,
  }), false);
});

test("owner access is bound to the active workspace", () => {
  assert.equal(isActiveWorkspaceDocumentOwner({
    documentOwnerUserId: "user-current",
    requestingUserId: "user-current",
    documentWorkspaceId: "workspace-active",
    activeWorkspaceId: "workspace-active",
  }), true);
  assert.equal(isActiveWorkspaceDocumentOwner({
    documentOwnerUserId: "user-current",
    requestingUserId: "user-current",
    documentWorkspaceId: "workspace-other",
    activeWorkspaceId: "workspace-active",
  }), false);
  assert.equal(isActiveWorkspaceDocumentOwner({
    documentOwnerUserId: "user-current",
    requestingUserId: "user-current",
    documentWorkspaceId: null,
    activeWorkspaceId: "workspace-active",
  }), false);
});

function visibleDocuments(folder: DocumentListFolder): string[] {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        owner_user_id TEXT NOT NULL
      );
      CREATE TABLE document_collaborators (
        document_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        invitation_status TEXT NOT NULL,
        can_view INTEGER NOT NULL,
        status TEXT NOT NULL
      );
      INSERT INTO documents VALUES
        ('active-owned', 'workspace-active', 'user-current'),
        ('other-owned', 'workspace-other', 'user-current'),
        ('active-shared', 'workspace-active', 'user-owner-a'),
        ('external-shared', 'workspace-external', 'user-owner-b'),
        ('external-invited', 'workspace-external', 'user-owner-c'),
        ('external-revoked', 'workspace-external', 'user-owner-d');
      INSERT INTO document_collaborators VALUES
        ('active-shared', 'user-current', 'accepted', 1, 'opened'),
        ('external-shared', 'user-current', 'accepted', 1, 'active'),
        ('external-invited', 'user-current', 'invited', 1, 'invited'),
        ('external-revoked', 'user-current', 'accepted', 1, 'revoked');
    `);
    const scope = documentListScope(
      folder,
      "user-current",
      "workspace-active",
    );
    const rows = database.prepare(`
      SELECT DISTINCT d.id
      FROM documents d
      LEFT JOIN document_collaborators c
        ON c.document_id = d.id AND ${ACCEPTED_COLLABORATOR_JOIN_SQL}
      WHERE ${scope.clauses.join(" AND ")}
      ORDER BY d.id
    `).all(...scope.bindings) as Array<{ id: string }>;
    return rows.map(({ id }) => id);
  } finally {
    database.close();
  }
}

test("ordinary document folders are isolated to the active workspace", () => {
  assert.deepEqual(visibleDocuments("all"), [
    "active-owned",
    "active-shared",
  ]);
  assert.equal(
    documentListScope("all", "user-current", "workspace-active")
      .includeStandaloneFiles,
    true,
  );
});

test("external accepted grants appear only in the explicit shared scope", () => {
  assert.deepEqual(visibleDocuments("shared"), [
    "active-shared",
    "external-shared",
  ]);
  assert.equal(
    documentListScope("shared", "user-current", "workspace-active")
      .includeStandaloneFiles,
    false,
  );
});

class SqliteD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.sql, values);
  }

  execute<T>(): {
    results: T[];
    success: true;
    meta: { changes: number };
  } {
    const bindings = this.values as Array<null | number | bigint | string>;
    const statement = this.database.prepare(this.sql);
    if (/\bRETURNING\b/i.test(this.sql)) {
      const results = statement.all(...bindings) as T[];
      const changes = Number((
        this.database.prepare("SELECT changes() AS value").get() as {
          value: number | bigint;
        }
      ).value);
      return { results, success: true, meta: { changes } };
    }
    const result = statement.run(...bindings);
    return {
      results: [],
      success: true,
      meta: { changes: Number(result.changes) },
    };
  }
}

function invitationDatabase(): {
  sqlite: DatabaseSync;
  d1: D1Database;
} {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE document_invitations (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      invited_by_user_id TEXT NOT NULL,
      target_user_id TEXT,
      role TEXT NOT NULL,
      party_number INTEGER,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      declined_at TEXT,
      revoked_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE document_collaborators (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      invited_by_user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      party_number INTEGER,
      permission_set_json TEXT,
      invitation_status TEXT NOT NULL,
      approval_status TEXT NOT NULL,
      can_view INTEGER NOT NULL,
      can_download INTEGER NOT NULL,
      status TEXT NOT NULL,
      opened_at TEXT,
      confirmed_at TEXT,
      joined_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(document_id, user_id)
    );
    CREATE TABLE activity_events (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      actor_user_id TEXT,
      type TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const d1 = {
    prepare(sql: string) {
      return new SqliteD1Statement(sqlite, sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) =>
          (statement as unknown as SqliteD1Statement).execute()
        );
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, d1 };
}

function insertInvitation(sqlite: DatabaseSync): void {
  sqlite.prepare(`
    INSERT INTO document_invitations (
      id, document_id, invited_by_user_id, target_user_id, role, party_number,
      expires_at, accepted_at, declined_at, revoked_at, updated_at
    ) VALUES (
      'invitation-1', 'document-1', 'owner-1', 'invitee-1',
      'counterparty', 2, '2999-01-01T00:00:00.000Z',
      NULL, NULL, NULL, '2026-07-26T00:00:00.000Z'
    )
  `).run();
  sqlite.prepare(`
    INSERT INTO document_collaborators (
      id, document_id, user_id, invited_by_user_id, role, party_number,
      permission_set_json, invitation_status, approval_status, can_view,
      can_download, status, opened_at, confirmed_at, joined_at, revoked_at,
      created_at, updated_at
    ) VALUES (
      'collaborator-1', 'document-1', 'invitee-1', 'owner-1',
      'counterparty', 2, NULL, 'invited', 'pending', 0, 0, 'invited',
      NULL, NULL, NULL, NULL,
      '2026-07-26T00:00:00.000Z', '2026-07-26T00:00:00.000Z'
    )
  `).run();
}

test("concurrent invitation acceptance grants access exactly once", async () => {
  const { sqlite, d1 } = invitationDatabase();
  try {
    insertInvitation(sqlite);
    const input = {
      invitationId: "invitation-1",
      documentId: "document-1",
      userId: "invitee-1",
      now: "2026-07-26T12:00:00.000Z",
    };
    const results = await Promise.all([
      acceptDocumentInvitation(d1, input),
      acceptDocumentInvitation(d1, input),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    const invitation = sqlite.prepare(`
      SELECT target_user_id AS targetUserId, accepted_at AS acceptedAt
      FROM document_invitations WHERE id = 'invitation-1'
    `).get() as { targetUserId: string; acceptedAt: string };
    assert.deepEqual({ ...invitation }, {
      targetUserId: "invitee-1",
      acceptedAt: input.now,
    });
    const collaborator = sqlite.prepare(`
      SELECT invitation_status AS invitationStatus, status, can_view AS canView
      FROM document_collaborators
      WHERE document_id = 'document-1' AND user_id = 'invitee-1'
    `).get() as {
      invitationStatus: string;
      status: string;
      canView: number;
    };
    assert.deepEqual({ ...collaborator }, {
      invitationStatus: "accepted",
      status: "active",
      canView: 1,
    });
    assert.equal(
      (
        sqlite.prepare(`
          SELECT count(*) AS total
          FROM activity_events
          WHERE id = 'document-invitation:invitation-1:accepted'
        `).get() as { total: number }
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("declining an invitation disables its pending collaborator grant", async () => {
  const { sqlite, d1 } = invitationDatabase();
  try {
    insertInvitation(sqlite);
    const declined = await declineDocumentInvitation(d1, {
      invitationId: "invitation-1",
      documentId: "document-1",
      userId: "invitee-1",
      now: "2026-07-26T12:00:00.000Z",
    });
    assert.equal(declined, true);
    const collaborator = sqlite.prepare(`
      SELECT invitation_status AS invitationStatus, status, can_view AS canView
      FROM document_collaborators
      WHERE document_id = 'document-1' AND user_id = 'invitee-1'
    `).get() as {
      invitationStatus: string;
      status: string;
      canView: number;
    };
    assert.deepEqual({ ...collaborator }, {
      invitationStatus: "declined",
      status: "revoked",
      canView: 0,
    });
    assert.equal(
      (
        sqlite.prepare(`
          SELECT count(*) AS total
          FROM activity_events
          WHERE id = 'document-invitation:invitation-1:declined'
        `).get() as { total: number }
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("accept and decline race to one terminal invitation state", async () => {
  const { sqlite, d1 } = invitationDatabase();
  try {
    insertInvitation(sqlite);
    const input = {
      invitationId: "invitation-1",
      documentId: "document-1",
      userId: "invitee-1",
      now: "2026-07-26T12:00:00.000Z",
    };
    const results = await Promise.all([
      acceptDocumentInvitation(d1, input),
      declineDocumentInvitation(d1, input),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    const invitation = sqlite.prepare(`
      SELECT accepted_at AS acceptedAt, declined_at AS declinedAt
      FROM document_invitations
      WHERE id = 'invitation-1'
    `).get() as {
      acceptedAt: string | null;
      declinedAt: string | null;
    };
    assert.equal(
      Number(Boolean(invitation.acceptedAt)) +
        Number(Boolean(invitation.declinedAt)),
      1,
    );
    assert.equal(
      (
        sqlite.prepare(`
          SELECT count(*) AS total
          FROM activity_events
          WHERE id LIKE 'document-invitation:invitation-1:%'
        `).get() as { total: number }
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("failed invitation audit write rolls back the grant claim", async () => {
  const { sqlite, d1 } = invitationDatabase();
  try {
    insertInvitation(sqlite);
    sqlite.exec(`
      CREATE TRIGGER reject_invitation_activity
      BEFORE INSERT ON activity_events
      BEGIN
        SELECT RAISE(ABORT, 'audit unavailable');
      END;
    `);
    await assert.rejects(
      acceptDocumentInvitation(d1, {
        invitationId: "invitation-1",
        documentId: "document-1",
        userId: "invitee-1",
        now: "2026-07-26T12:00:00.000Z",
      }),
      /audit unavailable/,
    );
    const invitation = sqlite.prepare(`
      SELECT accepted_at AS acceptedAt
      FROM document_invitations
      WHERE id = 'invitation-1'
    `).get() as { acceptedAt: string | null };
    assert.equal(invitation.acceptedAt, null);
    const collaborator = sqlite.prepare(`
      SELECT invitation_status AS invitationStatus, can_view AS canView
      FROM document_collaborators
      WHERE document_id = 'document-1' AND user_id = 'invitee-1'
    `).get() as { invitationStatus: string; canView: number };
    assert.deepEqual({ ...collaborator }, {
      invitationStatus: "invited",
      canView: 0,
    });
  } finally {
    sqlite.close();
  }
});
