import { businessAiLawyerCompatibilityRoute } from "../../../../../ai-lawyer-compat";

export function GET(
  request: Request,
  context: { params: Promise<{ locale: string; workspaceId: string; path?: string[] }> },
) {
  return businessAiLawyerCompatibilityRoute(request, context.params);
}
