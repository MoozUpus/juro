import { z } from "zod";
import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";

const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    caseId: z.string().uuid(),
    description: z.string().trim().min(1).max(500),
    billable: z.boolean(),
  }).strict(),
  z.object({ action: z.literal("stop"), entryId: z.string().uuid() }).strict(),
  z.object({
    action: z.literal("manual"),
    caseId: z.string().uuid(),
    description: z.string().trim().min(1).max(500),
    billable: z.boolean(),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }),
  }).strict(),
]);

type Matter = { requestId: string; workspaceId: string; caseId: string };

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

async function operationalLawyer(userId: string): Promise<boolean> {
  const profile = await requireD1().prepare(
    `SELECT id FROM lawyer_profiles WHERE user_id=?
       AND status='public_approved' AND marketplace_status='public_approved' LIMIT 1`,
  ).bind(userId).first();
  return Boolean(profile);
}

async function lawyerMatter(userId: string, caseId: string): Promise<Matter | null> {
  const now = new Date().toISOString();
  return requireD1().prepare(
    `SELECT r.id AS requestId,r.workspace_id AS workspaceId,r.case_id AS caseId
     FROM lawyer_requests r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=?
       AND p.status='public_approved' AND p.marketplace_status='public_approved'
     JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.case_id=r.case_id AND g.lawyer_user_id=?
       AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?)
     WHERE r.case_id=? LIMIT 1`,
  ).bind(userId, userId, now, caseId).first<Matter>();
}

async function list(userId: string) {
  const rows = await requireD1().prepare(
    `SELECT e.id,e.case_id AS caseId,e.lawyer_request_id AS requestId,c.title AS caseTitle,
      e.source,e.status,e.description,e.billable,e.started_at AS startedAt,e.ended_at AS endedAt,
      e.duration_seconds AS durationSeconds,e.created_at AS createdAt,e.updated_at AS updatedAt
     FROM lawyer_time_entries e JOIN cases c ON c.id=e.case_id
     WHERE e.lawyer_user_id=? ORDER BY e.started_at DESC,e.id DESC LIMIT 100`,
  ).bind(userId).all();
  return response({ entries: rows.results });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  if (!await operationalLawyer(user.id)) return response({ code: "OPERATIONAL_LAWYER_REQUIRED" }, 403);
  return list(user.id);
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, input, 4_096);
  if (!parsed.ok) return response({ code: "INVALID_INPUT" }, parsed.error === "payload_too_large" ? 413 : 400);
  if (!await operationalLawyer(user.id)) return response({ code: "OPERATIONAL_LAWYER_REQUIRED" }, 403);
  const db = requireD1();
  const now = new Date().toISOString();

  if (parsed.data.action === "stop") {
    const entry = await db.prepare(
      `SELECT id,workspace_id AS workspaceId,case_id AS caseId,started_at AS startedAt
       FROM lawyer_time_entries WHERE id=? AND lawyer_user_id=? AND status='running' LIMIT 1`,
    ).bind(parsed.data.entryId, user.id).first<{ id: string; workspaceId: string; caseId: string; startedAt: string }>();
    if (!entry) return response({ code: "RUNNING_TIMER_UNAVAILABLE" }, 404);
    const durationSeconds = Math.floor((Date.parse(now) - Date.parse(entry.startedAt)) / 1_000);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 604_800) {
      return response({ code: "TIMER_DURATION_INVALID" }, 409);
    }
    const results = await db.batch([
      db.prepare(
        `UPDATE lawyer_time_entries SET status='completed',ended_at=?,duration_seconds=?,updated_at=?
         WHERE id=? AND lawyer_user_id=? AND status='running'`,
      ).bind(now, durationSeconds, now, entry.id, user.id),
      db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         SELECT ?,?,?, 'lawyer_time_entry',?,'lawyer_timer_stopped',?,?
         WHERE EXISTS (SELECT 1 FROM lawyer_time_entries WHERE id=? AND status='completed' AND ended_at=?)`,
      ).bind(crypto.randomUUID(), entry.workspaceId, user.id, entry.id, JSON.stringify({ caseId: entry.caseId, durationSeconds }), now, entry.id, now),
    ]);
    if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) return response({ code: "TIME_ENTRY_CONFLICT" }, 409);
    return list(user.id);
  }

  const matter = await lawyerMatter(user.id, parsed.data.caseId);
  if (!matter) return response({ code: "CASE_ACCESS_REQUIRED" }, 403);
  const entryId = crypto.randomUUID();
  if (parsed.data.action === "start") {
    const results = await db.batch([
      db.prepare(
        `INSERT INTO lawyer_time_entries
          (id,lawyer_user_id,workspace_id,case_id,lawyer_request_id,source,status,description,billable,started_at,ended_at,duration_seconds,created_at,updated_at)
         SELECT ?,?,?,?,?,'timer','running',?,?,?,NULL,NULL,?,?
         WHERE NOT EXISTS (SELECT 1 FROM lawyer_time_entries WHERE lawyer_user_id=? AND status='running')`,
      ).bind(entryId, user.id, matter.workspaceId, matter.caseId, matter.requestId, parsed.data.description, parsed.data.billable ? 1 : 0, now, now, now, user.id),
      db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         SELECT ?,?,?,'lawyer_time_entry',?,'lawyer_timer_started',?,?
         WHERE EXISTS (SELECT 1 FROM lawyer_time_entries WHERE id=? AND status='running')`,
      ).bind(crypto.randomUUID(), matter.workspaceId, user.id, entryId, JSON.stringify({ caseId: matter.caseId, billable: parsed.data.billable }), now, entryId),
    ]);
    if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) return response({ code: "RUNNING_TIMER_EXISTS" }, 409);
    return list(user.id);
  }

  const startedMs = Date.parse(parsed.data.startedAt);
  const endedMs = Date.parse(parsed.data.endedAt);
  const durationSeconds = Math.floor((endedMs - startedMs) / 1_000);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 604_800 || endedMs > Date.now() + 60_000) {
    return response({ code: "TIME_RANGE_INVALID" }, 400);
  }
  const results = await db.batch([
    db.prepare(
      `INSERT INTO lawyer_time_entries
        (id,lawyer_user_id,workspace_id,case_id,lawyer_request_id,source,status,description,billable,started_at,ended_at,duration_seconds,created_at,updated_at)
       VALUES (?,?,?,?,?,'manual','completed',?,?,?,?,?,?,?)`,
    ).bind(entryId, user.id, matter.workspaceId, matter.caseId, matter.requestId, parsed.data.description, parsed.data.billable ? 1 : 0, parsed.data.startedAt, parsed.data.endedAt, durationSeconds, now, now),
    db.prepare(
      `INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'lawyer_time_entry',?,'lawyer_time_added_manually',?,?)`,
    ).bind(crypto.randomUUID(), matter.workspaceId, user.id, entryId, JSON.stringify({ caseId: matter.caseId, durationSeconds, billable: parsed.data.billable }), now),
  ]);
  if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) return response({ code: "TIME_ENTRY_CONFLICT" }, 409);
  return list(user.id);
});
