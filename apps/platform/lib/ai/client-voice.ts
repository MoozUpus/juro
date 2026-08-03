export type VoiceUploadResult = {
  recording: { id: string; status: string; expiresAt: string };
  transcript: string;
};

export async function uploadAndTranscribeVoice(input: {
  blob: Blob;
  durationMs: number;
  locale: "ru" | "uz";
  onPhase?: (phase: "hashing" | "uploading" | "finalizing" | "transcribing") => void;
}): Promise<VoiceUploadResult> {
  input.onPhase?.("hashing");
  const bytes = await input.blob.arrayBuffer();
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const idempotencyKey = crypto.randomUUID();
  const initialized = await jsonRequest<{ recording: { id: string }; upload: { url: string } }>(
    "/api/platform/voice/recordings",
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, "x-juro-csrf": "1" },
      body: JSON.stringify({
        mimeType: input.blob.type.split(";", 1)[0].toLowerCase(),
        sizeBytes: input.blob.size,
        durationMs: Math.max(1, Math.min(Math.round(input.durationMs), 300_000)),
        sha256,
        locale: input.locale,
      }),
    },
  );
  input.onPhase?.("uploading");
  const uploadResponse = await fetch(initialized.upload.url, {
    method: "PUT",
    headers: {
      "content-type": input.blob.type.split(";", 1)[0].toLowerCase(),
      "x-juro-file-sha256": sha256,
      "x-juro-csrf": "1",
    },
    body: input.blob,
  });
  if (!uploadResponse.ok) throw new Error(await responseError(uploadResponse));
  input.onPhase?.("finalizing");
  await jsonRequest(`/api/platform/voice/recordings/${encodeURIComponent(initialized.recording.id)}/finalize`, {
    method: "POST", headers: { "x-juro-csrf": "1" },
  });
  input.onPhase?.("transcribing");
  return jsonRequest<VoiceUploadResult>(
    `/api/platform/voice/recordings/${encodeURIComponent(initialized.recording.id)}/transcribe`,
    { method: "POST", headers: { "x-juro-csrf": "1" } },
  );
}

export async function confirmVoiceTranscript(recordingId: string, transcript: string): Promise<void> {
  await jsonRequest(`/api/platform/voice/recordings/${encodeURIComponent(recordingId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-juro-csrf": "1" },
    body: JSON.stringify({ transcript }),
  });
}

export async function deleteVoiceRecording(recordingId: string): Promise<void> {
  await jsonRequest(`/api/platform/voice/recordings/${encodeURIComponent(recordingId)}`, {
    method: "DELETE", headers: { "x-juro-csrf": "1" },
  });
}

async function jsonRequest<T = unknown>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<T>;
}

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || "Голосовая функция временно недоступна.";
}
