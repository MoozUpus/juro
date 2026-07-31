import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { AnalysisExportError, requestAnalysisExport } from "../../../../../../lib/document-analysis/exporter";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });

export const GET = withApiErrors(async function GET(_request: Request, context: { params: Promise<{ analysisId: string }> }) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId } = await context.params;
  const rows = await requireD1().prepare(
    `SELECT id,analysis_id AS analysisId,format,status,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes,error_code AS errorCode,completed_at AS completedAt,created_at AS createdAt
     FROM analysis_exports WHERE analysis_id=? AND workspace_id=? AND owner_user_id=? ORDER BY created_at DESC LIMIT 20`,
  ).bind(analysisId, workspace.id, user.id).all();
  return response({ exports: rows.results });
});

export const POST = withApiErrors(async function POST(request: Request, context: { params: Promise<{ analysisId: string }> }) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId } = await context.params;
  try {
    const result = await requestAnalysisExport({
      db: requireD1(), analysisId, workspaceId: workspace.id, userId: user.id,
      idempotencyKey: request.headers.get("idempotency-key")?.trim() ?? "",
    });
    return response({ export: result.record, replay: result.replay }, result.replay ? 200 : 202);
  } catch (error) {
    if (error instanceof AnalysisExportError) return response({ code: error.code, error: message(error.code) }, error.status);
    throw error;
  }
});

function message(code: string) {
  if (code === "ANALYSIS_EXPORT_NOT_READY") return "Экспорт доступен только после завершения анализа.";
  if (code === "ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT") return "Idempotency-Key некорректен или уже относится к другому экспорту.";
  return "Экспорт не удалось создать.";
}
