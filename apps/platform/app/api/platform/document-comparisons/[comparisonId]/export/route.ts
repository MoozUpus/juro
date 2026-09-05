import { z } from "zod";
import { authLocaleFromRequest } from "../../../../../../lib/auth/request-locale";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { AnalysisExportError } from "../../../../../../lib/document-analysis/exporter";
import { requestComparisonExport } from "../../../../../../lib/document-comparison/exporter";
import {
  comparisonExportErrorMessage,
  comparisonProcessingErrorMessage,
  comparisonRouteErrorMessage,
} from "../../../../../../lib/document-comparison/localization";
import { assertComparisonSourceFilesClean } from "../../../../../../lib/document-comparison/scan-evidence";
import { comparisonForUser } from "../../../../../../lib/document-comparison/storage";
import { ComparisonProcessingError } from "../../../../../../lib/document-comparison/types";
import { workspaceForContentEditor, workspaceForUser } from "../../../../../../lib/platform/workspace";

const requestSchema = z.object({ format: z.enum(["pdf", "docx"]) }).strict();
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });

export const GET = withApiErrors(async function GET(
  request: Request,
  context: { params: Promise<{ comparisonId: string }> },
) {
  const locale = authLocaleFromRequest(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { comparisonId } = await context.params;
  const db = requireD1();
  const comparison = await comparisonForUser(db, comparisonId, workspace.id, user.id);
  if (!comparison) {
    return response({
      code: "ANALYSIS_EXPORT_NOT_FOUND",
      error: comparisonRouteErrorMessage("COMPARISON_NOT_FOUND", locale),
    }, 404);
  }
  try {
    await assertComparisonSourceFilesClean(db, {
      versionOneFileId: comparison.versionOneFileId,
      versionTwoFileId: comparison.versionTwoFileId,
      workspaceId: workspace.id,
      ownerUserId: user.id,
    });
  } catch (error) {
    if (error instanceof ComparisonProcessingError) {
      return response({
        code: error.code,
        error: comparisonProcessingErrorMessage(error.code, locale),
      }, 422);
    }
    throw error;
  }
  const rows = await db.prepare(
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
  const locale = authLocaleFromRequest(request);
  const user = await requireApiUser();
  const workspace = await workspaceForContentEditor(user);
  const { comparisonId } = await context.params;
  const db = requireD1();
  const comparison = await comparisonForUser(db, comparisonId, workspace.id, user.id);
  if (!comparison) {
    return response({
      code: "ANALYSIS_EXPORT_NOT_FOUND",
      error: comparisonRouteErrorMessage("COMPARISON_NOT_FOUND", locale),
    }, 404);
  }
  try {
    await assertComparisonSourceFilesClean(db, {
      versionOneFileId: comparison.versionOneFileId,
      versionTwoFileId: comparison.versionTwoFileId,
      workspaceId: workspace.id,
      ownerUserId: user.id,
    });
  } catch (error) {
    if (error instanceof ComparisonProcessingError) {
      return response({
        code: error.code,
        error: comparisonProcessingErrorMessage(error.code, locale),
      }, 422);
    }
    throw error;
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return response({
      code: "ANALYSIS_EXPORT_FORMAT_INVALID",
      error: comparisonExportErrorMessage("ANALYSIS_EXPORT_FORMAT_INVALID", locale),
    }, 400);
  }
  try {
    const result = await requestComparisonExport({
      db, comparisonId, workspaceId: workspace.id, userId: user.id, format: parsed.data.format,
      idempotencyKey: request.headers.get("idempotency-key")?.trim() ?? "",
    });
    return response({ export: result.record, replay: result.replay }, result.replay ? 200 : 202);
  } catch (error) {
    if (error instanceof AnalysisExportError) {
      return response({
        code: error.code,
        error: comparisonExportErrorMessage(error.code, locale),
      }, error.status);
    }
    throw error;
  }
});
