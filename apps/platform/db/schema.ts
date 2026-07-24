import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const userProfiles = sqliteTable(
  "user_profiles",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    birthDate: text("birth_date"),
    idDocumentType: text("id_document_type"),
    idDocumentNumber: text("id_document_number"),
    idIssuedBy: text("id_issued_by"),
    idIssueDate: text("id_issue_date"),
    pinfl: text("pinfl"),
    registeredAddress: text("registered_address"),
    phone: text("phone"),
    locale: text("locale").notNull().default("ru"),
    accountType: text("account_type").notNull().default("individual"),
    companyName: text("company_name"),
    onboardingCompletedAt: text("onboarding_completed_at"),
    ...timestamps,
  },
  (table) => [uniqueIndex("user_profiles_email_uidx").on(table.email)],
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
    documentId: text("document_id").references(() => documents.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    r2Key: text("r2_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("document_files_document_idx").on(table.documentId),
    index("document_files_owner_idx").on(table.ownerUserId),
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
    role: text("role").notNull(),
    partyNumber: integer("party_number"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    declinedAt: text("declined_at"),
    revokedAt: text("revoked_at"),
    ...timestamps,
  },
  (table) => [index("document_invitations_document_idx").on(table.documentId), index("document_invitations_target_idx").on(table.targetUserId)],
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
  id: text("id").primaryKey(), email: text("email").notNull(), emailHash: text("email_hash").notNull(), purpose: text("purpose").notNull(),
  locale: text("locale").notNull().default("ru"), accountType: text("account_type").notNull().default("individual"), codeSalt: text("code_salt").notNull(),
  codeHash: text("code_hash").notNull(), attemptCount: integer("attempt_count").notNull().default(0), maxAttempts: integer("max_attempts").notNull().default(5),
  expiresAt: text("expires_at").notNull(), consumedAt: text("consumed_at"), invalidatedAt: text("invalidated_at"), requestIpHash: text("request_ip_hash"), createdAt: text("created_at").notNull(),
}, (table) => [index("auth_otp_email_idx").on(table.emailHash, table.createdAt), index("auth_otp_expiry_idx").on(table.expiresAt)]);

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }), tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(), revokedAt: text("revoked_at"), createdAt: text("created_at").notNull(), lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [uniqueIndex("auth_sessions_token_uidx").on(table.tokenHash), index("auth_sessions_user_idx").on(table.userId, table.expiresAt)]);

export const userAcceptances = sqliteTable("user_acceptances", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }), documentKey: text("document_key").notNull(),
  documentVersion: text("document_version").notNull(), acceptedAt: text("accepted_at").notNull(),
}, (table) => [uniqueIndex("user_acceptances_uidx").on(table.userId, table.documentKey, table.documentVersion)]);

export const cases = sqliteTable("cases", {
  id: text("id").primaryKey(), ownerUserId: text("owner_user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  accountType: text("account_type").notNull(), locale: text("locale").notNull(), title: text("title").notNull(), description: text("description"), legalArea: text("legal_area").notNull(),
  status: text("status").notNull().default("open"), currentRevision: integer("current_revision").notNull().default(1), nextDeadlineAt: text("next_deadline_at"), archivedAt: text("archived_at"), ...timestamps,
}, (table) => [index("cases_owner_idx").on(table.ownerUserId, table.updatedAt)]);

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
  caseId: text("case_id").references(() => cases.id, { onDelete: "set null" }), planStepId: text("plan_step_id").references(() => actionPlanSteps.id, { onDelete: "set null" }),
  status: text("status").notNull().default("confirmed"), contextJson: text("context_json").notNull(), ...timestamps,
}, (table) => [uniqueIndex("consultation_bookings_slot_uidx").on(table.slotId), index("consultation_bookings_user_idx").on(table.requesterUserId, table.createdAt)]);
