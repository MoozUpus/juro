import { z } from "zod";
import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { addNotification, isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { activeLawyerWorkspaceParticipant } from "../../../../lib/platform/lawyer-workspace-access";
import { lawyerDocumentRequestOperationSchema, lawyerWorkspaceOperationError } from "../../../../lib/platform/lawyer-workspace-operations";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser();
  const requestId = new URL(request.url).searchParams.get("requestId")?.trim() || "";
  if (!z.string().uuid().safeParse(requestId).success) return response({ code: "INVALID_INPUT", error: lawyerWorkspaceOperationError("ru", "INVALID_INPUT") }, 400);
  const db = requireD1();
  const participant = await activeLawyerWorkspaceParticipant(db, user.id, requestId);
  if (!participant) return response({ code: "REQUEST_UNAVAILABLE", error: lawyerWorkspaceOperationError("ru", "REQUEST_UNAVAILABLE") }, 404);
  const [requests, documents] = await Promise.all([
    db.prepare(
      `SELECT r.id,r.title,r.description,r.status,r.provided_document_id AS providedDocumentId,
        d.title AS providedDocumentTitle,r.created_at AS createdAt,r.updated_at AS updatedAt
       FROM lawyer_document_requests r LEFT JOIN documents d ON d.id=r.provided_document_id
       WHERE r.lawyer_request_id=? ORDER BY r.created_at DESC LIMIT 100`,
    ).bind(requestId).all(),
    db.prepare(
      `SELECT id,title,status,updated_at AS updatedAt FROM documents
       WHERE owner_user_id=? AND workspace_id=? AND case_id=? AND archived_at IS NULL
       ORDER BY updated_at DESC LIMIT 100`,
    ).bind(participant.clientUserId, participant.workspaceId, participant.caseId).all(),
  ]);
  return response({ role: participant.role, requests: requests.results, documents: documents.results });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, lawyerDocumentRequestOperationSchema, 8_192);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: lawyerWorkspaceOperationError(locale, "INVALID_INPUT") }, parsed.error === "payload_too_large" ? 413 : 400);
  const db = requireD1();
  const now = isoNow();
  const participant = await activeLawyerWorkspaceParticipant(db, user.id, parsed.data.requestId, now);
  if (!participant) return response({ code: "REQUEST_UNAVAILABLE", error: lawyerWorkspaceOperationError(locale, "REQUEST_UNAVAILABLE") }, 404);

  if (parsed.data.action === "request") {
    if (participant.role !== "lawyer") return response({ code: "REQUEST_UNAVAILABLE", error: lawyerWorkspaceOperationError(locale, "REQUEST_UNAVAILABLE") }, 403);
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare(
        `INSERT INTO lawyer_document_requests
          (id,lawyer_request_id,workspace_id,case_id,lawyer_user_id,client_user_id,title,description,status,provided_document_id,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,'requested',NULL,?,?)`,
      ).bind(id, participant.requestId, participant.workspaceId, participant.caseId, participant.lawyerUserId, participant.clientUserId, parsed.data.title, parsed.data.description, now, now),
      db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'lawyer_document_request',?,'lawyer_document_requested',?,?)`,
      ).bind(crypto.randomUUID(), participant.workspaceId, user.id, id, JSON.stringify({ requestId: participant.requestId, caseId: participant.caseId }), now),
      db.prepare(
        "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'lawyer_document_requested',?,?)",
      ).bind(crypto.randomUUID(), participant.caseId, user.id, JSON.stringify({ requestId: participant.requestId, documentRequestId: id, title: parsed.data.title }), now),
    ]);
    await addNotification(participant.clientUserId, null, "lawyer_document_requested", locale === "ru" ? "Юрист запросил документ" : "Yurist hujjat so‘radi", parsed.data.title);
    return response({ ok: true, documentRequest: { id, status: "requested", createdAt: now } }, 201);
  }

  const documentRequest = await db.prepare(
    `SELECT id,status FROM lawyer_document_requests
     WHERE id=? AND lawyer_request_id=? AND workspace_id=? AND case_id=? LIMIT 1`,
  ).bind(parsed.data.documentRequestId, participant.requestId, participant.workspaceId, participant.caseId).first<{ id: string; status: string }>();
  if (!documentRequest || documentRequest.status !== "requested") return response({ code: "DOCUMENT_REQUEST_UNAVAILABLE", error: lawyerWorkspaceOperationError(locale, "DOCUMENT_REQUEST_UNAVAILABLE") }, 404);

  if (parsed.data.action === "provide") {
    if (participant.role !== "client") return response({ code: "REQUEST_UNAVAILABLE", error: lawyerWorkspaceOperationError(locale, "REQUEST_UNAVAILABLE") }, 403);
    const document = await db.prepare(
      `SELECT id,title FROM documents WHERE id=? AND owner_user_id=? AND workspace_id=? AND case_id=? AND archived_at IS NULL LIMIT 1`,
    ).bind(parsed.data.documentId, participant.clientUserId, participant.workspaceId, participant.caseId).first<{ id: string; title: string }>();
    if (!document) return response({ code: "DOCUMENT_UNAVAILABLE", error: lawyerWorkspaceOperationError(locale, "DOCUMENT_UNAVAILABLE") }, 404);
    const updated = await db.prepare(
      "UPDATE lawyer_document_requests SET status='provided',provided_document_id=?,updated_at=? WHERE id=? AND status='requested'",
    ).bind(document.id, now, documentRequest.id).run();
    if (!updated.meta.changes) return response({ code: "INVALID_TRANSITION", error: lawyerWorkspaceOperationError(locale, "INVALID_TRANSITION") }, 409);
    await db.batch([
      db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'lawyer_document_request',?,'lawyer_document_provided',?,?)`,
      ).bind(crypto.randomUUID(), participant.workspaceId, user.id, documentRequest.id, JSON.stringify({ requestId: participant.requestId, documentId: document.id }), now),
      db.prepare(
        "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'lawyer_document_provided',?,?)",
      ).bind(crypto.randomUUID(), participant.caseId, user.id, JSON.stringify({ requestId: participant.requestId, documentRequestId: documentRequest.id, documentId: document.id }), now),
    ]);
    await addNotification(participant.lawyerUserId, document.id, "lawyer_document_provided", locale === "ru" ? "Клиент предоставил документ" : "Mijoz hujjat taqdim etdi", document.title);
    return response({ ok: true, status: "provided", document: { id: document.id, title: document.title } });
  }

  if (participant.role !== "lawyer") return response({ code: "REQUEST_UNAVAILABLE", error: lawyerWorkspaceOperationError(locale, "REQUEST_UNAVAILABLE") }, 403);
  const updated = await db.prepare(
    "UPDATE lawyer_document_requests SET status='cancelled',updated_at=? WHERE id=? AND status='requested'",
  ).bind(now, documentRequest.id).run();
  if (!updated.meta.changes) return response({ code: "INVALID_TRANSITION", error: lawyerWorkspaceOperationError(locale, "INVALID_TRANSITION") }, 409);
  await db.batch([
    db.prepare(
      `INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'lawyer_document_request',?,'lawyer_document_request_cancelled',?,?)`,
    ).bind(crypto.randomUUID(), participant.workspaceId, user.id, documentRequest.id, JSON.stringify({ requestId: participant.requestId }), now),
    db.prepare(
      "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'lawyer_document_request_cancelled',?,?)",
    ).bind(crypto.randomUUID(), participant.caseId, user.id, JSON.stringify({ requestId: participant.requestId, documentRequestId: documentRequest.id }), now),
  ]);
  return response({ ok: true, status: "cancelled" });
});
