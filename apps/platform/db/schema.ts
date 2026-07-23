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
    language: text("language").notNull(),
    participantMode: text("participant_mode").notNull(),
    actingSide: text("acting_side"),
    title: text("title").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
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
    canView: integer("can_view", { mode: "boolean" }).notNull().default(true),
    canDownload: integer("can_download", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull(),
    openedAt: text("opened_at"),
    confirmedAt: text("confirmed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("document_collaborators_uidx").on(table.documentId, table.userId),
    index("document_collaborators_user_idx").on(table.userId),
  ],
);

export const documentComments = sqliteTable(
  "document_comments",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull().references(() => userProfiles.id),
    body: text("body").notNull(),
    anchor: text("anchor"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("document_comments_document_idx").on(table.documentId)],
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
