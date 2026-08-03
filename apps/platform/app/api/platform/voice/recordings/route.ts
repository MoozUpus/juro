import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  hashVoiceIntent,
  initializeVoiceRecording,
  parseVoiceIdempotencyKey,
  parseVoiceIntent,
} from "../../../../../lib/ai/voice-recording";
import { publicVoiceRecording, voiceErrorResponse, voiceResponse } from "../../../../../lib/ai/voice-http";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return voiceResponse({ code: "INVALID_CONTENT_TYPE", error: "Инициализация записи принимает только JSON." }, 415);
    }
    const intent = parseVoiceIntent(await request.json());
    const idempotencyKey = parseVoiceIdempotencyKey(request.headers.get("idempotency-key"));
    const result = await initializeVoiceRecording({
      db: requireD1(), workspaceId: workspace.id, userId: user.id,
      idempotencyKey, requestHash: await hashVoiceIntent(intent), intent,
    });
    const recording = publicVoiceRecording(result.recording);
    return voiceResponse({
      recording,
      upload: { method: "PUT", url: `/api/platform/voice/recordings/${encodeURIComponent(recording.id)}` },
    }, result.replay ? 200 : 201, { location: `/api/platform/voice/recordings/${encodeURIComponent(recording.id)}` });
  } catch (error) {
    return voiceErrorResponse(error) ?? Promise.reject(error);
  }
});
