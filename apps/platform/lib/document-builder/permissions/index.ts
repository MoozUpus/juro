import type { DocumentRecord, ReceiptAnswers, StoredDocument } from "../types";
import { parseJson } from "../storage/db";
import { requireD1 } from "../storage/runtime";
import type { DocumentPermission, ParticipantRole } from "../registry";

const ALL_PERMISSIONS: readonly DocumentPermission[] = [
  "view_document", "edit_assigned_fields", "edit_all_fields", "add_comment", "reply_comment", "resolve_comment",
  "create_suggestion", "accept_suggestion", "reject_suggestion", "invite_participant", "revoke_participant",
  "approve_document", "generate_document", "download_document", "archive_document", "view_audit_history",
];

const ROLE_PERMISSIONS: Record<ParticipantRole, readonly DocumentPermission[]> = {
  owner: ALL_PERMISSIONS,
  creator: ALL_PERMISSIONS,
  party: ["view_document", "edit_assigned_fields", "add_comment", "reply_comment", "create_suggestion", "accept_suggestion", "reject_suggestion", "approve_document", "download_document", "view_audit_history"],
  counterparty: ["view_document", "edit_assigned_fields", "add_comment", "reply_comment", "create_suggestion", "accept_suggestion", "reject_suggestion", "approve_document", "download_document", "view_audit_history"],
  "co-party": ["view_document", "edit_assigned_fields", "add_comment", "reply_comment", "create_suggestion", "accept_suggestion", "reject_suggestion", "approve_document", "download_document", "view_audit_history"],
  representative: ["view_document", "edit_assigned_fields", "add_comment", "reply_comment", "create_suggestion", "accept_suggestion", "reject_suggestion", "approve_document", "download_document", "view_audit_history"],
  editor: ["view_document", "edit_all_fields", "add_comment", "reply_comment", "resolve_comment", "create_suggestion", "accept_suggestion", "reject_suggestion", "download_document", "view_audit_history"],
  commenter: ["view_document", "add_comment", "reply_comment", "create_suggestion"],
  viewer: ["view_document"],
  "legal-reviewer": ["view_document", "add_comment", "reply_comment", "resolve_comment", "create_suggestion", "accept_suggestion", "reject_suggestion", "view_audit_history"],
  approver: ["view_document", "add_comment", "reply_comment", "create_suggestion", "approve_document", "download_document", "view_audit_history"],
};

interface DocumentRow {
  id: string;
  templateId?: string;
  templateCode?: string | null;
  templateVersion?: string | null;
  ownerUserId: string;
  language: string;
  participantMode: string;
  actingSide: string | null;
  title: string;
  category: string;
  status: string;
  lenderName: string | null;
  borrowerName: string | null;
  isFavorite: number;
  archivedAt: string | null;
  generatedAt: string | null;
  signedFileId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  answersJson?: string;
  autoContent?: string;
  finalContent?: string;
  manuallyEdited?: number;
}

export interface DocumentAccess {
  document: DocumentRecord & { ownerUserId: string };
  role: "owner" | "collaborator";
  participantRole: ParticipantRole;
  permissions: readonly DocumentPermission[];
  canView: boolean;
  canDownload: boolean;
}

