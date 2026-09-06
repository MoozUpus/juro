import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2, runtimeEnv } from "../../../../../../../lib/document-builder/storage/runtime";
import { transcribeVoiceRecording, voiceKeyring, voiceRecordingForUser } from "../../../../../../../lib/ai/voice-recording";
import { publicVoiceRecording, voiceErrorResponse, voiceLocale, voiceProblem, voiceResponse } from "../../../../../../../lib/ai/voice-http";
import { workspaceForUser } from "../../../../../../../lib/platform/workspace";
import {
  assertOperationalFeatureEnabled,
  operationalEnvironment,
  OperationalFeatureError,
  operationalFeatureMessage,
} from "../../../../../../../lib/operations/operational-feature-flags";

type Context = { params: Promise<{ recordingId: string }> };

export const POST = withApiErrors(async function POST(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { recordingId } = await context.params;
  const recording = await voiceRecordingForUser(requireD1(), recordingId, workspace.id, user.id);
  const locale = voiceLocale(request, recording?.locale ?? "ru");
  if (!recording) return voiceProblem("VOICE_RECORDING_NOT_FOUND", 404, locale);
  try {
    const env = runtimeEnv();
    await assertOperationalFeatureEnabled({
      db: requireD1(),
      environment: operationalEnvironment(env.APP_ENV),
      key: "voice_mode",
    });
    const result = await transcribeVoiceRecording({
      db: requireD1(), bucket: requireR2(), keyring: voiceKeyring(env.IDENTITY_KEYRING),
      apiKey: env.OPENAI_API_KEY, model: env.OPENAI_TRANSCRIPTION_MODEL, recording,
    });
    return voiceResponse({ recording: publicVoiceRecording(result.recording), transcript: result.transcript });
  } catch (error) {
    if (error instanceof OperationalFeatureError) {
      return voiceResponse({ code: error.code, error: operationalFeatureMessage(locale) }, 503);
    }
    return voiceErrorResponse(error, locale) ?? Promise.reject(error);
  }
});
