import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../lib/document-builder/storage/runtime";
import { runtimeIdentityProtection } from "../../../lib/auth/identity-runtime";
import { handleOnboardingRequest } from "../../../lib/platform/onboarding";

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  return handleOnboardingRequest(request, {
    db: requireD1(),
    identityContext: runtimeIdentityProtection(),
    userId: user.id,
  });
});
