import { z } from "zod";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../../lib/document-builder/storage/runtime";
import {
  ComparisonDecisionError,
  decideComparisonChange,
} from "../../../../../../../lib/document-comparison/review-decision";
import { assertComparisonSourceFilesClean } from "../../../../../../../lib/document-comparison/scan-evidence";
import { comparisonForUser } from "../../../../../../../lib/document-comparison/storage";
import { comparisonProcessingErrorMessage } from "../../../../../../../lib/document-comparison/localization";
import { ComparisonProcessingError } from "../../../../../../../lib/document-comparison/types";
import type { PlatformLocale } from "../../../../../../../lib/platform/routing";
import { workspaceForContentEditor } from "../../../../../../../lib/platform/workspace";

const decisionSchema = z.object({
  decision: z.enum(["accepted", "rejected", "pending"]),
  locale: z.enum(["ru", "uz", "en"]).default("ru"),
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
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return response({ code: "COMPARISON_CHANGE_INVALID_DECISION" }, 400);
  }
  const db = requireD1();
  const comparison = await comparisonForUser(db, comparisonId, workspace.id, user.id);
  if (!comparison) {
    return response({
      code: "COMPARISON_CHANGE_NOT_FOUND",
      error: decisionErrorMessage("COMPARISON_CHANGE_NOT_FOUND", parsed.data.locale),
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
        error: comparisonProcessingErrorMessage(error.code, parsed.data.locale),
      }, 422);
    }
    throw error;
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

function decisionErrorMessage(code: ComparisonDecisionError["code"], locale: PlatformLocale) {
  const messages: Record<ComparisonDecisionError["code"], Record<PlatformLocale, string>> = {
    COMPARISON_CHANGE_NOT_FOUND: {
      ru: "Изменение не найдено.",
      uz: "O‘zgarish topilmadi.",
      en: "The change could not be found.",
    },
    COMPARISON_CHANGE_DECISION_CONFLICT: {
      ru: "Решение изменилось в другой вкладке. Обновите результат и повторите действие.",
      uz: "Qaror boshqa oynada o‘zgartirildi. Natijani yangilang va qayta urinib ko‘ring.",
      en: "The decision changed in another tab. Refresh the result and try again.",
    },
  };
  return messages[code][locale];
}
