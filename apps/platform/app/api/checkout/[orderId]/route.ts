import { readCheckoutOrder } from "../../../../lib/billing/checkout-service";
import { paymentFoundationStatus } from "../../../../lib/billing/foundation";
import { checkoutOrderParamsSchema, checkoutWorkspaceQuerySchema } from "../../../../lib/billing/input";
import { requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { workspaceForUser, workspaceForUserById } from "../../../../lib/platform/workspace";

type Context = { params: Promise<{ orderId: string }> };

export const GET = withApiErrors(async function GET(request: Request, context: Context) {
  const user = await requireApiUser();
  const url = new URL(request.url);
  const query = checkoutWorkspaceQuerySchema.safeParse({ workspaceId: url.searchParams.get("workspaceId") || undefined });
  const route = checkoutOrderParamsSchema.safeParse(await context.params);
  if (!query.success || !route.success) return Response.json({ code: "ORDER_UNAVAILABLE" }, { status: 404 });
  const requestedWorkspaceId = query.data.workspaceId;
  const workspace = requestedWorkspaceId
    ? await workspaceForUserById(user.id, requestedWorkspaceId)
    : await workspaceForUser(user);
  if (!workspace) return Response.json({ code: "ORDER_UNAVAILABLE" }, { status: 404 });
  const availability = paymentFoundationStatus(runtimeEnv());
  if (!availability.enabled) return Response.json({ code: "CHECKOUT_UNAVAILABLE", reason: availability.reason }, { status: 503 });
  const { orderId } = route.data;
  const checkout = await readCheckoutOrder(requireD1(), { userId: user.id, workspaceId: workspace.id }, orderId);
  if (!checkout) return Response.json({ code: "ORDER_UNAVAILABLE" }, { status: 404 });
  return Response.json({ ...checkout, availability }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
});
