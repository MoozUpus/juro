import { z } from "zod";

const safeBusinessName = (maximum: number) => z.string()
  .trim()
  .min(2)
  .max(maximum)
  .refine(value => !/[\u0000-\u001f\u007f]/u.test(value))
  .transform(value => value.replace(/\s+/gu, " "));

export const createBusinessWorkspaceInputSchema = z.object({
  action: z.literal("create"),
  requestId: z.string().uuid(),
  fullName: safeBusinessName(200),
  shortName: safeBusinessName(80),
  locale: z.enum(["ru", "uz"]).default("ru"),
}).strict();

export type CreateBusinessWorkspaceInput = z.infer<
  typeof createBusinessWorkspaceInputSchema
>;

type WorkspaceCreationRow = {
  id: string;
  fullName: string;
  shortName: string;
};

export class WorkspaceCreationConflictError extends Error {
  constructor() {
    super("WORKSPACE_CREATION_CONFLICT");
    this.name = "WorkspaceCreationConflictError";
  }
}

function idsForRequest(requestId: string) {
  const compact = requestId.replaceAll("-", "");
  return {
    workspaceId: `ws_${compact}`,
    membershipId: `wm_${compact}`,
    auditId: `wa_${compact}`,
  };
}

async function creationForRequest(
  db: D1Database,
  userId: string,
  requestId: string,
): Promise<WorkspaceCreationRow | null> {
  return db.prepare(
    `SELECT workspace.id,
      workspace.full_name AS fullName,
      workspace.short_name AS shortName
     FROM workspaces workspace
     JOIN workspace_members member
       ON member.workspace_id=workspace.id
      AND member.user_id=?
      AND member.role='owner'
      AND member.status='active'
     WHERE workspace.type='business'
       AND workspace.created_by_user_id=?
       AND workspace.creation_request_id=?
     LIMIT 1`,
  ).bind(userId, userId, requestId).first<WorkspaceCreationRow>();
}

export async function createBusinessWorkspaceInDatabase(
  db: D1Database,
  userId: string,
  input: CreateBusinessWorkspaceInput,
  now = new Date().toISOString(),
) {
  const replay = await creationForRequest(db, userId, input.requestId);
  if (replay) {
    if (replay.fullName !== input.fullName || replay.shortName !== input.shortName) {
      throw new WorkspaceCreationConflictError();
    }
    return { ...replay, name: replay.shortName, type: "business" as const, role: "owner", created: false };
  }

  const { workspaceId, membershipId, auditId } = idsForRequest(input.requestId);
  const result = await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO workspaces
       (id,type,name,full_name,short_name,created_by_user_id,
        creation_request_id,locale,created_at,updated_at)
       VALUES (?,'business',?,?,?,?,?,?,?,?)`,
    ).bind(
      workspaceId,
      input.shortName,
      input.fullName,
      input.shortName,
      userId,
      input.requestId,
      input.locale,
      now,
      now,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO workspace_members
       (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at)
       SELECT ?,workspace.id,?,'owner','active',?,?,?
       FROM workspaces workspace
       WHERE workspace.id=?
         AND workspace.created_by_user_id=?
         AND workspace.creation_request_id=?`,
    ).bind(
      membershipId,
      userId,
      now,
      now,
      now,
      workspaceId,
      userId,
      input.requestId,
    ),
    db.prepare(
      `UPDATE user_profiles
       SET default_workspace_id=?,updated_at=?
       WHERE id=? AND EXISTS (
         SELECT 1 FROM workspace_members
         WHERE workspace_id=? AND user_id=? AND role='owner' AND status='active'
       )`,
    ).bind(workspaceId, now, userId, workspaceId, userId),
    db.prepare(
      `INSERT OR IGNORE INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,
        metadata_json,created_at)
       SELECT ?,workspace.id,?,'workspace',workspace.id,
        'business_workspace_created',?,?
       FROM workspaces workspace
       WHERE workspace.id=?
         AND workspace.created_by_user_id=?
         AND workspace.creation_request_id=?
         AND EXISTS (
           SELECT 1 FROM workspace_members
           WHERE workspace_id=workspace.id AND user_id=?
             AND role='owner' AND status='active'
         )`,
    ).bind(
      auditId,
      userId,
      JSON.stringify({ source: "settings", workspaceType: "business" }),
      now,
      workspaceId,
      userId,
      input.requestId,
      userId,
    ),
  ]);

  const created = Number(result[0]?.meta?.changes ?? 0) === 1;
  const workspace = await creationForRequest(db, userId, input.requestId);
  if (!workspace) throw new WorkspaceCreationConflictError();
  if (workspace.fullName !== input.fullName || workspace.shortName !== input.shortName) {
    throw new WorkspaceCreationConflictError();
  }
  return { ...workspace, name: workspace.shortName, type: "business" as const, role: "owner", created };
}
