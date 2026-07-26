import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    locale: text("locale").notNull().default("ru"),
    ...timestamps,
  },
  (table) => [
    index("workspaces_type_idx").on(table.type, table.createdAt),
  ],
);

export const userProfiles = sqliteTable(
  "user_profiles",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    emailCiphertext: text("email_ciphertext"),
    emailIv: text("email_iv"),
    emailKeyVersion: text("email_key_version"),
    emailLookupHash: text("email_lookup_hash"),
    emailLookupKeyVersion: text("email_lookup_key_version"),
    fullName: text("full_name"),
    birthDate: text("birth_date"),
    idDocumentType: text("id_document_type"),
    idDocumentNumber: text("id_document_number"),
    idIssuedBy: text("id_issued_by"),
    idIssueDate: text("id_issue_date"),
    pinfl: text("pinfl"),
    registeredAddress: text("registered_address"),
    phone: text("phone"),
    phoneCiphertext: text("phone_ciphertext"),
    phoneIv: text("phone_iv"),
    phoneKeyVersion: text("phone_key_version"),
    phoneLookupHash: text("phone_lookup_hash"),
    phoneLookupKeyVersion: text("phone_lookup_key_version"),
    locale: text("locale").notNull().default("ru"),
    accountType: text("account_type").notNull().default("individual"),
    companyName: text("company_name"),
    organizationRole: text("organization_role"),
    primaryGoal: text("primary_goal"),
    timezone: text("timezone").notNull().default("Asia/Tashkent"),
    defaultWorkspaceId: text("default_workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    onboardingCompletedAt: text("onboarding_completed_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_profiles_email_uidx").on(table.email),
    uniqueIndex("user_profiles_email_lookup_uidx")
      .on(table.emailLookupKeyVersion, table.emailLookupHash)
      .where(sql`${table.emailLookupHash} IS NOT NULL`),
    index("user_profiles_phone_lookup_idx")
      .on(table.phoneLookupKeyVersion, table.phoneLookupHash)
      .where(sql`${table.phoneLookupHash} IS NOT NULL`),
  ],
);

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
    joinedAt: text("joined_at").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_members_uidx").on(table.workspaceId, table.userId),
    index("workspace_members_user_idx").on(table.userId, table.status),
  ],
);

export const workspaceInvitations = sqliteTable(
  "workspace_invitations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    invitedByUserId: text("invited_by_user_id").notNull().references(() => userProfiles.id),
    email: text("email"),
    emailHash: text("email_hash").notNull(),
    emailCiphertext: text("email_ciphertext"),
    emailIv: text("email_iv"),
    emailKeyVersion: text("email_key_version"),
    emailLookupHash: text("email_lookup_hash"),
    emailLookupKeyVersion: text("email_lookup_key_version"),
    tokenHash: text("token_hash").notNull(),
    role: text("role").notNull(),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    revokedAt: text("revoked_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_invitations_token_uidx").on(table.tokenHash),
    index("workspace_invitations_workspace_idx").on(table.workspaceId, table.expiresAt),
    index("workspace_invitations_email_lookup_idx")
      .on(
        table.workspaceId,
        table.emailLookupKeyVersion,
        table.emailLookupHash,
      )
      .where(sql`${table.emailLookupHash} IS NOT NULL`),
  ],
);

