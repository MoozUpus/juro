import { runtimeIdentityProtection } from "../../../../../../lib/auth/identity-runtime";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import {
  LawyerPhoneContactError,
  revealLawyerRequestPhone,
} from "../../../../../../lib/platform/lawyer-phone-contact";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

type Context = { params: Promise<{ requestId: string }> };

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const POST = withApiErrors(async function POST(
  request: Request,
  context: Context,
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { requestId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(requestId)) {
    return response({ code: "REQUEST_UNAVAILABLE", error: "Контакт недоступен / Aloqa mavjud emas." }, 404);
  }
  try {
    const phone = await revealLawyerRequestPhone({
      db: requireD1(),
      identity: runtimeIdentityProtection(),
      requestId,
      userId: user.id,
      activeWorkspaceId: workspace.id,
    });
    return response({ phone });
  } catch (error) {
    if (!(error instanceof LawyerPhoneContactError)) throw error;
    const message = error.code === "PHONE_UNAVAILABLE"
      ? "Номер телефона не указан / Telefon raqami ko‘rsatilmagan."
      : error.code === "IDENTITY_UNAVAILABLE"
        ? "Контакт временно недоступен / Aloqa vaqtincha mavjud emas."
        : "Контакт недоступен / Aloqa mavjud emas.";
    return response({ code: error.code, error: message }, error.status);
  }
});
