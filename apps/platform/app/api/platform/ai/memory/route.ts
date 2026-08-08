import { z } from "zod";

import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import {
  clearUserMemories,
  deleteUserMemory,
  listUserMemories,
  memoryCategorySchema,
  memoryKeyring,
  memorySettings,
  saveUserMemory,
  setAutomaticMemory,
  updateUserMemory,
  UserMemoryError,
} from "../../../../../lib/ai/user-memory";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

const localeSchema = z.enum(["ru", "uz"]).default("ru");
const memoryIdSchema = z.string().uuid();
const statementSchema = z.string().trim().min(2).max(500);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    category: memoryCategorySchema,
    statement: statementSchema,
    scope: z.enum(["global", "workspace"]),
    confirmSensitive: z.boolean().optional().default(false),
    locale: localeSchema,
  }).strict(),
  z.object({
    action: z.literal("update"),
    memoryId: memoryIdSchema,
    category: memoryCategorySchema,
    statement: statementSchema,
    confirmSensitive: z.boolean().optional().default(false),
    locale: localeSchema,
  }).strict(),
  z.object({
    action: z.literal("delete"),
    memoryId: memoryIdSchema,
    locale: localeSchema,
  }).strict(),
  z.object({
    action: z.literal("clear"),
    confirmation: z.literal("CLEAR"),
    locale: localeSchema,
  }).strict(),
  z.object({
    action: z.literal("settings"),
    automaticEnabled: z.boolean(),
    locale: localeSchema,
  }).strict(),
]);

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function localizedError(locale: "ru" | "uz", error: UserMemoryError) {
  const messages = {
    ru: {
      MEMORY_INVALID: "Проверьте текст и категорию памяти.",
      MEMORY_NOT_FOUND: "Запись памяти не найдена.",
      MEMORY_ACCESS_DENIED: "Запись памяти недоступна.",
      MEMORY_CREDENTIAL_FORBIDDEN: "Пароли, коды подтверждения и платёжные реквизиты нельзя сохранять в памяти JURO.",
      MEMORY_SENSITIVE_CONFIRMATION_REQUIRED: "Эта запись может содержать чувствительные данные. Подтвердите явное сохранение.",
      MEMORY_ENCRYPTION_UNAVAILABLE: "Зашифрованная память временно недоступна. Данные не сохранены.",
      MEMORY_DUPLICATE: "Такая запись уже сохранена.",
    },
    uz: {
      MEMORY_INVALID: "Xotira matni va turini tekshiring.",
      MEMORY_NOT_FOUND: "Xotira yozuvi topilmadi.",
      MEMORY_ACCESS_DENIED: "Xotira yozuvi mavjud emas.",
      MEMORY_CREDENTIAL_FORBIDDEN: "Parollar, tasdiqlash kodlari va to‘lov rekvizitlarini JURO xotirasida saqlab bo‘lmaydi.",
      MEMORY_SENSITIVE_CONFIRMATION_REQUIRED: "Bu yozuv maxfiy ma’lumotni o‘z ichiga olishi mumkin. Saqlashni aniq tasdiqlang.",
      MEMORY_ENCRYPTION_UNAVAILABLE: "Shifrlangan xotira vaqtincha mavjud emas. Ma’lumot saqlanmadi.",
      MEMORY_DUPLICATE: "Bunday yozuv allaqachon saqlangan.",
    },
  } as const;
  return messages[locale][error.code];
}

function memoryErrorResponse(locale: "ru" | "uz", error: UserMemoryError) {
  const status = error.code === "MEMORY_NOT_FOUND" || error.code === "MEMORY_ACCESS_DENIED"
    ? 404
    : error.code === "MEMORY_ENCRYPTION_UNAVAILABLE"
      ? 503
      : error.code === "MEMORY_DUPLICATE"
        ? 409
        : 422;
  return response({ code: error.code, error: localizedError(locale, error) }, status);
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const locale = new URL(request.url).searchParams.get("locale") === "uz" ? "uz" : "ru";
  const db = requireD1();
  const settings = await memorySettings(db, user.id);
  try {
    const keyring = memoryKeyring(runtimeEnv().IDENTITY_KEYRING);
    const memories = await listUserMemories({
      db,
      keyring,
      userId: user.id,
      workspaceId: workspace.id,
    });
    return response({ available: true, settings, memories });
  } catch (error) {
    if (error instanceof UserMemoryError && error.code === "MEMORY_ENCRYPTION_UNAVAILABLE") {
      return response({
        available: false,
        settings,
        memories: [],
        code: error.code,
        error: localizedError(locale, error),
      });
    }
    if (error instanceof UserMemoryError) return memoryErrorResponse(locale, error);
    throw error;
  }
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const raw = await request.json().catch(() => null);
  const requestedLocale = raw && typeof raw === "object" && "locale" in raw && raw.locale === "uz"
    ? "uz"
    : "ru";
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) {
    return response({
      code: "MEMORY_INVALID",
      error: requestedLocale === "ru"
        ? "Некорректные данные памяти."
        : "Xotira ma’lumotlari noto‘g‘ri.",
    }, 400);
  }
  const input = parsed.data;
  const db = requireD1();
  try {
    if (input.action === "settings") {
      await setAutomaticMemory(db, user.id, workspace.id, input.automaticEnabled);
      return response({ ok: true, settings: { automaticEnabled: input.automaticEnabled } });
    }
    if (input.action === "delete") {
      await deleteUserMemory({ db, memoryId: input.memoryId, userId: user.id, workspaceId: workspace.id });
      return response({ ok: true });
    }
    if (input.action === "clear") {
      const deleted = await clearUserMemories({ db, userId: user.id, workspaceId: workspace.id });
      return response({ ok: true, deleted });
    }
    const keyring = memoryKeyring(runtimeEnv().IDENTITY_KEYRING);
    if (input.action === "update") {
      await updateUserMemory({
        db,
        keyring,
        memoryId: input.memoryId,
        userId: user.id,
        workspaceId: workspace.id,
        category: input.category,
        statement: input.statement,
        confirmSensitive: input.confirmSensitive,
      });
      return response({ ok: true });
    }
    const saved = await saveUserMemory({
      db,
      keyring,
      userId: user.id,
      workspaceId: workspace.id,
      category: input.category,
      statement: input.statement,
      scope: input.scope,
      sourceKind: "manual",
      sourceType: "manual",
      sourceRef: "settings",
      confirmSensitive: input.confirmSensitive,
    });
    return response({ ok: true, memoryId: saved.id, created: saved.created }, saved.created ? 201 : 200);
  } catch (error) {
    if (error instanceof UserMemoryError) return memoryErrorResponse(input.locale, error);
    throw error;
  }
});