export const workspaceAuditEvents = sqliteTable(
  "workspace_audit_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => userProfiles.id, { onDelete: "set null" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    metadataJson: text("metadata_json"),
    ipHash: text("ip_hash"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("workspace_audit_events_workspace_idx").on(table.workspaceId, table.createdAt),
    index("workspace_audit_events_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const consents = sqliteTable(
  "consents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    version: text("version").notNull(),
    scopeJson: text("scope_json"),
    grantedAt: text("granted_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    index("consents_user_idx").on(table.userId, table.type, table.grantedAt),
    index("consents_workspace_idx").on(table.workspaceId, table.type),
  ],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    fullName: text("full_name").notNull(),
    birthDate: text("birth_date"),
    idDocumentType: text("id_document_type"),
    idDocumentNumber: text("id_document_number"),
    idIssuedBy: text("id_issued_by"),
    idIssueDate: text("id_issue_date"),
    pinfl: text("pinfl"),
    registeredAddress: text("registered_address"),
    phone: text("phone"),
    ...timestamps,
  },
  (table) => [index("contacts_owner_idx").on(table.ownerUserId)],
);

export const documentTemplates = sqliteTable("document_templates", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  category: text("category").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const documentTemplateLocales = sqliteTable(
  "document_template_locales",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id").notNull().references(() => documentTemplates.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    name: text("name").notNull(),
    sourceObjectKey: text("source_object_key"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("template_locales_uidx").on(table.templateId, table.language)],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull().references(() => documentTemplates.id),
    templateCode: text("template_code"),
    templateVersion: text("template_version"),
    language: text("language").notNull(),
    participantMode: text("participant_mode").notNull(),
    actingSide: text("acting_side"),
    title: text("title").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    caseId: text("case_id"),
    planStepId: text("plan_step_id"),
    lenderName: text("lender_name"),
    borrowerName: text("borrower_name"),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    archivedAt: text("archived_at"),
    generatedAt: text("generated_at"),
    signedFileId: text("signed_file_id"),
    revision: integer("revision").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("documents_owner_idx").on(table.ownerUserId),
    index("documents_status_idx").on(table.status),
    index("documents_updated_idx").on(table.updatedAt),
    index("documents_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
    index("documents_case_idx").on(table.caseId, table.updatedAt),
    index("documents_plan_step_idx").on(table.planStepId),
  ],
);

export const documentAnswers = sqliteTable("document_answers", {
  documentId: text("document_id").primaryKey().references(() => documents.id, { onDelete: "cascade" }),
  answersJson: text("answers_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const documentCurrentContent = sqliteTable("document_current_content", {
  documentId: text("document_id").primaryKey().references(() => documents.id, { onDelete: "cascade" }),
  autoContent: text("auto_content").notNull(),
  finalContent: text("final_content").notNull(),
  manuallyEdited: integer("manually_edited", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});

export const documentFiles = sqliteTable(
  "document_files",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: text("document_id").references(() => documents.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    r2Key: text("r2_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("document_files_document_idx").on(table.documentId),
    index("document_files_owner_idx").on(table.ownerUserId),
    index("document_files_workspace_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const documentAttachments = sqliteTable(
  "document_attachments",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    fileId: text("file_id").notNull().references(() => documentFiles.id, { onDelete: "cascade" }),
    visibleToCollaborator: integer("visible_to_collaborator", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("document_attachments_document_idx").on(table.documentId)],
);

export const documentCollaborators = sqliteTable(
  "document_collaborators",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    invitedByUserId: text("invited_by_user_id").notNull().references(() => userProfiles.id),
    role: text("role").notNull(),
    partyNumber: integer("party_number"),
    permissionSetJson: text("permission_set_json"),
    invitationStatus: text("invitation_status").notNull().default("accepted"),
    approvalStatus: text("approval_status").notNull().default("pending"),
    canView: integer("can_view", { mode: "boolean" }).notNull().default(true),
    canDownload: integer("can_download", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull(),
    openedAt: text("opened_at"),
    confirmedAt: text("confirmed_at"),
    joinedAt: text("joined_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("document_collaborators_uidx").on(table.documentId, table.userId),
    index("document_collaborators_user_idx").on(table.userId),
  ],
);

export const documentInvitations = sqliteTable(
  "document_invitations",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    invitedByUserId: text("invited_by_user_id").notNull().references(() => userProfiles.id),
    targetUserId: text("target_user_id").references(() => userProfiles.id, { onDelete: "set null" }),
    targetIdentifierHash: text("target_identifier_hash"),
    targetIdentifierKind: text("target_identifier_kind"),
    targetIdentifierLookupHash: text("target_identifier_lookup_hash"),
    targetIdentifierLookupKeyVersion: text("target_identifier_lookup_key_version"),
    role: text("role").notNull(),
    partyNumber: integer("party_number"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    declinedAt: text("declined_at"),
    revokedAt: text("revoked_at"),
    ...timestamps,
  },
  (table) => [
    index("document_invitations_document_idx").on(table.documentId),
    index("document_invitations_target_idx").on(table.targetUserId),
    index("document_invitations_target_lookup_idx")
      .on(
        table.targetIdentifierKind,
        table.targetIdentifierLookupKeyVersion,
        table.targetIdentifierLookupHash,
      )
      .where(sql`${table.targetIdentifierLookupHash} IS NOT NULL`),
  ],
);

export const documentPermissions = sqliteTable(
  "document_permissions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    grantedByUserId: text("granted_by_user_id").notNull().references(() => userProfiles.id),
    revokedAt: text("revoked_at"),
    ...timestamps,
  },
  (table) => [uniqueIndex("document_permissions_uidx").on(table.documentId, table.userId, table.permission)],
);

export const documentCommentThreads = sqliteTable(
  "document_comment_threads",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    anchorType: text("anchor_type").notNull().default("document"),
    anchorKey: text("anchor_key"),
    createdByUserId: text("created_by_user_id").notNull().references(() => userProfiles.id),
    status: text("status").notNull().default("open"),
    resolvedByUserId: text("resolved_by_user_id").references(() => userProfiles.id),
    resolvedAt: text("resolved_at"),
    reopenedAt: text("reopened_at"),
    ...timestamps,
  },
  (table) => [index("document_comment_threads_document_idx").on(table.documentId, table.status)],
);

export const documentComments = sqliteTable(
  "document_comments",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull().references(() => userProfiles.id),
    threadId: text("thread_id").references(() => documentCommentThreads.id, { onDelete: "set null" }),
    parentCommentId: text("parent_comment_id"),
    body: text("body").notNull(),
    anchor: text("anchor"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at"),
  },
  (table) => [index("document_comments_document_idx").on(table.documentId)],
);

export const documentSuggestions = sqliteTable(
  "document_suggestions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull().references(() => userProfiles.id),
    fieldKey: text("field_key"),
    originalJson: text("original_json").notNull(),
    proposedJson: text("proposed_json").notNull(),
    status: text("status").notNull().default("pending"),
    decidedByUserId: text("decided_by_user_id").references(() => userProfiles.id),
    decidedAt: text("decided_at"),
    ...timestamps,
  },
  (table) => [index("document_suggestions_document_idx").on(table.documentId, table.status)],
);

export const documentRevisions = sqliteTable(
  "document_revisions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    actorUserId: text("actor_user_id").references(() => userProfiles.id, { onDelete: "set null" }),
    source: text("source").notNull(),
    changesJson: text("changes_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("document_revisions_uidx").on(table.documentId, table.revision)],
);

export const documentApprovals = sqliteTable(
  "document_approvals",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    participantUserId: text("participant_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    revision: integer("revision").notNull(),
    approvedAt: text("approved_at"),
    revokedAt: text("revoked_at"),
    ...timestamps,
  },
  (table) => [uniqueIndex("document_approvals_uidx").on(table.documentId, table.participantUserId, table.revision)],
);

export const documentChangeProposals = sqliteTable(
  "document_change_proposals",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull().references(() => userProfiles.id),
    oldText: text("old_text").notNull(),
    newText: text("new_text").notNull(),
    anchor: text("anchor"),
    ownerAccepted: integer("owner_accepted", { mode: "boolean" }).notNull().default(false),
    collaboratorAccepted: integer("collaborator_accepted", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("document_change_proposals_document_idx").on(table.documentId)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    documentId: text("document_id").references(() => documents.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("notifications_user_idx").on(table.userId, table.createdAt)],
);

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => userProfiles.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("activity_events_document_idx").on(table.documentId, table.createdAt)],
);

export const documentShareLinks = sqliteTable(
  "document_share_links",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    publicToken: text("public_token").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("document_share_links_document_idx").on(table.documentId)],
);

export const signedDocumentAccess = sqliteTable(
  "signed_document_access",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    collaboratorUserId: text("collaborator_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    viewAllowed: integer("view_allowed", { mode: "boolean" }).notNull().default(false),
    downloadAllowed: integer("download_allowed", { mode: "boolean" }).notNull().default(false),
    opened: integer("opened", { mode: "boolean" }).notNull().default(false),
    restoredViewOnly: integer("restored_view_only", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("signed_document_access_uidx").on(table.documentId, table.collaboratorUserId)],
);

export const standaloneSignedPdfShares = sqliteTable(
  "standalone_signed_pdf_shares",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id").notNull().references(() => documentFiles.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    publicToken: text("public_token").notNull(),
    accessCode: text("access_code").notNull(),
    accessCodeHash: text("access_code_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    deactivatedAt: text("deactivated_at"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("standalone_signed_pdf_shares_file_idx").on(table.fileId)],
);

export const signedShareSessions = sqliteTable(
  "signed_share_sessions",
  {
    id: text("id").primaryKey(),
    shareId: text("share_id").notNull().references(() => standaloneSignedPdfShares.id, { onDelete: "cascade" }),
    sessionHash: text("session_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("signed_share_sessions_share_idx").on(table.shareId)],
);

export const consultationRequests = sqliteTable(
  "consultation_requests",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    requesterUserId: text("requester_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    consultationType: text("consultation_type").notNull(),
    contextJson: text("context_json").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("consultation_requests_user_idx").on(table.requesterUserId)],
);

export const authOtpChallenges = sqliteTable("auth_otp_challenges", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  emailHash: text("email_hash").notNull(),
  emailLookupHash: text("email_lookup_hash"),
  emailLookupKeyVersion: text("email_lookup_key_version"),
  purpose: text("purpose").notNull(),
  locale: text("locale").notNull().default("ru"),
  accountType: text("account_type").notNull().default("individual"),
  codeSalt: text("code_salt").notNull(),
  codeHash: text("code_hash").notNull(),
  codeHmac: text("code_hmac"),
  codeKeyVersion: text("code_key_version"),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  invalidatedAt: text("invalidated_at"),
  requestIpHash: text("request_ip_hash"),
  requestIpLookupHash: text("request_ip_lookup_hash"),
  requestIpLookupKeyVersion: text("request_ip_lookup_key_version"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("auth_otp_email_idx").on(table.emailHash, table.createdAt),
  index("auth_otp_email_lookup_idx").on(
    table.emailLookupKeyVersion,
    table.emailLookupHash,
    table.createdAt,
  ),
  index("auth_otp_ip_created_idx").on(table.requestIpHash, table.createdAt),
  index("auth_otp_ip_lookup_created_idx").on(
    table.requestIpLookupKeyVersion,
    table.requestIpLookupHash,
    table.createdAt,
  ),
  index("auth_otp_expiry_idx").on(table.expiresAt),
]);

export const authDevices = sqliteTable("auth_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  userAgentHash: text("user_agent_hash"),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  revokedAt: text("revoked_at"),
}, (table) => [
  index("auth_devices_user_idx").on(table.userId, table.lastSeenAt),
]);

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  deviceId: text("device_id").references(() => authDevices.id, { onDelete: "set null" }),
  tokenHash: text("token_hash").notNull(),
  authMethod: text("auth_method").notNull().default("email_otp"),
  assuranceLevel: text("assurance_level").notNull().default("primary"),
  authenticatedAt: text("authenticated_at"),
  mfaVerifiedAt: text("mfa_verified_at"),
  expiresAt: text("expires_at").notNull(),
  idleExpiresAt: text("idle_expires_at"),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [
  uniqueIndex("auth_sessions_token_uidx").on(table.tokenHash),
  index("auth_sessions_user_idx").on(table.userId, table.expiresAt),
  index("auth_sessions_device_idx").on(table.deviceId, table.expiresAt),
]);

export const emailChangeChallenges = sqliteTable(
  "email_change_challenges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => userProfiles.id, {
      onDelete: "cascade",
    }),
    sessionId: text("session_id").references(() => authSessions.id, {
      onDelete: "set null",
    }),
    currentEmailHash: text("current_email_hash").notNull(),
    currentEmailLookupHash: text("current_email_lookup_hash"),
    currentEmailLookupKeyVersion: text(
      "current_email_lookup_key_version",
    ),
    newEmail: text("new_email").notNull(),
    newEmailCiphertext: text("new_email_ciphertext"),
    newEmailIv: text("new_email_iv"),
    newEmailKeyVersion: text("new_email_key_version"),
    newEmailLookupHash: text("new_email_lookup_hash"),
    newEmailLookupKeyVersion: text("new_email_lookup_key_version"),
    currentCodeSalt: text("current_code_salt").notNull(),
    currentCodeHash: text("current_code_hash").notNull(),
    currentCodeHmac: text("current_code_hmac"),
    currentCodeKeyVersion: text("current_code_key_version"),
    newCodeSalt: text("new_code_salt").notNull(),
    newCodeHash: text("new_code_hash").notNull(),
    newCodeHmac: text("new_code_hmac"),
    newCodeKeyVersion: text("new_code_key_version"),
    locale: text("locale").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    expiresAt: text("expires_at").notNull(),
    codesQueuedAt: text("codes_queued_at"),
    consumedAt: text("consumed_at"),
    consumedByOperationId: text("consumed_by_operation_id"),
    invalidatedAt: text("invalidated_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "email_change_challenges_locale_check",
      sql`${table.locale} IN ('ru','uz')`,
    ),
    check(
      "email_change_challenges_attempts_check",
      sql`${table.attemptCount} >= 0 AND ${table.attemptCount} <= ${table.maxAttempts} AND ${table.maxAttempts} BETWEEN 1 AND 10`,
    ),
    uniqueIndex("email_change_challenges_operation_uidx").on(
      table.consumedByOperationId,
    ),
    uniqueIndex("email_change_challenges_active_user_uidx")
      .on(table.userId)
      .where(
        sql`${table.consumedAt} IS NULL AND ${table.invalidatedAt} IS NULL`,
      ),
    index("email_change_challenges_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("email_change_challenges_new_email_lookup_idx").on(
      table.newEmailLookupKeyVersion,
      table.newEmailLookupHash,
      table.createdAt,
    ),
    index("email_change_challenges_expiry_idx").on(table.expiresAt),
  ],
);

export const authTotpCredentials = sqliteTable("auth_totp_credentials", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  secretCiphertext: text("secret_ciphertext").notNull(),
  secretIv: text("secret_iv").notNull(),
  keyVersion: text("key_version").notNull(),
  algorithm: text("algorithm").notNull().default("SHA1"),
  digits: integer("digits").notNull().default(6),
  periodSeconds: integer("period_seconds").notNull().default(30),
  verificationAttemptCount: integer("verification_attempt_count").notNull().default(0),
  verificationMaxAttempts: integer("verification_max_attempts").notNull().default(5),
  lastUsedStep: integer("last_used_step"),
  backupBatchId: text("backup_batch_id"),
  backupKeyVersion: text("backup_key_version"),
  enrollmentExpiresAt: text("enrollment_expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  verifiedAt: text("verified_at"),
  disabledAt: text("disabled_at"),
}, (table) => [
  check(
    "auth_totp_status_check",
    sql`${table.status} IN ('pending','active','disabled')`,
  ),
  check("auth_totp_algorithm_check", sql`${table.algorithm} = 'SHA1'`),
  check("auth_totp_digits_check", sql`${table.digits} = 6`),
  check("auth_totp_period_check", sql`${table.periodSeconds} = 30`),
  check(
    "auth_totp_attempts_check",
    sql`${table.verificationAttemptCount} >= 0 AND ${table.verificationMaxAttempts} BETWEEN 1 AND 10`,
  ),
  index("auth_totp_user_status_idx").on(table.userId, table.status),
  uniqueIndex("auth_totp_live_user_uidx")
    .on(table.userId)
    .where(sql`${table.status} IN ('pending','active')`),
]);

export const authBackupCodes = sqliteTable("auth_backup_codes", {
  id: text("id").primaryKey(),
  credentialId: text("credential_id").notNull().references(() => authTotpCredentials.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  batchId: text("batch_id").notNull(),
  codeHmac: text("code_hmac").notNull(),
  keyVersion: text("key_version").notNull(),
  usedAt: text("used_at"),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("auth_backup_codes_hmac_uidx").on(table.codeHmac),
  index("auth_backup_codes_user_batch_idx").on(
    table.userId,
    table.batchId,
    table.usedAt,
  ),
  index("auth_backup_codes_credential_idx").on(
    table.credentialId,
    table.createdAt,
  ),
]);

export const authMfaChallenges = sqliteTable("auth_mfa_challenges", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().references(() => authTotpCredentials.id, { onDelete: "cascade" }),
  emailOtpChallengeId: text("email_otp_challenge_id").notNull().references(() => authOtpChallenges.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull().default("login"),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  requestUserAgentHmac: text("request_user_agent_hmac"),
  evidenceKeyVersion: text("evidence_key_version"),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  invalidatedAt: text("invalidated_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  check(
    "auth_mfa_challenges_purpose_check",
    sql`${table.purpose} IN ('login')`,
  ),
  check(
    "auth_mfa_challenges_attempts_check",
    sql`${table.attemptCount} >= 0 AND ${table.maxAttempts} BETWEEN 1 AND 10`,
  ),
  uniqueIndex("auth_mfa_challenges_token_uidx").on(table.tokenHash),
  uniqueIndex("auth_mfa_challenges_email_otp_uidx").on(
    table.emailOtpChallengeId,
  ),
  uniqueIndex("auth_mfa_challenges_active_user_uidx")
    .on(table.userId, table.purpose)
    .where(sql`${table.consumedAt} IS NULL AND ${table.invalidatedAt} IS NULL`),
  index("auth_mfa_challenges_expiry_idx").on(table.expiresAt),
]);

export const authMfaFactorClaims = sqliteTable("auth_mfa_factor_claims", {
  id: text("id").primaryKey(),
  operationId: text("operation_id").notNull(),
  credentialId: text("credential_id").notNull().references(() => authTotpCredentials.id, { onDelete: "cascade" }),
  factorType: text("factor_type").notNull(),
  factorKey: text("factor_key").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  check(
    "auth_mfa_claims_factor_type_check",
    sql`${table.factorType} IN ('totp','backup_code')`,
  ),
  uniqueIndex("auth_mfa_claims_operation_uidx").on(table.operationId),
  uniqueIndex("auth_mfa_claims_factor_uidx").on(
    table.credentialId,
    table.factorType,
    table.factorKey,
  ),
  index("auth_mfa_claims_created_idx").on(table.createdAt),
]);

export const securityEvents = sqliteTable("security_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id"),
  deviceId: text("device_id"),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  authSource: text("auth_source"),
  assuranceLevel: text("assurance_level"),
  ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"),
  metadataJson: text("metadata_json"),
  previousHash: text("previous_hash").notNull(),
  eventHash: text("event_hash").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("security_events_hash_uidx").on(table.eventHash),
  uniqueIndex("security_events_chain_uidx").on(table.userId, table.previousHash),
  index("security_events_user_idx").on(table.userId, table.createdAt),
  index("security_events_type_idx").on(table.eventType, table.createdAt),
]);

export const platformStaffAssignments = sqliteTable(
  "platform_staff_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => userProfiles.id),
    role: text("role").notNull(),
    grantSource: text("grant_source").notNull(),
    grantedByUserId: text("granted_by_user_id").references(
      () => userProfiles.id,
    ),
    grantReason: text("grant_reason").notNull(),
    grantedAt: text("granted_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    revocationSource: text("revocation_source"),
    revokedByUserId: text("revoked_by_user_id").references(
      () => userProfiles.id,
    ),
    revocationReason: text("revocation_reason"),
    ...timestamps,
  },
  (table) => [
    check(
      "platform_staff_assignments_role_check",
      sql`${table.role} IN ('administrator','support','legal_reviewer')`,
    ),
    check(
      "platform_staff_assignments_grant_source_check",
      sql`${table.grantSource} IN ('operator_bootstrap','administrator')`,
    ),
    check(
      "platform_staff_assignments_grant_actor_check",
      sql`(
        (${table.grantSource} = 'operator_bootstrap'
          AND ${table.grantedByUserId} IS NULL)
        OR
        (${table.grantSource} = 'administrator'
          AND ${table.grantedByUserId} IS NOT NULL
          AND ${table.grantedByUserId} <> ${table.userId})
      )`,
    ),
    check(
      "platform_staff_assignments_grant_reason_check",
      sql`length(trim(${table.grantReason})) BETWEEN 1 AND 500`,
    ),
    check(
      "platform_staff_assignments_time_check",
      sql`${table.expiresAt} > ${table.grantedAt}
        AND ${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "platform_staff_assignments_revocation_check",
      sql`(
        ${table.revokedAt} IS NULL
        AND ${table.revocationSource} IS NULL
        AND ${table.revokedByUserId} IS NULL
        AND ${table.revocationReason} IS NULL
      ) OR (
        ${table.revokedAt} IS NOT NULL
        AND ${table.revocationSource} IN ('operator','administrator')
        AND (
          (${table.revocationSource} = 'operator'
            AND ${table.revokedByUserId} IS NULL)
          OR
          (${table.revocationSource} = 'administrator'
            AND ${table.revokedByUserId} IS NOT NULL)
        )
        AND length(trim(${table.revocationReason})) BETWEEN 1 AND 500
        AND ${table.revokedAt} >= ${table.grantedAt}
      )`,
    ),
    uniqueIndex("platform_staff_assignments_active_uidx")
      .on(table.userId, table.role)
      .where(sql`${table.revokedAt} IS NULL`),
    index("platform_staff_assignments_user_idx").on(
      table.userId,
      table.expiresAt,
    ),
    index("platform_staff_assignments_role_idx").on(
      table.role,
      table.expiresAt,
    ),
  ],
);

export const platformStaffRoleEvents = sqliteTable(
  "platform_staff_role_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull().references(
      () => userProfiles.id,
    ),
    actorSessionId: text("actor_session_id").notNull(),
    actorAssignmentId: text("actor_assignment_id").notNull().references(
      () => platformStaffAssignments.id,
    ),
    subjectUserId: text("subject_user_id").notNull().references(
      () => userProfiles.id,
    ),
    subjectAssignmentId: text("subject_assignment_id").notNull().references(
      () => platformStaffAssignments.id,
    ),
    eventType: text("event_type").notNull(),
    capability: text("capability").notNull(),
    role: text("role").notNull(),
    reason: text("reason").notNull(),
    actorMfaVerifiedAt: text("actor_mfa_verified_at").notNull(),
    previousHash: text("previous_hash").notNull(),
    eventHash: text("event_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "platform_staff_role_events_type_check",
      sql`${table.eventType} IN ('staff.role.granted','staff.role.revoked')`,
    ),
    check(
      "platform_staff_role_events_capability_check",
      sql`${table.capability} = 'staff.roles.manage'`,
    ),
    check(
      "platform_staff_role_events_role_check",
      sql`${table.role} IN ('administrator','support','legal_reviewer')`,
    ),
    check(
      "platform_staff_role_events_reason_check",
      sql`length(trim(${table.reason})) BETWEEN 1 AND 500`,
    ),
    check(
      "platform_staff_role_events_hash_check",
      sql`length(${table.previousHash}) = 64
        AND length(${table.eventHash}) = 64`,
    ),
    check(
      "platform_staff_role_events_mfa_time_check",
      sql`${table.actorMfaVerifiedAt} <= ${table.createdAt}`,
    ),
    uniqueIndex("platform_staff_role_events_hash_uidx").on(
      table.eventHash,
    ),
    uniqueIndex("platform_staff_role_events_chain_uidx").on(
      table.actorUserId,
      table.previousHash,
    ),
    uniqueIndex("platform_staff_role_events_assignment_type_uidx").on(
      table.subjectAssignmentId,
      table.eventType,
    ),
    index("platform_staff_role_events_actor_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
    index("platform_staff_role_events_subject_idx").on(
      table.subjectUserId,
      table.createdAt,
    ),
  ],
);

export const policyDocuments = sqliteTable("policy_documents", {
  id: text("id").primaryKey(),
  documentKey: text("document_key").notNull(),
  documentVersion: text("document_version").notNull(),
  locale: text("locale").notNull(),
  contentSha256: text("content_sha256").notNull(),
  status: text("status").notNull(),
  effectiveAt: text("effective_at"),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  check("policy_documents_locale_check", sql`${table.locale} IN ('ru','uz')`),
  check(
    "policy_documents_status_check",
    sql`${table.status} IN ('draft','approved','superseded')`,
  ),
  check(
    "policy_documents_sha256_check",
    sql`length(${table.contentSha256}) = 64`,
  ),
  uniqueIndex("policy_documents_version_uidx").on(
    table.documentKey,
    table.documentVersion,
    table.locale,
  ),
  index("policy_documents_status_idx").on(
    table.status,
    table.documentKey,
  ),
]);

export const userAcceptances = sqliteTable("user_acceptances", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  policyDocumentId: text("policy_document_id").references(() => policyDocuments.id, { onDelete: "restrict" }),
  documentKey: text("document_key").notNull(),
  documentVersion: text("document_version").notNull(),
  locale: text("locale"),
  contentSha256: text("content_sha256"),
  acceptanceMethod: text("acceptance_method"),
  authSource: text("auth_source"),
  sessionId: text("session_id").references(() => authSessions.id, { onDelete: "set null" }),
  evidenceJson: text("evidence_json"),
  acceptedAt: text("accepted_at").notNull(),
}, (table) => [
  uniqueIndex("user_acceptances_uidx").on(
    table.userId,
    table.documentKey,
    table.documentVersion,
  ),
  index("user_acceptances_policy_idx").on(
    table.policyDocumentId,
    table.acceptedAt,
  ),
]);

export const cases = sqliteTable("cases", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }), ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  accountType: text("account_type").notNull(), locale: text("locale").notNull(), title: text("title").notNull(), description: text("description"), legalArea: text("legal_area").notNull(),
  status: text("status").notNull().default("open"), currentRevision: integer("current_revision").notNull().default(1), nextDeadlineAt: text("next_deadline_at"), archivedAt: text("archived_at"), ...timestamps,
}, (table) => [index("cases_owner_idx").on(table.ownerUserId, table.updatedAt), index("cases_workspace_idx").on(table.workspaceId, table.updatedAt)]);

export const caseEvents = sqliteTable("case_events", {
  id: text("id").primaryKey(), caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }), actorUserId: text("actor_user_id").references(() => userProfiles.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(), metadataJson: text("metadata_json"), createdAt: text("created_at").notNull(),
}, (table) => [index("case_events_case_idx").on(table.caseId, table.createdAt)]);

export const actionPlans = sqliteTable("action_plans", {
  id: text("id").primaryKey(), caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }), createdByUserId: text("created_by_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(), status: text("status").notNull().default("in_progress"), progressPercent: integer("progress_percent").notNull().default(0), currentRevision: integer("current_revision").notNull().default(1), ...timestamps,
}, (table) => [uniqueIndex("action_plans_case_uidx").on(table.caseId)]);

export const actionPlanSteps = sqliteTable("action_plan_steps", {
  id: text("id").primaryKey(), planId: text("plan_id").notNull().references(() => actionPlans.id, { onDelete: "cascade" }), ordinal: integer("ordinal").notNull(), title: text("title").notNull(),
  description: text("description"), status: text("status").notNull().default("not_started"), deadlineType: text("deadline_type").notNull().default("calendar_days"), dueAt: text("due_at"),
  assigneeUserId: text("assignee_user_id").references(() => userProfiles.id, { onDelete: "set null" }), actionType: text("action_type"), templateCode: text("template_code"), completedAt: text("completed_at"),
  revision: integer("revision").notNull().default(1), ...timestamps,
}, (table) => [uniqueIndex("action_plan_steps_order_uidx").on(table.planId, table.ordinal), index("action_plan_steps_due_idx").on(table.dueAt, table.status)]);

export const consultationSlots = sqliteTable("consultation_slots", {
  id: text("id").primaryKey(), specialistType: text("specialist_type").notNull(), startsAt: text("starts_at").notNull(), endsAt: text("ends_at").notNull(), timezone: text("timezone").notNull().default("Asia/Tashkent"),
  status: text("status").notNull().default("available"), ...timestamps,
}, (table) => [uniqueIndex("consultation_slots_time_uidx").on(table.specialistType, table.startsAt, table.endsAt)]);

export const consultationBookings = sqliteTable("consultation_bookings", {
  id: text("id").primaryKey(), slotId: text("slot_id").notNull().references(() => consultationSlots.id), requesterUserId: text("requester_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }), caseId: text("case_id").references(() => cases.id, { onDelete: "set null" }), planStepId: text("plan_step_id").references(() => actionPlanSteps.id, { onDelete: "set null" }),
  status: text("status").notNull().default("confirmed"), contextJson: text("context_json").notNull(), ...timestamps,
}, (table) => [uniqueIndex("consultation_bookings_slot_uidx").on(table.slotId), index("consultation_bookings_user_idx").on(table.requesterUserId, table.createdAt)]);

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  caseId: text("case_id").references(() => cases.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  locale: text("locale").notNull(),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [index("conversations_workspace_idx").on(table.workspaceId, table.updatedAt)]);

export const conversationMessages = sqliteTable("conversation_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  authorType: text("author_type").notNull(),
  content: text("content").notNull(),
  structuredJson: text("structured_json"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("conversation_messages_conversation_idx").on(table.conversationId, table.createdAt)]);

export const confirmedFacts = sqliteTable("confirmed_facts", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  caseId: text("case_id").references(() => cases.id, { onDelete: "cascade" }),
  statement: text("statement").notNull(),
  status: text("status").notNull().default("proposed"),
  confirmedByUserId: text("confirmed_by_user_id").references(() => userProfiles.id, { onDelete: "set null" }),
  confirmedAt: text("confirmed_at"),
  ...timestamps,
}, (table) => [index("confirmed_facts_case_idx").on(table.caseId, table.status)]);

export const legalSources = sqliteTable("legal_sources", {
  id: text("id").primaryKey(),
  officialUrl: text("official_url").notNull(),
  actTitle: text("act_title").notNull(),
  actIdentifier: text("act_identifier"),
  publishedAt: text("published_at"),
  revisionDate: text("revision_date"),
  locale: text("locale").notNull(),
  sourceType: text("source_type").notNull(),
  status: text("status").notNull().default("verified"),
  lastCheckedAt: text("last_checked_at").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("legal_sources_url_locale_uidx").on(table.officialUrl, table.locale)]);

export const conversationSources = sqliteTable("conversation_sources", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  messageId: text("message_id").references(() => conversationMessages.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull().references(() => legalSources.id, { onDelete: "restrict" }),
  citationLabel: text("citation_label"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("conversation_sources_uidx").on(table.conversationId, table.messageId, table.sourceId)]);

export const legislationUpdates = sqliteTable("legislation_updates", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => legalSources.id, { onDelete: "restrict" }),
  externalId: text("external_id").notNull(),
  titleOriginal: text("title_original").notNull(),
  originalLanguage: text("original_language").notNull(),
  titleRu: text("title_ru"),
  titleUz: text("title_uz"),
  summaryRu: text("summary_ru"),
  summaryUz: text("summary_uz"),
  changeSummaryRu: text("change_summary_ru"),
  changeSummaryUz: text("change_summary_uz"),
  recommendedActionRu: text("recommended_action_ru"),
  recommendedActionUz: text("recommended_action_uz"),
  topicsJson: text("topics_json").notNull().default("[]"),
  affectedAudiencesJson: text("affected_audiences_json").notNull().default("[]"),
  adoptedAt: text("adopted_at"),
  effectiveAt: text("effective_at"),
  publishedAt: text("published_at").notNull(),
  status: text("status").notNull().default("draft"),
  verifiedAt: text("verified_at"),
  ...timestamps,
}, (table) => [
  uniqueIndex("legislation_updates_source_uidx").on(table.sourceId, table.externalId),
  index("legislation_updates_status_idx").on(table.status, table.publishedAt),
]);

export const monitoringPreferences = sqliteTable("monitoring_preferences", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  audience: text("audience").notNull(),
  topicsJson: text("topics_json").notNull().default("[]"),
  channelsJson: text("channels_json").notNull().default("[\"in_app\"]"),
  frequency: text("frequency").notNull().default("weekly"),
  locale: text("locale").notNull().default("ru"),
  documentImpactConsent: integer("document_impact_consent", { mode: "boolean" }).notNull().default(false),
  lastDeliveredAt: text("last_delivered_at"),
  ...timestamps,
}, (table) => [
  uniqueIndex("monitoring_preferences_user_workspace_uidx").on(table.workspaceId, table.userId),
  index("monitoring_preferences_delivery_idx").on(table.frequency, table.lastDeliveredAt),
]);

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  planCode: text("plan_code").notNull(),
  status: text("status").notNull(),
  currentPeriodEndsAt: text("current_period_ends_at"),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [uniqueIndex("subscriptions_workspace_uidx").on(table.workspaceId), index("subscriptions_status_idx").on(table.status, table.updatedAt)]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  subscriptionId: text("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  providerPaymentId: text("provider_payment_id"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("UZS"),
  status: text("status").notNull(),
  receiptObjectKey: text("receipt_object_key"),
  ...timestamps,
}, (table) => [index("payments_workspace_idx").on(table.workspaceId, table.createdAt)]);

export const accountDeletionChallenges = sqliteTable(
  "account_deletion_challenges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => authSessions.id, { onDelete: "set null" }),
    emailHash: text("email_hash").notNull(),
    emailLookupHash: text("email_lookup_hash"),
    emailLookupKeyVersion: text("email_lookup_key_version"),
    locale: text("locale").notNull(),
    codeSalt: text("code_salt").notNull(),
    codeHash: text("code_hash").notNull(),
    codeHmac: text("code_hmac"),
    codeKeyVersion: text("code_key_version"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    consumedByOperationId: text("consumed_by_operation_id"),
    invalidatedAt: text("invalidated_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "account_deletion_challenges_locale_check",
      sql`${table.locale} IN ('ru','uz')`,
    ),
    check(
      "account_deletion_challenges_attempts_check",
      sql`${table.attemptCount} >= 0 AND ${table.maxAttempts} BETWEEN 1 AND 10`,
    ),
    uniqueIndex("account_deletion_challenges_operation_uidx").on(
      table.consumedByOperationId,
    ),
    uniqueIndex("account_deletion_challenges_active_user_uidx")
      .on(table.userId)
      .where(sql`${table.consumedAt} IS NULL AND ${table.invalidatedAt} IS NULL`),
    index("account_deletion_challenges_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("account_deletion_challenges_expiry_idx").on(table.expiresAt),
  ],
);

export const accountDeletionRequests = sqliteTable("account_deletion_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  verificationChallengeId: text("verification_challenge_id").references(() => accountDeletionChallenges.id, { onDelete: "restrict" }),
  requestedSessionId: text("requested_session_id").references(() => authSessions.id, { onDelete: "set null" }),
  status: text("status").notNull().default("requested"),
  reason: text("reason"),
  verificationMethod: text("verification_method"),
  verifiedAt: text("verified_at"),
  requestedAt: text("requested_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [
  index("account_deletion_requests_user_idx").on(
    table.userId,
    table.requestedAt,
  ),
  uniqueIndex("account_deletion_requests_challenge_uidx").on(
    table.verificationChallengeId,
  ),
  uniqueIndex("account_deletion_requests_active_user_uidx")
    .on(table.userId)
    .where(sql`${table.status} IN ('requested','reviewing')`),
]);

export const documentAnalyses = sqliteTable("document_analyses", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  uploadedFileId: text("uploaded_file_id").notNull().references(() => documentFiles.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  summaryJson: text("summary_json"),
  errorCode: text("error_code"),
  consentVersion: text("consent_version").notNull(),
  ...timestamps,
}, (table) => [index("document_analyses_workspace_idx").on(table.workspaceId, table.createdAt), uniqueIndex("document_analyses_file_uidx").on(table.uploadedFileId)]);

export const documentRisks = sqliteTable("document_risks", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id").notNull().references(() => documentAnalyses.id, { onDelete: "cascade" }),
  level: text("level").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  excerpt: text("excerpt"),
  confidencePercent: integer("confidence_percent"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("document_risks_analysis_idx").on(table.analysisId, table.level)]);

export const documentComparisons = sqliteTable("document_comparisons", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  versionOneFileId: text("version_one_file_id").notNull().references(() => documentFiles.id, { onDelete: "restrict" }),
  versionTwoFileId: text("version_two_file_id").notNull().references(() => documentFiles.id, { onDelete: "restrict" }),
  caseId: text("case_id").references(() => cases.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  stage: text("stage").notNull(),
  locale: text("locale").notNull(),
  summaryJson: text("summary_json"),
  versionOneJsonKey: text("version_one_json_key"),
  versionTwoJsonKey: text("version_two_json_key"),
  similarityPercent: integer("similarity_percent"),
  overallRisk: text("overall_risk"),
  aiStatus: text("ai_status"),
  modelName: text("model_name"),
  modelVersion: text("model_version"),
  errorCode: text("error_code"),
  deletedAt: text("deleted_at"),
  ...timestamps,
}, (table) => [
  index("document_comparisons_workspace_idx").on(table.workspaceId, table.createdAt),
  index("document_comparisons_owner_idx").on(table.ownerUserId, table.createdAt),
  index("document_comparisons_status_idx").on(table.status, table.updatedAt),
]);

export const comparisonChanges = sqliteTable("comparison_changes", {
  id: text("id").primaryKey(),
  comparisonId: text("comparison_id").notNull().references(() => documentComparisons.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  changeType: text("change_type").notNull(),
  beforeSectionId: text("before_section_id"),
  afterSectionId: text("after_section_id"),
  beforeLabel: text("before_label"),
  afterLabel: text("after_label"),
  beforeHeading: text("before_heading"),
  afterHeading: text("after_heading"),
  beforeText: text("before_text"),
  afterText: text("after_text"),
  wordDiffJson: text("word_diff_json").notNull(),
  summary: text("summary").notNull(),
  legalEffect: text("legal_effect").notNull(),
  affectedParty: text("affected_party").notNull(),
  riskEffect: text("risk_effect").notNull(),
  riskLevel: text("risk_level").notNull(),
  recommendation: text("recommendation").notNull(),
  sourceIdsJson: text("source_ids_json").notNull().default("[]"),
  confidencePercent: integer("confidence_percent"),
  reviewedAt: text("reviewed_at"),
  extractionWarning: integer("extraction_warning", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("comparison_changes_order_uidx").on(table.comparisonId, table.ordinal),
  index("comparison_changes_type_idx").on(table.comparisonId, table.changeType),
  index("comparison_changes_risk_idx").on(table.comparisonId, table.riskLevel, table.riskEffect),
]);

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  scope: text("scope").notNull(),
  requestHash: text("request_hash").notNull(),
  status: text("status").notNull().default("started"),
  resultRef: text("result_ref"),
  expiresAt: text("expires_at").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idempotency_keys_expiry_idx").on(table.expiresAt),
  index("idempotency_keys_status_idx").on(table.status, table.updatedAt),
]);

export const jobOutbox = sqliteTable("job_outbox", {
  id: text("id").primaryKey(),
  queueBinding: text("queue_binding").notNull(),
  jobType: text("job_type").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  idempotencyKey: text("idempotency_key").notNull(),
  subjectId: text("subject_id").notNull(),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  correlationId: text("correlation_id").notNull(),
  enqueuedAt: text("enqueued_at").notNull(),
  availableAt: text("available_at").notNull(),
  status: text("status").notNull().default("pending"),
  dispatchAttempts: integer("dispatch_attempts").notNull().default(0),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: text("lease_expires_at"),
  nextAttemptAt: text("next_attempt_at"),
  dispatchedAt: text("dispatched_at"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("job_outbox_idempotency_uidx").on(table.idempotencyKey),
  index("job_outbox_status_idx").on(table.status, table.availableAt),
  index("job_outbox_lease_idx").on(table.status, table.leaseExpiresAt),
  index("job_outbox_workspace_idx").on(table.workspaceId, table.createdAt),
]);

export const jobRuns = sqliteTable("job_runs", {
  id: text("id").primaryKey(),
  queueName: text("queue_name").notNull(),
  messageId: text("message_id").notNull(),
  jobType: text("job_type").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  subjectId: text("subject_id").notNull(),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  correlationId: text("correlation_id").notNull(),
  envelopeHash: text("envelope_hash").notNull(),
  status: text("status").notNull().default("received"),
  attempt: integer("attempt").notNull().default(1),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: text("lease_expires_at"),
  nextAttemptAt: text("next_attempt_at"),
  errorCode: text("error_code"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("job_runs_idempotency_uidx").on(table.idempotencyKey),
  uniqueIndex("job_runs_message_uidx").on(table.queueName, table.messageId),
  index("job_runs_status_idx").on(table.status, table.nextAttemptAt),
  index("job_runs_lease_idx").on(table.status, table.leaseExpiresAt),
  index("job_runs_workspace_idx").on(table.workspaceId, table.createdAt),
]);

export const scheduledLocks = sqliteTable("scheduled_locks", {
  name: text("name").primaryKey(),
  holderId: text("holder_id").notNull(),
  acquiredAt: text("acquired_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("scheduled_locks_expiry_idx").on(table.expiresAt),
]);

export const scheduledRuns = sqliteTable("scheduled_runs", {
  id: text("id").primaryKey(),
  scheduleName: text("schedule_name").notNull(),
  cron: text("cron").notNull(),
  scheduledFor: text("scheduled_for").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  holderId: text("holder_id").notNull(),
  status: text("status").notNull().default("running"),
  errorCode: text("error_code"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("scheduled_runs_idempotency_uidx").on(table.idempotencyKey),
  index("scheduled_runs_schedule_idx").on(table.scheduleName, table.scheduledFor),
  index("scheduled_runs_status_idx").on(table.status, table.updatedAt),
]);

export const backupRuns = sqliteTable("backup_runs", {
  id: text("id").primaryKey(),
  environment: text("environment").notNull(),
  backupType: text("backup_type").notNull(),
  status: text("status").notNull().default("requested"),
  schemaVersion: text("schema_version"),
  appVersion: text("app_version"),
  sourceBookmark: text("source_bookmark"),
  objectKey: text("object_key"),
  checksumSha256: text("checksum_sha256"),
  byteSize: integer("byte_size"),
  manifestVersion: text("manifest_version"),
  verifiedAt: text("verified_at"),
  restoreTestedAt: text("restore_tested_at"),
  errorCode: text("error_code"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("backup_runs_environment_idx").on(table.environment, table.createdAt),
  index("backup_runs_status_idx").on(table.status, table.updatedAt),
]);

export const cleanupRuns = sqliteTable("cleanup_runs", {
  id: text("id").primaryKey(),
  environment: text("environment").notNull(),
  policyVersion: text("policy_version").notNull(),
  status: text("status").notNull().default("requested"),
  dryRun: integer("dry_run", { mode: "boolean" }).notNull().default(true),
  cursor: text("cursor"),
  scannedCount: integer("scanned_count").notNull().default(0),
  deletedCount: integer("deleted_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  errorCode: text("error_code"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("cleanup_runs_environment_idx").on(table.environment, table.createdAt),
  index("cleanup_runs_status_idx").on(table.status, table.updatedAt),
]);
