export type WorkspaceRouteOption = {
  id: string;
  name: string;
  type: "individual" | "business";
  role: string;
};

export type WorkspaceRouteSource =
  | "canonical_business_route"
  | "workspace_switcher";

type WorkspaceAccessRow = {
  id: string;
  name: string;
  type: string;
  role: string;
  defaultWorkspaceId: string | null;
};

export async function workspaceForUserByIdInDatabase(
  db: D1Database,
  userId: string,
  workspaceId: string,
  options: { activate?: boolean; source?: WorkspaceRouteSource } = {},
): Promise<WorkspaceRouteOption | null> {
  const target = await db.prepare(
    `SELECT w.id,w.name,w.type,m.role,
      p.default_workspace_id AS defaultWorkspaceId
     FROM workspace_members m
     JOIN workspaces w ON w.id=m.workspace_id
     JOIN user_profiles p ON p.id=m.user_id
     WHERE w.id=? AND m.user_id=? AND m.status='active' LIMIT 1`,
  ).bind(workspaceId, userId).first<WorkspaceAccessRow>();
  if (!target) return null;

  if (options.activate && target.defaultWorkspaceId !== target.id) {
    const now = new Date().toISOString();
    const source = options.source ?? "canonical_business_route";
    const results = await db.batch([
      db.prepare(
        `UPDATE user_profiles SET default_workspace_id=?,updated_at=?
         WHERE id=? AND EXISTS (
           SELECT 1 FROM workspace_members
           WHERE workspace_id=? AND user_id=? AND status='active'
         ) RETURNING id`,
      ).bind(target.id, now, userId, target.id, userId),
      db.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         SELECT ?,?,?,'workspace',?,'workspace_selected',?,?
         WHERE EXISTS (
           SELECT 1 FROM workspace_members
           WHERE workspace_id=? AND user_id=? AND status='active'
         )`,
      ).bind(
        crypto.randomUUID(),
        target.id,
        userId,
        target.id,
        JSON.stringify({
          source,
          previousWorkspaceId: target.defaultWorkspaceId,
          targetWorkspaceType: target.type,
          role: target.role,
        }),
        now,
        target.id,
        userId,
      ),
    ]);
    if ((results[0]?.results.length ?? 0) !== 1) return null;
  }

  return {
    id: target.id,
    name: target.name,
    type: target.type === "business" ? "business" : "individual",
    role: target.role,
  };
}
