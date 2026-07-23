import { assertSafeWrite, requireApiUser } from "../../../../lib/document-builder/auth/api";
import { apiError, badRequest, forbidden, jsonResponse } from "../../../../lib/document-builder/auth/responses";
import { loadStoredDocument } from "../../../../lib/document-builder/permissions";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const body = await request.json() as { documentId?: string; type?: "ai" | "lawyer" };
    if (!body.documentId || (body.type !== "ai" && body.type !== "lawyer")) return badRequest("Выберите вид консультации.");
    const document = await loadStoredDocument(body.documentId, user.id);
    if (!document || document.accessRole !== "owner") return forbidden();
    const id = crypto.randomUUID();
    const now = isoNow();
    const context = {
      documentId: document.id,
      finalText: document.finalContent,
      answers: document.answers,
      conditions: {
        interest: document.answers.interest,
        transfer: document.answers.transfer,
        repayment: document.answers.repayment,
        earlyRepaymentMode: document.answers.earlyRepaymentMode,
      },
      metadata: { title: document.title, language: document.language, status: document.status },
    };
    await requireD1().prepare(
      "INSERT INTO consultation_requests (id, document_id, requester_user_id, consultation_type, context_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'created', ?, ?)",
    ).bind(id, document.id, user.id, body.type, JSON.stringify(context), now, now).run();
    return jsonResponse({ request: { id, type: body.type, status: "created", contextAttached: true, createdAt: now }, handoffUrl: `/document-builder-test/documents/${document.id}?consultation=${body.type}&request=${id}` }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
