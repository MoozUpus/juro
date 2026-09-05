import { z } from "zod";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

type Context = { params: Promise<{ analysisId: string }> };

const inputSchema = z.object({
  comment: z.string().trim().min(1).max(2_000).optional(),
}).strict();

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function validAnalysisId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

async function accessibleAnalysis(db: D1Database, analysisId: string, userId: string) {
  return db.prepare(
    `SELECT a.id,a.workspace_id AS workspaceId,a.case_id AS caseId
       FROM document_analyses a
      WHERE a.id=? AND (
        a.owner_user_id=? OR EXISTS (
          SELECT 1 FROM lawyer_access_grants g
           JOIN lawyer_profiles p ON p.user_id=g.lawyer_user_id
             AND p.status='public_approved' AND p.marketplace_status='public_approved'
           WHERE g.case_id=a.case_id AND g.lawyer_user_id=? AND g.revoked_at IS NULL
             AND (g.expires_at IS NULL OR g.expires_at>?)
        )
      ) LIMIT 1`,
  ).bind(analysisId, userId, userId, isoNow()).first<{ id: string; workspaceId: string; caseId: string | null }>();
}

export const GET = withApiErrors(async function GET(_request: Request, context: Context) {
  const user = await requireApiUser();
  const { analysisId } = await context.params;
  if (!validAnalysisId(analysisId)) return response({ code: "ANALYSIS_UNAVAILABLE" }, 404);
  const db = requireD1();
  const analysis = await accessibleAnalysis(db, analysisId, user.id);
  if (!analysis) return response({ code: "ANALYSIS_UNAVAILABLE" }, 404);
  const records = await db.prepare(
    `SELECT id,document_version_id AS documentVersionId,lawyer_user_id AS lawyerUserId,
       status,comment,verified_at AS verifiedAt,invalidated_at AS invalidatedAt
       FROM document_analysis_lawyer_verifications
      WHERE analysis_id=? AND workspace_id=? ORDER BY verified_at DESC,id DESC`,
  ).bind(analysis.id, analysis.workspaceId).all();
  return response({ verifications: records.results });
});

export const POST = withApiErrors(async function POST(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const { analysisId } = await context.params;
  if (!validAnalysisId(analysisId)) return response({ code: "ANALYSIS_UNAVAILABLE" }, 404);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ code: "INVALID_INPUT", error: "Комментарий может содержать до 2000 символов." }, 400);

  const db = requireD1();
  const now = isoNow();
  const target = await db.prepare(
    `SELECT a.id AS analysisId,a.workspace_id AS workspaceId,a.case_id AS caseId,v.id AS documentVersionId
       FROM document_analyses a
       JOIN analysis_document_versions v ON v.analysis_id=a.id AND v.workspace_id=a.workspace_id
        AND v.version=(SELECT max(latest.version) FROM analysis_document_versions latest WHERE latest.analysis_id=a.id)
       JOIN lawyer_access_grants g ON g.case_id=a.case_id AND g.lawyer_user_id=?
        AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?)
       JOIN lawyer_profiles p ON p.user_id=g.lawyer_user_id
        AND p.status='public_approved' AND p.marketplace_status='public_approved'
      WHERE a.id=? AND a.case_id IS NOT NULL LIMIT 1`,
  ).bind(user.id, now, analysisId).first<{
    analysisId: string;
    workspaceId: string;
    caseId: string;
    documentVersionId: string;
  }>();
  if (!target) {
    return response({
      code: "LAWYER_CASE_ACCESS_REQUIRED",
      error: "Отметка доступна только назначенному юристу с активным доступом к этому делу.",
    }, 403);
  }

  const verificationId = crypto.randomUUID();
  await db.batch([
    db.prepare(
      `INSERT INTO document_analysis_lawyer_verifications
       (id,analysis_id,document_version_id,workspace_id,case_id,lawyer_user_id,status,comment,verified_at,invalidated_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'verified',?,?,NULL,?,?)
       ON CONFLICT(analysis_id,document_version_id,lawyer_user_id) DO UPDATE SET
         status='verified',comment=excluded.comment,verified_at=excluded.verified_at,
         invalidated_at=NULL,updated_at=excluded.updated_at`,
    ).bind(
      verificationId, target.analysisId, target.documentVersionId, target.workspaceId, target.caseId,
      user.id, parsed.data.comment ?? null, now, now, now,
    ),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'document_analysis_lawyer_verification',?,'lawyer_verified_document_version',?,?)`,
    ).bind(
      crypto.randomUUID(), target.workspaceId, user.id, verificationId,
      JSON.stringify({ analysisId: target.analysisId, documentVersionId: target.documentVersionId, caseId: target.caseId }), now,
    ),
  ]);
  const verification = await db.prepare(
    `SELECT id,document_version_id AS documentVersionId,lawyer_user_id AS lawyerUserId,
       status,comment,verified_at AS verifiedAt,invalidated_at AS invalidatedAt
       FROM document_analysis_lawyer_verifications
      WHERE analysis_id=? AND document_version_id=? AND lawyer_user_id=? LIMIT 1`,
  ).bind(target.analysisId, target.documentVersionId, user.id).first();
  return response({
    verification,
    disclaimer: "Отметка означает проверку назначенным юристом конкретной версии и не является одобрением JURO или Lex.uz.",
  }, 201);
});
