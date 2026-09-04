import { handleLogout } from "../../../../lib/auth/logout-handler";
import { withApiErrors } from "../../../../lib/document-builder/auth/api";

// Next passes a route context as the second handler argument. Keep that
// framework value out of handleLogout's injectable-dependencies slot.
export const POST = withApiErrors((request: Request) => handleLogout(request));
