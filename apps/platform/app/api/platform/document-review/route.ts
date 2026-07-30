import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { parseJson } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const rows = await requireD1().prepare(
    `SELECT a.id,a.status,a.summary_json AS summaryJson,a.error_code AS errorCode,a.created_at AS createdAt,a.updated_at AS updatedAt,
      f.id AS fileId,f.file_name AS fileName,f.mime_type AS mimeType,f.size_bytes AS sizeBytes,
      (SELECT json_group_array(json_object('id',r.id,'level',r.level,'title',r.title,'description',r.description,'excerpt',r.excerpt,'confidencePercent',r.confidence_percent))
       FROM document_risks r WHERE r.analysis_id=a.id) AS risksJson
     FROM document_analyses a JOIN document_files f ON f.id=a.uploaded_file_id
     WHERE a.workspace_id=? AND a.owner_user_id=? ORDER BY a.created_at DESC LIMIT 50`,
  ).bind(workspace.id, user.id).all();
  return response({
    analyses: rows.results.map(row => {
      const item = row as Record<string, unknown>;
      return { ...item, summary: parseJson(String(item.summaryJson || "{}"), null), risks: parseJson(String(item.risksJson || "[]"), []) };
    }),
  });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  await requireApiUser();
  return response({
    code: "SECURE_UPLOAD_REQUIRED",
    error: "Multipart endpoint отключён. Используйте потоковый /api/platform/document-analysis/uploads с SHA-256 и обязательным карантином.",
  }, 426);
});
