import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const body = await request.json().catch(() => null) as { confirmation?: string; reason?: string } | null;
  if (body?.confirmation !== "DELETE") return Response.json({ error: "Введите DELETE для подтверждения запроса." }, { status: 400 });
  const db = requireD1();
  const existing = await db.prepare("SELECT id,status,requested_at AS requestedAt FROM account_deletion_requests WHERE user_id=? AND status IN ('requested','reviewing') ORDER BY requested_at DESC LIMIT 1").bind(user.id).first();
  if (existing) return Response.json({ error: "Запрос на удаление уже зарегистрирован.", request: existing }, { status: 409 });
  const now = isoNow();
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO account_deletion_requests (id,user_id,status,reason,requested_at) VALUES (?,?,'requested',?,?)").bind(id, user.id, body?.reason?.trim().slice(0, 500) || null, now),
    db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,created_at) VALUES (?,?,?,'user',?,'account_deletion_requested',?)").bind(crypto.randomUUID(), workspace.id, user.id, user.id, now),
  ]);
  return Response.json({ ok: true, requestId: id, status: "requested" }, { status: 201, headers: { "cache-control": "private, no-store" } });
});
