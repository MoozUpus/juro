import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  comparisonChanges,
  comparisonForUser,
  loadExtractedDocument,
  parsedSummary,
  verifiedSourcesForChanges,
} from "../../../../../lib/document-comparison/storage";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const GET = withApiErrors(async function GET(
  _request: Request,
  context: { params: Promise<{ comparisonId: string }> },
) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { comparisonId } = await context.params;
  const db = requireD1();
  const comparison = await comparisonForUser(db, comparisonId, workspace.id, user.id);
  if (!comparison) return response({ error: "Сравнение не найдено." }, 404);
  const changes = await comparisonChanges(db, comparisonId);
  const [versionOne, versionTwo, sources] = await Promise.all([
    loadExtractedDocument(comparison.versionOneJsonKey),
    loadExtractedDocument(comparison.versionTwoJsonKey),
    verifiedSourcesForChanges(db, changes),
  ]);
  return response({
    comparison: {
      ...comparison,
      summary: parsedSummary(comparison.summaryJson),
      versionOne: versionOne ?? {
        fileName: comparison.versionOneName,
        mimeType: comparison.versionOneMimeType,
        sizeBytes: comparison.versionOneSizeBytes,
      },
      versionTwo: versionTwo ?? {
        fileName: comparison.versionTwoName,
        mimeType: comparison.versionTwoMimeType,
        sizeBytes: comparison.versionTwoSizeBytes,
      },
      changes,
      sources,
    },
  });
});

export const PATCH = withApiErrors(async function PATCH(
  request: Request,
  context: { params: Promise<{ comparisonId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { comparisonId } = await context.params;
  const db = requireD1();
  const comparison = await comparisonForUser(db, comparisonId, workspace.id, user.id);
  if (!comparison) return response({ error: "Сравнение не найдено." }, 404);
  const body = await request.json() as { changeId?: string; reviewed?: boolean; caseId?: string | null };
  if (body.changeId) {
    const result = await db.prepare(
      `UPDATE comparison_changes SET reviewed_at=?
       WHERE id=? AND comparison_id=? AND EXISTS (
         SELECT 1 FROM document_comparisons c
         WHERE c.id=comparison_changes.comparison_id AND c.workspace_id=? AND c.owner_user_id=? AND c.deleted_at IS NULL
       )`,
    ).bind(body.reviewed === false ? null : isoNow(), body.changeId, comparisonId, workspace.id, user.id).run();
    if (!result.meta.changes) return response({ error: "Изменение не найдено." }, 404);
    return response({ ok: true });
  }
  if (Object.prototype.hasOwnProperty.call(body, "caseId")) {
    if (body.caseId) {
      const accessibleCase = await db.prepare(
        "SELECT id FROM cases WHERE id=? AND workspace_id=? AND archived_at IS NULL LIMIT 1",
      ).bind(body.caseId, workspace.id).first();
      if (!accessibleCase) return response({ error: "Дело не найдено или недоступно." }, 403);
    }
    await db.prepare(
      "UPDATE document_comparisons SET case_id=?,updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=?",
    ).bind(body.caseId || null, isoNow(), comparisonId, workspace.id, user.id).run();
    return response({ ok: true });
  }
  return response({ error: "Нет поддерживаемого изменения." }, 400);
});

export const DELETE = withApiErrors(async function DELETE(
  request: Request,
  context: { params: Promise<{ comparisonId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { comparisonId } = await context.params;
  const db = requireD1();
  const comparison = await comparisonForUser(db, comparisonId, workspace.id, user.id);
  if (!comparison) return response({ error: "Сравнение не найдено." }, 404);
  const now = isoNow();
  await db.batch([
    db.prepare(
      "UPDATE document_comparisons SET status='deleted',deleted_at=?,updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=?",
    ).bind(now, now, comparisonId, workspace.id, user.id),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'document_comparison',?,'comparison_deleted',?,?)`,
    ).bind(crypto.randomUUID(), workspace.id, user.id, comparisonId, JSON.stringify({
      retention: "soft_delete_pending_policy_cleanup",
    }), now),
  ]);
  return response({ ok: true, retention: "soft_delete_pending_policy_cleanup" });
});
