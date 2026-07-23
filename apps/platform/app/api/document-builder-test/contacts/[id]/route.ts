import { assertSafeWrite, requireApiUser } from "../../../../../lib/document-builder/auth/api";
import { apiError, badRequest, jsonResponse, notFound } from "../../../../../lib/document-builder/auth/responses";
import { isoNow } from "../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { contactInputSchema } from "../../../../../lib/document-builder/validation/schema";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const parsed = contactInputSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Проверьте данные контакта.");
    const value = parsed.data;
    const now = isoNow();
    const result = await requireD1().prepare(
      `UPDATE contacts SET label = ?, full_name = ?, birth_date = ?, id_document_type = ?, id_document_number = ?,
       id_issued_by = ?, id_issue_date = ?, pinfl = ?, registered_address = ?, phone = ?, updated_at = ?
       WHERE id = ? AND owner_user_id = ?`,
    ).bind(value.label, value.fullName, value.birthDate || null, value.idDocumentType || null, value.idDocumentNumber || null, value.idIssuedBy || null, value.idIssueDate || null, value.pinfl || null, value.registeredAddress || null, value.phone || null, now, id, user.id).run();
    if (!result.meta.changes) return notFound("Контакт не найден.");
    return jsonResponse({ contact: { id, ...value, updatedAt: now } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const result = await requireD1().prepare("DELETE FROM contacts WHERE id = ? AND owner_user_id = ?").bind(id, user.id).run();
    if (!result.meta.changes) return notFound("Контакт не найден.");
    return jsonResponse({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
