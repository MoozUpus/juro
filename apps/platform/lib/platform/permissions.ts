import { ApiAuthError } from "../document-builder/auth/api";
import { canManageTeam } from "./role-policy";

export {
  canEditWorkspaceContent,
  canManageTeam,
  isWorkspaceRole,
  workspaceRoles,
  type WorkspaceRole,
} from "./role-policy";

export function requireTeamManager(role: string): void {
  if (!canManageTeam(role)) {
    throw new ApiAuthError("У вас нет права управлять участниками этого пространства.", 403);
  }
}
