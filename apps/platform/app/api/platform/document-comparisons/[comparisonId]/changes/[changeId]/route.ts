import { z } from "zod";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../../lib/document-builder/storage/runtime";
import {
  ComparisonDecisionError,
  decideComparisonChange,
} from "../../../../../../../lib/document-comparison/review-decision";
import { assertComparisonSourceFilesClean } from "../../../../../../../lib/document-comparison/scan-evidence";
import { comparisonForUser } from "../../../../../../../lib/document-comparison/storage";
import { ComparisonProcessingError } from "../../../../../../../lib/document-comparison/types";
import { workspaceForContentEditor } from "../../../../../../../lib/platform/workspace";

const decisionSchema = z.object({
  decision: z.enum(["accepted", "rejected", "pending"]),
  locale: z.enum(["ru", "uz"]).default("ru"),
}).strict();

const response = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "private, no-store", pragma: "no-cache" },
});

export const PATCH = withApiErrors(async function PATCH(
  request: Request,
  context: { params: Promise<{ comparisonId: string; changeId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForContentEditor(user);
  const { comparisonId, changeId } = await context.params;
  const db = requireD1();
  const comparison = await comparisonForUser(db, comparisonId, workspace.id, user.id);
  if (!comparison) {
    return response({ code: "COMPARISON_CHANGE_NOT_FOUND", error: "Изменение не найдено." }, 404);
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
      return response({ code: error.code, error: error.message }, 422);
    }
    throw error;
  }
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return response({
      code: "COMPARISON_CHANGE_INVALID_DECISION",
      error: "Некорректное решение по изменению.",
    }, 400);
  }
  try {
    return response(await decideComparisonChange(db, {
      comparisonId,
      changeId,
      workspaceId: workspace.id,
      userId: user.id,
      decision: parsed.data.decision === "pending" ? null : parsed.data.decision,
    }));
  } catch (error) {
    if (error instanceof ComparisonDecisionError) {
      return response({
        code: error.code,
        error: decisionErrorMessage(error.code, parsed.data.locale),
      }, error.status);
    }
    throw error;
  }
});

function decisionErrorMessage(code: ComparisonDecisionError["code"], locale: "ru" | "uz") {
  if (locale === "uz") {
    return code === "COMPARISON_CHANGE_NOT_FOUND"
      ? "O‘zgarish topilmadi."
      : "Qaror boshqa oynada o‘zgartirildi. Natijani yangilang va qayta urinib ko‘ring.";
  }
  return code === "COMPARISON_CHANGE_NOT_FOUND"
    ? "Изменение не найдено."
    : "Решение изменилось в другой вкладке. Обновите результат и повторите действие.";
}
