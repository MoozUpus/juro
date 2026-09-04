import { handleLogout } from "../../../../lib/auth/logout-handler";
import { withApiErrors } from "../../../../lib/document-builder/auth/api";

export const POST = withApiErrors(handleLogout);
