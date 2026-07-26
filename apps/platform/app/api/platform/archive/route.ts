import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const [documents, cases] = await db.batch([
    db.prepare(
      `SELECT DISTINCT d.id,d.title,d.category,d.status,d.archived_at AS archivedAt,d.updated_at AS updatedAt,
        CASE WHEN d.owner_user_id=? THEN 1 ELSE 0 END AS canRestore
       FROM documents d LEFT JOIN document_collaborators c ON c.document_id=d.id AND c.user_id=? AND c.status<>'revoked'
       WHERE d.workspace_id=? AND d.status='Архив' AND (d.owner_user_id=? OR c.user_id=?)
       ORDER BY d.archived_at DESC`,
    ).bind(user.id, user.id, workspace.id, user.id, user.id),
    db.prepare("SELECT id,title,legal_area AS legalArea,status,archived_at AS archivedAt,updated_at AS updatedAt FROM cases WHERE workspace_id=? AND archived_at IS NOT NULL ORDER BY archived_at DESC").bind(workspace.id),
  ]);
  return response({ documents: documents.results, cases: cases.results });
});

export const PATCH = withApiErrors(async function PATCH(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const body = await request.json().catch(() => null) as { type?: string; id?: string } | null;
  if (!body?.id || !["document", "case"].includes(body.type ?? "")) return response({ error: "Некорректный объект архива." }, 400);
  const now = isoNow();
  const db = requireD1();
  if (body.type === "document") {
    const result = await db.prepare(
      "UPDATE documents SET status='Готов',archived_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=? AND status='Архив'",
    ).bind(now, body.id, workspace.id, user.id).run();
    if (!result.meta.changes) return response({ error: "Документ не найден или нет права восстановления." }, 403);
    await db.prepare("INSERT INTO activity_events (id,document_id,actor_user_id,type,metadata_json,created_at) VALUES (?,?,?,'document_restored',?,?)")
      .bind(crypto.randomUUID(), body.id, user.id, JSON.stringify({ shareLinksReactivated: false }), now).run();
  } else {
    const result = await db.prepare("UPDATE cases SET archived_at=NULL,status='open',updated_at=? WHERE id=? AND workspace_id=? AND archived_at IS NOT NULL")
      .bind(now, body.id, workspace.id).run();
    if (!result.meta.changes) return response({ error: "Дело не найдено." }, 404);
    await db.prepare("INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'case_restored',NULL,?)")
      .bind(crypto.randomUUID(), body.id, user.id, now).run();
  }
  return response({ ok: true });
});
