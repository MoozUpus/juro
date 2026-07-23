import { assertSafeWrite, requireApiUser } from "../../../../lib/document-builder/auth/api";
import { apiError, badRequest, jsonResponse } from "../../../../lib/document-builder/auth/responses";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { contactInputSchema } from "../../../../lib/document-builder/validation/schema";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();
    const result = await requireD1().prepare(
      `SELECT id, label, full_name AS fullName, birth_date AS birthDate, id_document_type AS idDocumentType,
       id_document_number AS idDocumentNumber, id_issued_by AS idIssuedBy, id_issue_date AS idIssueDate,
       pinfl, registered_address AS registeredAddress, phone, created_at AS createdAt, updated_at AS updatedAt
       FROM contacts WHERE owner_user_id = ? ORDER BY updated_at DESC`,
    ).bind(user.id).all();
    return jsonResponse({ contacts: result.results });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const parsed = contactInputSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Проверьте данные контакта.");
    const id = crypto.randomUUID();
    const now = isoNow();
    const value = parsed.data;
    await requireD1().prepare(
      `INSERT INTO contacts (id, owner_user_id, label, full_name, birth_date, id_document_type, id_document_number,
       id_issued_by, id_issue_date, pinfl, registered_address, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, user.id, value.label, value.fullName, value.birthDate || null, value.idDocumentType || null, value.idDocumentNumber || null, value.idIssuedBy || null, value.idIssueDate || null, value.pinfl || null, value.registeredAddress || null, value.phone || null, now, now).run();
    return jsonResponse({ contact: { id, ...value, createdAt: now, updatedAt: now } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
