import type { ChatGPTUser } from "../../../app/chatgpt-auth";
import { ensureDefaultWorkspace } from "../../platform/workspace";
import type { UserProfile } from "../types";
import type { DocumentDefinition } from "../registry";
import { requireD1 } from "./runtime";

let seeded = false;

export function isoNow(): string {
  return new Date().toISOString();
}

export async function ensureTemplateSeed(): Promise<void> {
  if (seeded) return;
  const db = requireD1();
  const now = isoNow();
  try {
    await db.batch([
      db.prepare(
        "INSERT OR IGNORE INTO document_templates (id, key, category, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
      ).bind("receipt-money-v1", "receipt-money", "Займы и расписки", now, now),
      db.prepare(
        "INSERT OR IGNORE INTO document_template_locales (id, template_id, language, name, source_object_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind("receipt-money-v1-ru", "receipt-money-v1", "ru", "Расписка в получении денежных средств", "system/templates/receipt-ru.docx", now, now),
      db.prepare(
        "INSERT OR IGNORE INTO document_template_locales (id, template_id, language, name, source_object_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind("receipt-money-v1-uz-cyrl", "receipt-money-v1", "uz-cyrl", "Пул маблағларини олганлик тўғрисида тилхат", "system/templates/receipt-uz-cyrl.docx", now, now),
    ]);
    seeded = true;
  } catch (error) {
    seeded = false;
    throw error;
  }
}

export async function ensureConfiguredTemplateSeed(definition: DocumentDefinition): Promise<void> {
  const db = requireD1();
  const now = isoNow();
  await db.batch([
    db.prepare(
      "INSERT OR IGNORE INTO document_templates (id, key, category, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    ).bind(definition.id, definition.code, definition.categorySlug, now, now),
    db.prepare(
      "INSERT OR IGNORE INTO document_template_locales (id, template_id, language, name, source_object_key, created_at, updated_at) VALUES (?, ?, 'ru', ?, NULL, ?, ?)",
    ).bind(`${definition.id}-ru`, definition.id, definition.titleRu, now, now),
    db.prepare(
      "INSERT OR IGNORE INTO document_template_locales (id, template_id, language, name, source_object_key, created_at, updated_at) VALUES (?, ?, 'uz', ?, NULL, ?, ?)",
    ).bind(`${definition.id}-uz`, definition.id, definition.titleUz, now, now),
  ]);
}

export async function getOrCreateUserProfile(user: ChatGPTUser): Promise<UserProfile> {
  const db = requireD1();
  const existing = await db.prepare(
    "SELECT id, email, full_name AS fullName, birth_date AS birthDate, id_document_type AS idDocumentType, id_document_number AS idDocumentNumber, id_issued_by AS idIssuedBy, id_issue_date AS idIssueDate, pinfl, registered_address AS registeredAddress, phone FROM user_profiles WHERE lower(email) = lower(?) LIMIT 1",
  ).bind(user.email).first<UserProfile>();
  if (existing) {
    if (user.fullName && user.fullName !== existing.fullName) {
      await db.prepare("UPDATE user_profiles SET full_name = ?, updated_at = ? WHERE id = ?")
        .bind(user.fullName, isoNow(), existing.id).run();
      await ensureDefaultWorkspace(existing.id);
      return { ...existing, fullName: user.fullName };
    }
    await ensureDefaultWorkspace(existing.id);
    return existing;
  }

  const id = crypto.randomUUID();
  const now = isoNow();
  await db.prepare(
    "INSERT INTO user_profiles (id, email, full_name, locale, account_type, created_at, updated_at) VALUES (?, ?, ?, 'ru', 'individual', ?, ?)",
  ).bind(id, user.email.toLocaleLowerCase(), user.fullName, now, now).run();
  await ensureDefaultWorkspace(id);
  return {
    id,
    email: user.email.toLocaleLowerCase(),
    fullName: user.fullName,
    birthDate: null,
    idDocumentType: null,
    idDocumentNumber: null,
    idIssuedBy: null,
    idIssueDate: null,
    pinfl: null,
    registeredAddress: null,
    phone: null,
  };
}

export async function addActivity(
  documentId: string,
  actorUserId: string | null,
  type: string,
  metadata?: Record<string, string | number | boolean | null>,
): Promise<void> {
  const db = requireD1();
  await db.prepare(
    "INSERT INTO activity_events (id, document_id, actor_user_id, type, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), documentId, actorUserId, type, metadata ? JSON.stringify(metadata) : null, isoNow()).run();
}

export async function addNotification(
  userId: string,
  documentId: string | null,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  const db = requireD1();
  await db.prepare(
    "INSERT INTO notifications (id, workspace_id, user_id, document_id, type, title, body, read_at, created_at) VALUES (?, (SELECT default_workspace_id FROM user_profiles WHERE id = ?), ?, ?, ?, ?, ?, NULL, ?)",
  ).bind(crypto.randomUUID(), userId, userId, documentId, type, title, body, isoNow()).run();
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
