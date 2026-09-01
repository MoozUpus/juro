import { requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { getPrivateObject } from "../../../../../../../lib/document-builder/storage/files";
import { requireD1 } from "../../../../../../../lib/document-builder/storage/runtime";
import { comparisonForUser } from "../../../../../../../lib/document-comparison/storage";
import {
  assertComparisonFileScanEvidence,
  assertStoredComparisonFileIsClean,
  comparisonFileForOwner,
  type ComparisonFileRecord,
} from "../../../../../../../lib/document-comparison/scan-evidence";
import { ComparisonProcessingError } from "../../../../../../../lib/document-comparison/types";
import { workspaceForUser } from "../../../../../../../lib/platform/workspace";

export const GET = withApiErrors(async function GET(
  _request: Request,
  context: { params: Promise<{ comparisonId: string; version: string }> },
) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { comparisonId, version } = await context.params;
  if (version !== "one" && version !== "two") {
    return Response.json({ error: "Версия не найдена." }, { status: 404 });
  }
  const db = requireD1();
  const comparison = await comparisonForUser(db, comparisonId, workspace.id, user.id);
  if (!comparison) return Response.json({ error: "Сравнение не найдено." }, { status: 404 });
  const fileId = version === "one" ? comparison.versionOneFileId : comparison.versionTwoFileId;
  let file: ComparisonFileRecord;
  try {
    file = await comparisonFileForOwner(db, fileId, workspace.id, user.id);
    await assertStoredComparisonFileIsClean(file);
  } catch (error) {
    if (error instanceof ComparisonProcessingError) {
      return Response.json({ code: error.code, error: error.message }, {
        status: 422,
        headers: { "cache-control": "private, no-store" },
      });
    }
    throw error;
  }
  const object = await getPrivateObject(file.r2Key);
  if (!object) return Response.json({ error: "Файл недоступен." }, { status: 404 });
  try {
    assertComparisonFileScanEvidence(file, object);
  } catch (error) {
    if (error instanceof ComparisonProcessingError) {
      return Response.json({ code: error.code, error: error.message }, {
        status: 422,
        headers: { "cache-control": "private, no-store" },
      });
    }
    throw error;
  }
  return new Response(object.body, {
    headers: {
      "content-type": file.mimeType,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "cache-control": "private, no-store",
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
    },
  });
});
