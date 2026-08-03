import { personalAiLawyerCompatibilityRoute } from "../../../../../ai-lawyer-compat";

export function GET(
  request: Request,
  context: {
    params: Promise<{ locale: string; accountType: string; chatId: string }>;
  },
) {
  return personalAiLawyerCompatibilityRoute(
    request,
    context.params.then(({ chatId, ...params }) => ({
      ...params,
      path: ["chat", chatId],
    })),
  );
}
