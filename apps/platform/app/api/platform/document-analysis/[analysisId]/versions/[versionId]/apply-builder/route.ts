import { z } from "zod";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../../lib/document-builder/auth/api";
import { jsonResponse } from "../../../../../../../../lib/document-builder/auth/responses";
import { requireD1, requireR2 } from "../../../../../../../../lib/document-builder/storage/runtime";
import { applyProjectedDocumentContentVersion } from "../../../../../../../../lib/document-builder/document-versions";
import {
  AnalysisRevisionError,
  analysisVersionForDownload,
  verifiedAnalysisVersionObject,
} from "../../../../../../../../lib/document-analysis/revisions";
import { workspaceForContentEditor } from "../../../../../../../../lib/platform/workspace";

const bodySchema = z.object({ sourceRevision: z.number().int().positive() }).strict();

type BuilderSource = {
  documentId: string;
  sourceRevision: number;
  currentRevision: number;
  status: string;
};

export const POST = withApiErrors(async function POST(
  request: Request,
  context: { params: Promise<{ analysisId: string; versionId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForContentEditor(user);
  const { analysisId, versionId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ code: "BUILDER_ANALYSIS_INVALID_REVISION", error: "Некорректная версия конструктора." }, { status: 400 });
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{16,200}$/.test(idempotencyKey)) {
    return jsonResponse({ code: "BUILDER_ANALYSIS_IDEMPOTENCY_REQUIRED", error: "Повторите действие из интерфейса конструктора." }, { status: 400 });
  }
  const db = requireD1();
  const source = await builderSource(db, analysisId, workspace.id, user.id);
  if (!source) return jsonResponse({ code: "BUILDER_ANALYSIS_SOURCE_NOT_FOUND", error: "Этот анализ не связан с вашим документом конструктора." }, { status: 404 });
  if (parsed.data.sourceRevision !== source.sourceRevision) {
    return jsonResponse({ code: "BUILDER_ANALYSIS_STALE", error: "Конструктор изменился после запуска анализа. Запустите новый анализ." }, { status: 409 });
  }
  try {
    const analysisVersion = await analysisVersionForDownload(db, {
      analysisId, versionId, workspaceId: workspace.id, userId: user.id,
    });
    if (analysisVersion.sourceKind !== "corrected") {
      return jsonResponse({ code: "BUILDER_ANALYSIS_VERSION_INVALID", error: "В конструктор можно применить только исправленную версию." }, { status: 409 });
    }
    const object = await verifiedAnalysisVersionObject(requireR2(), analysisVersion);
    const finalContent = await object.text();
    const result = await applyProjectedDocumentContentVersion({
      db,
      bucket: requireR2(),
      documentId: source.documentId,
      workspaceId: workspace.id,
      ownerUserId: user.id,
      actorUserId: user.id,
      revision: source.sourceRevision,
      source: "analysis_correction",
      sourceEntityId: analysisVersion.id,
      idempotencyKey,
      finalContent,
      nextStatus: source.status === "Черновик" ? "Черновик" : "Готов",
      revisionSource: "analysis_correction",
      changes: {
        analysisId,
        analysisVersionId: analysisVersion.id,
        analysisVersion: analysisVersion.version,
        sourceRevision: source.sourceRevision,
        contentSha256: analysisVersion.sha256,
      },
    });
    return jsonResponse({
      documentId: source.documentId,
      revision: result.revision,
      version: result.version,
      replayed: result.replayed,
    }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof AnalysisRevisionError) {
      return jsonResponse({ code: error.code, error: "Исправленная версия недоступна или повреждена." }, { status: error.status });
    }
    throw error;
  }
});

async function builderSource(
  db: D1Database,
  analysisId: string,
  workspaceId: string,
  userId: string,
): Promise<BuilderSource | null> {
  const row = await db.prepare(
    `SELECT handoff.document_id AS documentId,handoff.document_revision AS sourceRevision,
      document.revision AS currentRevision,document.status
     FROM builder_document_analysis_handoffs handoff
     JOIN documents document ON document.id=handoff.document_id
       AND document.workspace_id=handoff.workspace_id
       AND document.owner_user_id=handoff.user_id
     WHERE handoff.analysis_id=? AND handoff.workspace_id=? AND handoff.user_id=?
       AND handoff.status='ready' AND document.archived_at IS NULL LIMIT 1`,
  ).bind(analysisId, workspaceId, userId).first<BuilderSource>();
  return row ? {
    ...row,
    sourceRevision: Number(row.sourceRevision),
    currentRevision: Number(row.currentRevision),
  } : null;
}
