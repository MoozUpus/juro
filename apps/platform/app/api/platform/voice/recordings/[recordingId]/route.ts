import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1, requireQuarantineR2, requireR2, runtimeEnv } from "../../../../../../lib/document-builder/storage/runtime";
import {
  deleteVoiceRecording,
  markVoiceUploaded,
  parseVoiceTranscript,
  saveEditedVoiceTranscript,
  voiceKeyring,
  voiceRecordingForUser,
} from "../../../../../../lib/ai/voice-recording";
import { publicVoiceRecording, voiceErrorResponse, voiceResponse } from "../../../../../../lib/ai/voice-http";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

type Context = { params: Promise<{ recordingId: string }> };

async function contextFor(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { recordingId } = await context.params;
  const recording = await voiceRecordingForUser(requireD1(), recordingId, workspace.id, user.id);
  return { user, workspace, recording };
}

export const PUT = withApiErrors(async function PUT(request: Request, context: Context) {
  const state = await contextFor(request, context);
  if (!state.recording) return voiceResponse({ code: "VOICE_RECORDING_NOT_FOUND", error: "Запись недоступна." }, 404);
  try {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const declaredLength = request.headers.get("content-length");
    const contentLength = declaredLength === null ? null : Number(declaredLength);
    const sha256 = request.headers.get("x-juro-file-sha256")?.trim().toLowerCase();
    if (
      contentType !== state.recording.mimeType
      || (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength !== state.recording.sizeBytes))
      || sha256 !== state.recording.sha256
      || !request.body
    ) {
      return voiceResponse({ code: "VOICE_UPLOAD_INTEGRITY_FAILED", error: "Параметры аудио не совпадают с подтверждённой загрузкой." }, 422);
    }
    if (state.recording.status === "uploaded") {
      const existing = await requireQuarantineR2().head(state.recording.quarantineKey);
      if (existing?.size === state.recording.sizeBytes) return voiceResponse({ recording: publicVoiceRecording(state.recording) });
    }
    if (state.recording.status !== "initiated") {
      return voiceResponse({ code: "VOICE_UPLOAD_STATE_INVALID", error: "Запись уже обработана или удалена." }, 409);
    }
    const stored = await requireQuarantineR2().put(state.recording.quarantineKey, request.body, {
      httpMetadata: { contentType: state.recording.mimeType },
      customMetadata: { sha256: state.recording.sha256, lifecycle: "voice-quarantine" },
    });
    if (!stored || stored.size !== state.recording.sizeBytes) {
      await requireQuarantineR2().delete(state.recording.quarantineKey);
      return voiceResponse({ code: "VOICE_UPLOAD_INTEGRITY_FAILED", error: "R2 не подтвердил загрузку аудио." }, 422);
    }
    await markVoiceUploaded({ db: requireD1(), recording: state.recording });
    const updated = await voiceRecordingForUser(requireD1(), state.recording.id, state.workspace.id, state.user.id);
    return voiceResponse({ recording: updated ? publicVoiceRecording(updated) : publicVoiceRecording(state.recording) });
  } catch (error) {
    return voiceErrorResponse(error) ?? Promise.reject(error);
  }
});

export const PATCH = withApiErrors(async function PATCH(request: Request, context: Context) {
  const state = await contextFor(request, context);
  if (!state.recording) return voiceResponse({ code: "VOICE_RECORDING_NOT_FOUND", error: "Запись недоступна." }, 404);
  try {
    const transcript = parseVoiceTranscript(await request.json());
    await saveEditedVoiceTranscript({
      db: requireD1(), keyring: voiceKeyring(runtimeEnv().IDENTITY_KEYRING),
      recording: state.recording, transcript,
    });
    return voiceResponse({ ok: true });
  } catch (error) {
    return voiceErrorResponse(error) ?? Promise.reject(error);
  }
});

export const DELETE = withApiErrors(async function DELETE(request: Request, context: Context) {
  const state = await contextFor(request, context);
  if (!state.recording) return voiceResponse({ ok: true });
  try {
    await deleteVoiceRecording({
      db: requireD1(), bucket: requireR2(), quarantineBucket: requireQuarantineR2(),
      recording: state.recording,
    });
    return voiceResponse({ ok: true });
  } catch (error) {
    return voiceErrorResponse(error) ?? Promise.reject(error);
  }
});
