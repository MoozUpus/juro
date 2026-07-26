import { assertSafeWrite, optionalApiUser, requireApiUser } from "../../../../lib/document-builder/auth/api";
import { apiError, badRequest, jsonResponse } from "../../../../lib/document-builder/auth/responses";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import type { IdentityDocumentType, UserProfile } from "../../../../lib/document-builder/types";
import { workspaceForUser } from "../../../../lib/platform/workspace";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const bindings = runtimeEnv();
    if (!bindings.DB) {
      return jsonResponse({ user: null, storage: { d1: false, r2: Boolean(bindings.BUCKET) } });
    }
    const user = await optionalApiUser();
    let counts = { documents: 0, notifications: 0 };
    if (user) {
      const workspace = await workspaceForUser(user);
      const documents = await bindings.DB.prepare("SELECT count(*) AS count FROM documents WHERE owner_user_id = ? AND workspace_id = ?")
        .bind(user.id, workspace.id).first<{ count: number }>();
      const notifications = await bindings.DB.prepare("SELECT count(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL")
        .bind(user.id).first<{ count: number }>();
      counts = { documents: Number(documents?.count ?? 0), notifications: Number(notifications?.count ?? 0) };
    }
    return jsonResponse({ user, counts, storage: { d1: true, r2: Boolean(bindings.BUCKET) } });
  } catch (error) {
    return apiError(error);
  }
}

function optionalText(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertSafeWrite(request);
    const user = await requireApiUser();
    const body = await request.json() as Record<string, unknown>;
    const idDocumentType = body.idDocumentType === "passport" || body.idDocumentType === "id_card"
      ? body.idDocumentType as IdentityDocumentType
      : null;
    if (body.idDocumentType && !idDocumentType) return badRequest("Выберите паспорт или ID-карту.");
    const profile: UserProfile = {
      ...user,
      fullName: optionalText(body.fullName, 300),
      birthDate: optionalText(body.birthDate, 20),
      idDocumentType,
      idDocumentNumber: optionalText(body.idDocumentNumber, 100),
      idIssuedBy: optionalText(body.idIssuedBy, 500),
      idIssueDate: optionalText(body.idIssueDate, 20),
      pinfl: optionalText(body.pinfl, 100),
      registeredAddress: optionalText(body.registeredAddress, 1_000),
      phone: optionalText(body.phone, 100),
    };
    await runtimeEnv().DB!.prepare(
      `UPDATE user_profiles SET full_name = ?, birth_date = ?, id_document_type = ?, id_document_number = ?,
       id_issued_by = ?, id_issue_date = ?, pinfl = ?, registered_address = ?, phone = ?, updated_at = ? WHERE id = ?`,
    ).bind(profile.fullName, profile.birthDate, profile.idDocumentType, profile.idDocumentNumber, profile.idIssuedBy, profile.idIssueDate, profile.pinfl, profile.registeredAddress, profile.phone, isoNow(), user.id).run();
    return jsonResponse({ user: profile });
  } catch (error) {
    return apiError(error);
  }
}
