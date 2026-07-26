export type DocumentListFolder =
  | "all"
  | "created"
  | "favorite"
  | "archive"
  | "shared";

export const ACCEPTED_COLLABORATOR_JOIN_SQL =
  "c.invitation_status = 'accepted' AND c.can_view = 1 AND c.status IN ('active', 'opened', 'confirmed')";

export function isAcceptedDocumentCollaborator(input: {
  invitationStatus: string;
  status: string;
  canView: number | boolean;
}): boolean {
  return (
    input.invitationStatus === "accepted" &&
    Boolean(input.canView) &&
    ["active", "opened", "confirmed"].includes(input.status)
  );
}

export function isActiveWorkspaceDocumentOwner(input: {
  documentOwnerUserId: string;
  requestingUserId: string;
  documentWorkspaceId: string | null;
  activeWorkspaceId: string;
}): boolean {
  return (
    input.documentOwnerUserId === input.requestingUserId &&
    input.documentWorkspaceId === input.activeWorkspaceId
  );
}

export function documentListScope(
  folder: DocumentListFolder,
  userId: string,
  activeWorkspaceId: string,
): {
  clauses: string[];
  bindings: string[];
  includeStandaloneFiles: boolean;
} {
  if (folder === "shared") {
    return {
      clauses: ["d.owner_user_id <> ?", "c.user_id = ?"],
      bindings: [userId, userId],
      includeStandaloneFiles: false,
    };
  }
  return {
    clauses: [
      "d.workspace_id = ?",
      "(d.owner_user_id = ? OR c.user_id = ?)",
    ],
    bindings: [activeWorkspaceId, userId, userId],
    includeStandaloneFiles: true,
  };
}
