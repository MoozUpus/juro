import { z } from "zod";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { AnalysisExportError } from "../../../../../../lib/document-analysis/exporter";
import { requestComparisonExport } from "../../../../../../lib/document-comparison/exporter";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

const requestSchema = z.object({ format: z.enum(["pdf", "docx"]) }).strict();
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });

export const GET = withApiErrors(async function GET(
  _request: Request,
  context: { params: Promise<{ comparisonId: string }> },
) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { comparisonId } = await context.params;
  const rows = await requireD1().prepare(
    `SELECT id,comparison_id AS comparisonId,format,status,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes,error_code AS errorCode,completed_at AS completedAt,created_at AS createdAt
     FROM comparison_exports WHERE comparison_id=? AND workspace_id=? AND owner_user_id=?
     ORDER BY created_at DESC LIMIT 20`,
  ).bind(comparisonId, workspace.id, user.id).all();
  return response({ exports: rows.results });
});

export const POST = withApiErrors(async function POST(
  request: Request,
  context: { params: Promise<{ comparisonId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { comparisonId } = await context.params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return response({ code: "ANALYSIS_EXPORT_FORMAT_INVALID", error: message("ANALYSIS_EXPORT_FORMAT_INVALID") }, 400);
  try {
    const result = await requestComparisonExport({
      db: requireD1(), comparisonId, workspaceId: workspace.id, userId: user.id, format: parsed.data.format,
      idempotencyKey: request.headers.get("idempotency-key")?.trim() ?? "",
    });
    return response({ export: result.record, replay: result.replay }, result.replay ? 200 : 202);
  } catch (error) {
    if (error instanceof AnalysisExportError) return response({ code: error.code, error: message(error.code) }, error.status);
    throw error;
  }
});

function message(code: string) {
  if (code === "ANALYSIS_EXPORT_FORMAT_INVALID") return "Поддерживаются только PDF и DOCX.";
  if (code === "ANALYSIS_EXPORT_NOT_READY") return "Экспорт доступен после завершения сравнения.";
  if (code === "ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT") return "Idempotency-Key некорректен или уже относится к другому экспорту.";
  return "Экспорт сравнения не удалось создать.";
}
