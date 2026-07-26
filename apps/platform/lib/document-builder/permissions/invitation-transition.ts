export async function acceptDocumentInvitation(
  db: D1Database,
  input: {
    invitationId: string;
    documentId: string;
    userId: string;
    now: string;
  },
): Promise<boolean> {
  const collaboratorId = crypto.randomUUID();
  const activityId = `document-invitation:${input.invitationId}:accepted`;
  const results = await db.batch([
    db.prepare(`
      UPDATE document_invitations
      SET target_user_id = ?,
          accepted_at = ?,
          updated_at = ?
      WHERE id = ?
        AND document_id = ?
        AND accepted_at IS NULL
        AND declined_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > ?
        AND (target_user_id IS NULL OR target_user_id = ?)
      RETURNING id
    `).bind(
      input.userId,
      input.now,
      input.now,
      input.invitationId,
      input.documentId,
      input.now,
      input.userId,
    ),
    db.prepare(`
      INSERT INTO document_collaborators (
        id,
        document_id,
        user_id,
        invited_by_user_id,
        role,
        party_number,
        permission_set_json,
        invitation_status,
        approval_status,
        can_view,
        can_download,
        status,
        opened_at,
        confirmed_at,
        joined_at,
        revoked_at,
        created_at,
        updated_at
      )
      SELECT
        ?,
        i.document_id,
        ?,
        i.invited_by_user_id,
        i.role,
        i.party_number,
        NULL,
        'accepted',
        'pending',
        1,
        0,
        'active',
        NULL,
        NULL,
        ?,
        NULL,
        ?,
        ?
      FROM document_invitations i
      WHERE i.id = ?
        AND i.document_id = ?
        AND i.target_user_id = ?
        AND i.accepted_at = ?
      ON CONFLICT(document_id, user_id) DO UPDATE SET
        invited_by_user_id = excluded.invited_by_user_id,
        role = excluded.role,
        party_number = excluded.party_number,
        permission_set_json = NULL,
        invitation_status = 'accepted',
        approval_status = 'pending',
        can_view = 1,
        can_download = 0,
        status = 'active',
        opened_at = NULL,
        confirmed_at = NULL,
        joined_at = excluded.joined_at,
        revoked_at = NULL,
        updated_at = excluded.updated_at
    `).bind(
      collaboratorId,
      input.userId,
      input.now,
      input.now,
      input.now,
      input.invitationId,
      input.documentId,
      input.userId,
      input.now,
    ),
    db.prepare(`
      INSERT OR IGNORE INTO activity_events (
        id, document_id, actor_user_id, type, metadata_json, created_at
      )
      SELECT
        ?,
        i.document_id,
        ?,
        'invitation_accepted',
        json_object(
          'role',
          i.role,
          'partyNumber',
          COALESCE(i.party_number, 0)
        ),
        ?
      FROM document_invitations i
      WHERE i.id = ?
        AND i.document_id = ?
        AND i.target_user_id = ?
        AND i.accepted_at = ?
    `).bind(
      activityId,
      input.userId,
      input.now,
      input.invitationId,
      input.documentId,
      input.userId,
      input.now,
    ),
  ]);
  return (results[0]?.results.length ?? 0) === 1;
}

export async function declineDocumentInvitation(
  db: D1Database,
  input: {
    invitationId: string;
    documentId: string;
    userId: string;
    now: string;
  },
): Promise<boolean> {
  const activityId = `document-invitation:${input.invitationId}:declined`;
  const results = await db.batch([
    db.prepare(`
      UPDATE document_invitations
      SET target_user_id = ?,
          declined_at = ?,
          updated_at = ?
      WHERE id = ?
        AND document_id = ?
        AND accepted_at IS NULL
        AND declined_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > ?
        AND (target_user_id IS NULL OR target_user_id = ?)
      RETURNING id
    `).bind(
      input.userId,
      input.now,
      input.now,
      input.invitationId,
      input.documentId,
      input.now,
      input.userId,
    ),
    db.prepare(`
      INSERT OR IGNORE INTO activity_events (
        id, document_id, actor_user_id, type, metadata_json, created_at
      )
      SELECT
        ?,
        i.document_id,
        ?,
        'invitation_declined',
        NULL,
        ?
      FROM document_invitations i
      WHERE i.id = ?
        AND i.document_id = ?
        AND i.target_user_id = ?
        AND i.declined_at = ?
    `).bind(
      activityId,
      input.userId,
      input.now,
      input.invitationId,
      input.documentId,
      input.userId,
      input.now,
    ),
    db.prepare(`
      UPDATE document_collaborators
      SET invitation_status = 'declined',
          approval_status = 'revoked',
          can_view = 0,
          can_download = 0,
          status = 'revoked',
          revoked_at = ?,
          updated_at = ?
      WHERE document_id = ?
        AND user_id = ?
        AND invitation_status = 'invited'
        AND EXISTS (
          SELECT 1
          FROM document_invitations i
          WHERE i.id = ?
            AND i.document_id = ?
            AND i.target_user_id = ?
            AND i.declined_at = ?
        )
    `).bind(
      input.now,
      input.now,
      input.documentId,
      input.userId,
      input.invitationId,
      input.documentId,
      input.userId,
      input.now,
    ),
  ]);
  return (results[0]?.results.length ?? 0) === 1;
}