function mapDocument(row: DocumentRow): DocumentRecord & { ownerUserId: string } {
  return {
    id: row.id,
    templateId: row.templateId,
    templateCode: row.templateCode,
    templateVersion: row.templateVersion,
    ownerUserId: row.ownerUserId,
    title: row.title,
    category: row.category,
    status: row.status as DocumentRecord["status"],
    language: row.language as DocumentRecord["language"],
    lenderName: row.lenderName,
    borrowerName: row.borrowerName,
    isFavorite: Boolean(row.isFavorite),
    archivedAt: row.archivedAt,
    generatedAt: row.generatedAt,
    signedFileId: row.signedFileId,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getDocumentAccess(documentId: string, userId: string): Promise<DocumentAccess | null> {
  const db = requireD1();
  const row = await db.prepare(
    `SELECT d.id, d.owner_user_id AS ownerUserId, d.template_id AS templateId, d.template_code AS templateCode,
      d.template_version AS templateVersion, d.language, d.participant_mode AS participantMode,
      d.acting_side AS actingSide, d.title, d.category, d.status, d.lender_name AS lenderName,
      d.borrower_name AS borrowerName, d.is_favorite AS isFavorite, d.archived_at AS archivedAt,
      d.generated_at AS generatedAt, d.signed_file_id AS signedFileId, d.revision,
      d.created_at AS createdAt, d.updated_at AS updatedAt
    FROM documents d WHERE d.id = ? LIMIT 1`,
  ).bind(documentId).first<DocumentRow>();
  if (!row) return null;
  if (row.ownerUserId === userId) {
    return { document: mapDocument(row), role: "owner", participantRole: "owner", permissions: ALL_PERMISSIONS, canView: true, canDownload: true };
  }
  const collaborator = await db.prepare(
    "SELECT role, permission_set_json AS permissionSetJson, can_view AS canView, can_download AS canDownload, status FROM document_collaborators WHERE document_id = ? AND user_id = ? LIMIT 1",
  ).bind(documentId, userId).first<{ role: string; permissionSetJson: string | null; canView: number; canDownload: number; status: string }>();
  if (!collaborator || collaborator.status === "revoked") return null;
  const participantRole = collaborator.role in ROLE_PERMISSIONS ? collaborator.role as ParticipantRole : "counterparty";
  const explicit = parseJson<DocumentPermission[]>(collaborator.permissionSetJson, []);
  const permissions = explicit.length ? explicit.filter((permission) => ALL_PERMISSIONS.includes(permission)) : ROLE_PERMISSIONS[participantRole];
  return {
    document: mapDocument(row),
    role: "collaborator",
    participantRole,
    permissions,
    canView: Boolean(collaborator.canView) && permissions.includes("view_document"),
    canDownload: Boolean(collaborator.canDownload) && permissions.includes("download_document"),
  };
}

export function hasDocumentPermission(access: DocumentAccess | null, permission: DocumentPermission): boolean {
  return Boolean(access?.permissions.includes(permission));
}

export async function requireDocumentPermission(documentId: string, userId: string, permission: DocumentPermission): Promise<DocumentAccess | null> {
  const access = await getDocumentAccess(documentId, userId);
  return hasDocumentPermission(access, permission) ? access : null;
}

export async function loadStoredDocument(documentId: string, userId: string): Promise<StoredDocument | null> {
  const access = await getDocumentAccess(documentId, userId);
  if (!access?.canView) return null;
  const db = requireD1();
  const row = await db.prepare(
    `SELECT d.id, d.owner_user_id AS ownerUserId, d.template_id AS templateId, d.template_code AS templateCode,
      d.template_version AS templateVersion, d.language, d.participant_mode AS participantMode,
      d.acting_side AS actingSide, d.title, d.category, d.status, d.lender_name AS lenderName,
      d.borrower_name AS borrowerName, d.is_favorite AS isFavorite, d.archived_at AS archivedAt,
      d.generated_at AS generatedAt, d.signed_file_id AS signedFileId, d.revision,
      d.created_at AS createdAt, d.updated_at AS updatedAt,
      a.answers_json AS answersJson, c.auto_content AS autoContent, c.final_content AS finalContent,
      c.manually_edited AS manuallyEdited
    FROM documents d
    JOIN document_answers a ON a.document_id = d.id
    JOIN document_current_content c ON c.document_id = d.id
    WHERE d.id = ? LIMIT 1`,
  ).bind(documentId).first<DocumentRow>();
  if (!row?.answersJson || row.autoContent === undefined || row.finalContent === undefined) return null;
  return {
    ...mapDocument(row),
    ownerUserId: row.ownerUserId,
    accessRole: access.role,
    answers: parseJson<ReceiptAnswers>(row.answersJson, {} as ReceiptAnswers),
    autoContent: row.autoContent,
    finalContent: row.finalContent,
    manuallyEdited: Boolean(row.manuallyEdited),
  };
}

export async function requireOwner(documentId: string, userId: string): Promise<DocumentAccess | null> {
  const access = await getDocumentAccess(documentId, userId);
  return access?.role === "owner" ? access : null;
}
