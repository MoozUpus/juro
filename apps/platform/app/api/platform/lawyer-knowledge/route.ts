import { z } from "zod";
import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";

const kind = z.enum(["ai_answer", "legal_position", "source", "template", "clause", "monitoring", "note", "document"]);
const sourceUrl = z.url().max(2_048).refine((value) => {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === "lex.uz" || hostname === "www.lex.uz";
}, "LEX_UZ_SOURCE_REQUIRED");
const createInput = z.object({
  kind,
  title: z.string().trim().min(2).max(240),
  content: z.string().trim().min(1).max(20_000),
  sourceUrl: sourceUrl.optional(),
  folder: z.string().trim().min(1).max(120),
  tags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  favorite: z.boolean().default(false),
  caseId: z.string().uuid().optional(),
}).strict();
const updateInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("favorite"), itemId: z.string().uuid(), favorite: z.boolean() }).strict(),
  z.object({ action: z.literal("archive"), itemId: z.string().uuid() }).strict(),
]);

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

async function requireLawyer(userId: string) {
  return requireD1().prepare("SELECT id FROM lawyer_profiles WHERE user_id=? LIMIT 1").bind(userId).first();
}

async function mayLinkCase(userId: string, caseId: string) {
  const now = new Date().toISOString();
  return requireD1().prepare(
    `SELECT r.requester_user_id AS clientUserId FROM lawyer_access_grants g
     JOIN lawyer_requests r ON r.id=g.lawyer_request_id
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=?
     WHERE g.lawyer_user_id=? AND g.case_id=? AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at>?) LIMIT 1`,
  ).bind(userId, userId, caseId, now).first();
}

async function list(userId: string) {
  const rows = await requireD1().prepare(
    `SELECT k.id,k.case_id AS caseId,c.title AS caseTitle,k.kind,k.title,k.content,
      k.client_user_id AS clientUserId,client.full_name AS clientName,
      k.source_url AS sourceUrl,k.folder,k.tags_json AS tagsJson,k.favorite,
      k.created_at AS createdAt,k.updated_at AS updatedAt
     FROM lawyer_knowledge_items k LEFT JOIN cases c ON c.id=k.case_id
     LEFT JOIN user_profiles client ON client.id=k.client_user_id
     WHERE k.lawyer_user_id=? AND k.archived_at IS NULL
     ORDER BY k.favorite DESC,k.updated_at DESC,k.id DESC LIMIT 200`,
  ).bind(userId).all();
  return response({ items: rows.results.map((row) => {
    const item = row as { tagsJson?: string };
    let tags: string[] = [];
    try { tags = JSON.parse(item.tagsJson || "[]") as string[]; } catch { tags = []; }
    return { ...item, tagsJson: undefined, tags };
  }) });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  if (!await requireLawyer(user.id)) return response({ code: "LAWYER_ACCOUNT_REQUIRED" }, 403);
  return list(user.id);
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  if (!await requireLawyer(user.id)) return response({ code: "LAWYER_ACCOUNT_REQUIRED" }, 403);
  const parsed = await parseJsonRequest(request, createInput, 24_000);
  if (!parsed.ok) return response({ code: "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  const linkedCase = parsed.data.caseId
    ? await mayLinkCase(user.id, parsed.data.caseId) as { clientUserId: string } | null
    : null;
  if (parsed.data.caseId && !linkedCase) return response({ code: "CASE_ACCESS_REQUIRED" }, 403);
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(
      `INSERT INTO lawyer_knowledge_items
        (id,lawyer_user_id,workspace_id,case_id,client_user_id,kind,title,content,source_url,folder,tags_json,favorite,archived_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)`,
    ).bind(id, user.id, workspace.id, parsed.data.caseId ?? null, linkedCase?.clientUserId ?? null, parsed.data.kind, parsed.data.title, parsed.data.content, parsed.data.sourceUrl ?? null, parsed.data.folder, JSON.stringify(parsed.data.tags), parsed.data.favorite ? 1 : 0, now, now),
    db.prepare(
      `INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'lawyer_knowledge_item',?,'lawyer_knowledge_item_created',?,?)`,
    ).bind(crypto.randomUUID(), workspace.id, user.id, id, JSON.stringify({ kind: parsed.data.kind, caseId: parsed.data.caseId ?? null, hasSource: Boolean(parsed.data.sourceUrl) }), now),
  ]);
  if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) return response({ code: "KNOWLEDGE_ITEM_CONFLICT" }, 409);
  return list(user.id);
});

export const PATCH = withApiErrors(async function PATCH(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  if (!await requireLawyer(user.id)) return response({ code: "LAWYER_ACCOUNT_REQUIRED" }, 403);
  const parsed = await parseJsonRequest(request, updateInput, 2_048);
  if (!parsed.ok) return response({ code: "INVALID_INPUT" }, 400);
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const now = new Date().toISOString();
  const action = parsed.data.action === "archive" ? "lawyer_knowledge_item_archived" : "lawyer_knowledge_item_favorite_changed";
  const update = parsed.data.action === "archive"
    ? db.prepare("UPDATE lawyer_knowledge_items SET archived_at=?,updated_at=? WHERE id=? AND lawyer_user_id=? AND archived_at IS NULL").bind(now, now, parsed.data.itemId, user.id)
    : db.prepare("UPDATE lawyer_knowledge_items SET favorite=?,updated_at=? WHERE id=? AND lawyer_user_id=? AND archived_at IS NULL").bind(parsed.data.favorite ? 1 : 0, now, parsed.data.itemId, user.id);
  const results = await db.batch([
    update,
    db.prepare(
      `INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,?,?,'lawyer_knowledge_item',?,?,?,?
       WHERE EXISTS (SELECT 1 FROM lawyer_knowledge_items WHERE id=? AND lawyer_user_id=? AND updated_at=?)`,
    ).bind(crypto.randomUUID(), workspace.id, user.id, parsed.data.itemId, action, JSON.stringify(parsed.data), now, parsed.data.itemId, user.id, now),
  ]);
  if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) return response({ code: "KNOWLEDGE_ITEM_CONFLICT" }, 409);
  return list(user.id);
});
