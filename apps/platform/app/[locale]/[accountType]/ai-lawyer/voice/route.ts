import { personalAiLawyerCompatibilityRoute } from "../../../../ai-lawyer-compat";

export function GET(
  request: Request,
  context: { params: Promise<{ locale: string; accountType: string }> },
) {
  return personalAiLawyerCompatibilityRoute(
    request,
    context.params.then((params) => ({ ...params, path: ["voice"] })),
  );
}
