import { businessAiLawyerCompatibilityRoute } from "../../../../../../ai-lawyer-compat";

export function GET(
  request: Request,
  context: {
    params: Promise<{ locale: string; workspaceId: string; chatId: string }>;
  },
) {
  return businessAiLawyerCompatibilityRoute(
    request,
    context.params.then(({ chatId, ...params }) => ({
      ...params,
      path: ["chat", chatId],
    })),
  );
}
