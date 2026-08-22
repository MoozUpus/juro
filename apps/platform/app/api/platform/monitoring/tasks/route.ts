import { z } from "zod";
import { parseJsonRequest } from "../../../../../lib/auth/input";
import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  createMonitoringTaskFromChange,
  MonitoringTaskError,
} from "../../../../../lib/platform/monitoring-tasks";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

const inputSchema = z.object({
  updateId: z.string().trim().min(1).max(128),
  caseId: z.string().trim().min(1).max(128),
  requestId: z.string().trim().min(1).max(128).nullable().optional(),
  title: z.string().trim().min(2).max(240),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  locale: z.enum(["ru", "uz"]),
}).strict();

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

function errorCopy(code: MonitoringTaskError["code"], locale: "ru" | "uz") {
  const ru = locale === "ru";
  if (code === "CASE_UNAVAILABLE") {
    return ru ? "Дело недоступно или разрешение юриста отозвано." : "Ish mavjud emas yoki yurist ruxsati bekor qilingan.";
  }
  if (code === "MONITORING_SOURCE_INVALID") {
    return ru ? "Источник изменения не прошёл проверку Lex.uz." : "O‘zgarish manbasi Lex.uz tekshiruvidan o‘tmadi.";
  }
  return ru ? "Изменение больше недоступно в проверенной ленте." : "O‘zgarish tekshirilgan lentada endi mavjud emas.";
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, inputSchema, 4_096);
  if (!parsed.ok) {
    return response({ code: "INVALID_INPUT", error: "Некорректные параметры задачи." }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  const workspace = await workspaceForUser(user);
  try {
    const result = await createMonitoringTaskFromChange(requireD1(), {
      userId: user.id,
      workspaceId: workspace.id,
      ...parsed.data,
    });
    return response({ ok: true, ...result }, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof MonitoringTaskError) {
      return response({ code: error.code, error: errorCopy(error.code, parsed.data.locale) }, error.code === "CASE_UNAVAILABLE" ? 404 : 409);
    }
    throw error;
  }
});
