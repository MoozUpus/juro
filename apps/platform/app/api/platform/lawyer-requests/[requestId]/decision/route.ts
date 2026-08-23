import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import {
  decideLawyerRequest,
  LawyerRequestDecisionError,
} from "../../../../../../lib/platform/lawyer-request-decision";
import {
  lawyerRequestDecisionSchema,
  localizedHandoffError,
} from "../../../../../../lib/platform/lawyer-request";

type Context = { params: Promise<{ requestId: string }> };

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const POST = withApiErrors(async function POST(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const { requestId } = await context.params;
  const parsed = await parseJsonRequest(request, lawyerRequestDecisionSchema, 4_096);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) {
    return response(
      { code: "INVALID_INPUT", error: localizedHandoffError(locale, "INVALID_INPUT") },
      parsed.error === "payload_too_large" ? 413 : 400,
    );
  }
  try {
    const result = await decideLawyerRequest({
      db: requireD1(),
      requestId,
      lawyerUserId: user.id,
      decision: parsed.data.decision,
      message: parsed.data.message,
    });
    return response({ ok: true, ...result });
  } catch (error) {
    if (error instanceof LawyerRequestDecisionError) {
      return response(
        { code: error.code, error: localizedHandoffError(locale, error.code) },
        error.code === "DECISION_LOCKED" ? 409 : 404,
      );
    }
    throw error;
  }
});
