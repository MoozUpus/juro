import { personalAiLawyerCompatibilityRoute } from "../../../../ai-lawyer-compat";

export function GET(
  request: Request,
  context: { params: Promise<{ locale: string; accountType: string; path?: string[] }> },
) {
  return personalAiLawyerCompatibilityRoute(request, context.params);
}
