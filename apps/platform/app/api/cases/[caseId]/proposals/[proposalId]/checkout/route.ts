import { parseJsonRequest } from "../../../../../../../lib/auth/input";
import { authLocaleFromRequest } from "../../../../../../../lib/auth/request-locale";
import { createMarketplaceServiceCheckout } from "../../../../../../../lib/billing/marketplace-service";
import { BillingDomainError } from "../../../../../../../lib/billing/checkout-service";
import { paymentFoundationStatus } from "../../../../../../../lib/billing/foundation";
import { billingErrorMessage } from "../../../../../../../lib/billing/localization";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser, workspaceForUserById } from "../../../../../../../lib/platform/workspace";
import { z } from "zod";

const body = z.object({
  requestId: z.uuid(),
  workspaceId: z.string().min(3).max(128).optional(),
}).strict();

type Ctx = { params: Promise<{ caseId: string; proposalId: string }> };

export const POST = withApiErrors(async function POST(request: Request, context: Ctx) {
  assertSafeWrite(request);
  const locale = authLocaleFromRequest(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, body, 1_024);
  const { caseId, proposalId } = await context.params;

  if (!parsed.ok) {
    return Response.json({
      code: "INVALID_INPUT",
      error: billingErrorMessage("INVALID_INPUT", locale),
    }, { status: 400 });
  }

  const workspace = parsed.data.workspaceId
    ? await workspaceForUserById(user.id, parsed.data.workspaceId)
    : await workspaceForUser(user);
  if (!workspace) {
    return Response.json({
      code: "WORKSPACE_UNAVAILABLE",
      error: billingErrorMessage("WORKSPACE_UNAVAILABLE", locale),
    }, { status: 404 });
  }

  if (!paymentFoundationStatus(runtimeEnv()).enabled) {
    return Response.json({
      code: "CHECKOUT_UNAVAILABLE",
      error: billingErrorMessage("CHECKOUT_UNAVAILABLE", locale),
    }, { status: 503 });
  }

  const owned = await requireD1().prepare(
    "SELECT id FROM cases WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1",
  ).bind(caseId, workspace.id, user.id).first();
  if (!owned) {
    return Response.json({
      code: "CASE_UNAVAILABLE",
      error: billingErrorMessage("CASE_UNAVAILABLE", locale),
    }, { status: 404 });
  }

  try {
    const result = await createMarketplaceServiceCheckout(
      requireD1(),
      { userId: user.id, workspaceId: workspace.id },
      { proposalId, requestId: parsed.data.requestId },
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BillingDomainError) {
      return Response.json({
        code: error.code,
        error: billingErrorMessage(error.code, locale),
      }, { status: error.status });
    }
    throw error;
  }
});
