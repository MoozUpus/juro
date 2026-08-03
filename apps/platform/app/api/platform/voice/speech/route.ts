import { z } from "zod";

import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1, runtimeEnv } from "../../../../../lib/document-builder/storage/runtime";
import { synthesizeAssistantSpeech } from "../../../../../lib/ai/voice-recording";
import { voiceErrorResponse, voiceResponse } from "../../../../../lib/ai/voice-http";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

const requestSchema = z.object({
  assistantMessageId: z.string().uuid(),
  voice: z.enum(["marin", "cedar"]),
  locale: z.enum(["ru", "uz"]),
}).strict();

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return voiceResponse({ code: "INVALID_VOICE_REQUEST", error: "Некорректный запрос озвучивания." }, 400);
  const message = await requireD1().prepare(`SELECT m.content
    FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id
    WHERE m.id=? AND m.author_type='assistant' AND c.workspace_id=? AND c.owner_user_id=? LIMIT 1`)
    .bind(parsed.data.assistantMessageId, workspace.id, user.id).first<{ content: string }>();
  if (!message) return voiceResponse({ code: "VOICE_RECORDING_NOT_FOUND", error: "Ответ недоступен." }, 404);
  try {
    const env = runtimeEnv();
    const providerResponse = await synthesizeAssistantSpeech({
      apiKey: env.OPENAI_API_KEY, model: env.OPENAI_TTS_MODEL,
      voice: parsed.data.voice, text: message.content, locale: parsed.data.locale,
      signal: request.signal,
    });
    return new Response(providerResponse.body, {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-type": providerResponse.headers.get("content-type") || "audio/mpeg",
        "content-disposition": "inline; filename=ai-juro.mp3",
        "x-juro-ai-voice": "true",
      },
    });
  } catch (error) {
    return voiceErrorResponse(error) ?? Promise.reject(error);
  }
});
