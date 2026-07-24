import type { CollaborationDefinition, DocumentDefinition } from "./types";

export const STANDARD_COLLABORATION: CollaborationDefinition = Object.freeze({
  enabled: true,
  minimumParties: 1,
  maximumParties: 3,
  supportedRoles: ["owner", "party", "counterparty", "co-party", "representative", "editor", "commenter", "viewer", "legal-reviewer", "approver"],
  allowComments: true,
  allowSuggestions: true,
  allowDirectEditing: true,
  allowMentions: true,
  allowApprovals: true,
  requireAllRequiredPartiesApproval: false,
  blockGenerationOnUnresolvedComments: false,
}) as CollaborationDefinition;

export const RECEIPT_COLLABORATION: CollaborationDefinition = Object.freeze({
  ...STANDARD_COLLABORATION,
  minimumParties: 2,
  maximumParties: 3,
  requireAllRequiredPartiesApproval: true,
  partyFieldAssignments: [
    { partyNumber: 1, fieldPrefixes: ["lender", "notices.lender"] },
    { partyNumber: 2, fieldPrefixes: ["borrower", "notices.borrower"] },
    { partyNumber: 3, fieldPrefixes: ["witnesses"] },
  ],
}) as CollaborationDefinition;

export function withStandardCollaboration(definition: Omit<DocumentDefinition, "collaboration"> & Partial<Pick<DocumentDefinition, "collaboration">>): DocumentDefinition {
  return { ...definition, collaboration: definition.collaboration ?? STANDARD_COLLABORATION };
}
