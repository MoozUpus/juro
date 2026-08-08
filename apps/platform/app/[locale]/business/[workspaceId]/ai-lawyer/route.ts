import { businessAiLawyerCompatibilityRoute } from "../../../../ai-lawyer-compat";

export function GET(
  request: Request,
  context: { params: Promise<{ locale: string; workspaceId: string }> },
) {
  return businessAiLawyerCompatibilityRoute(
    request,
    context.params.then((params) => ({ ...params, path: undefined })),
  );
}
