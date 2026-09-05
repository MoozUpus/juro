import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { AnalysisExportError, requestAnalysisExport } from "../../../../../../lib/document-analysis/exporter";
import { requestAnalysisReportExport, type AnalysisReportFormat } from "../../../../../../lib/document-analysis/report-exporter";
import { workspaceForContentEditor, workspaceForUser } from "../../../../../../lib/platform/workspace";
import { z } from "zod";

const exportRequestSchema = z.object({
  format: z.enum(["json", "pdf", "docx"]).default("json"),
  variant: z.enum(["analysis_report", "corrected_clean", "corrected_redline"]).default("analysis_report"),
  sourceVersionId: z.string().min(1).max(160).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.format === "json" && value.variant !== "analysis_report") context.addIssue({ code: "custom", path: ["variant"], message: "JSON supports analysis_report only" });
  if (value.variant === "analysis_report" && value.sourceVersionId) context.addIssue({ code: "custom", path: ["sourceVersionId"], message: "Report export has no source version" });
  if (value.variant !== "analysis_report" && !value.sourceVersionId) context.addIssue({ code: "custom", path: ["sourceVersionId"], message: "Corrected export requires source version" });
});

const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });

export const GET = withApiErrors(async function GET(_request: Request, context: { params: Promise<{ analysisId: string }> }) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId } = await context.params;
  const rows = await requireD1().prepare(
    `SELECT id,analysisId,format,variant,sourceVersionId,status,fileName,mimeType,sizeBytes,errorCode,completedAt,createdAt FROM (
       SELECT id,analysis_id AS analysisId,format,'analysis_report' AS variant,NULL AS sourceVersionId,status,file_name AS fileName,mime_type AS mimeType,
         size_bytes AS sizeBytes,error_code AS errorCode,completed_at AS completedAt,created_at AS createdAt
       FROM analysis_exports WHERE analysis_id=? AND workspace_id=? AND owner_user_id=?
       UNION ALL
       SELECT id,analysis_id AS analysisId,format,variant,source_version_id AS sourceVersionId,status,file_name AS fileName,mime_type AS mimeType,
         size_bytes AS sizeBytes,error_code AS errorCode,completed_at AS completedAt,created_at AS createdAt
       FROM analysis_report_exports WHERE analysis_id=? AND workspace_id=? AND owner_user_id=?
     ) ORDER BY createdAt DESC LIMIT 20`,
  ).bind(analysisId, workspace.id, user.id, analysisId, workspace.id, user.id).all();
  return response({ exports: rows.results });
});

export const POST = withApiErrors(async function POST(request: Request, context: { params: Promise<{ analysisId: string }> }) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForContentEditor(user);
  const { analysisId } = await context.params;
  const parsed = exportRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return response({ code: "ANALYSIS_EXPORT_FORMAT_INVALID", error: message("ANALYSIS_EXPORT_FORMAT_INVALID") }, 400);
  }
  const { format, variant, sourceVersionId = null } = parsed.data;
  try {
    const common = {
      db: requireD1(), analysisId, workspaceId: workspace.id, userId: user.id,
      idempotencyKey: request.headers.get("idempotency-key")?.trim() ?? "",
    };
    const result = format === "json"
      ? await requestAnalysisExport(common)
      : await requestAnalysisReportExport({ ...common, format: format as AnalysisReportFormat, variant, sourceVersionId });
    return response({ export: result.record, replay: result.replay }, result.replay ? 200 : 202);
  } catch (error) {
    if (error instanceof AnalysisExportError) return response({ code: error.code, error: message(error.code) }, error.status);
    throw error;
  }
});

function message(code: string) {
  if (code === "ANALYSIS_EXPORT_FORMAT_INVALID") return "Проверьте формат, вариант и идентификатор исправленной версии.";
  if (code === "ANALYSIS_EXPORT_NOT_READY") return "Экспорт доступен только после завершения анализа.";
  if (code === "ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT") return "Idempotency-Key некорректен или уже относится к другому экспорту.";
  if (code === "ANALYSIS_EXPORT_CAPACITY_UNAVAILABLE") return "Для одного анализа доступно не больше 20 операций экспорта.";
  return "Экспорт не удалось создать.";
}
