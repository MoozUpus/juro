import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import {
  AnalysisCaseLinkError,
  analysisCaseLinkInputSchema,
  changeAnalysisCaseLink,
} from "../../../../../../lib/document-analysis/analysis-case-link";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

type Context = { params: Promise<{ analysisId: string }> };

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const PUT = withApiErrors(async function PUT(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(analysisId)) {
    return response({ code: "ANALYSIS_UNAVAILABLE", error: "Анализ недоступен." }, 404);
  }
  try {
    const parsed = analysisCaseLinkInputSchema.safeParse(await request.json());
    if (!parsed.success) return response({ code: "INVALID_INPUT", error: "Выберите доступное дело или снимите привязку." }, 400);
    const result = await changeAnalysisCaseLink({
      db: requireD1(),
      workspaceId: workspace.id,
      userId: user.id,
      analysisId,
      caseId: parsed.data.caseId,
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
    });
    return response(result);
  } catch (error) {
    if (error instanceof AnalysisCaseLinkError) {
      return response({ code: error.code, error: error.message }, error.status);
    }
    if (error instanceof SyntaxError) return response({ code: "INVALID_JSON", error: "Некорректный JSON." }, 400);
    throw error;
  }
});
