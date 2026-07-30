export type SecureDocumentUploadResult = {
  analysis: {
    id: string;
    fileId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    errorCode?: string | null;
  };
  message?: string;
  code?: string;
};

export async function uploadDocumentForAnalysis(file: File, locale: "ru" | "uz"): Promise<SecureDocumentUploadResult> {
  if (file.size <= 0 || file.size > 50 * 1024 * 1024) {
    throw new Error(locale === "ru" ? "Размер файла должен быть от 1 байта до 50 МБ." : "Fayl hajmi 1 baytdan 50 MB gacha bo‘lishi kerak.");
  }
  const sha256 = await fileSha256(file);
  const idempotencyKey = crypto.randomUUID();
  const init = await jsonRequest<SecureDocumentUploadResult>("/api/platform/document-analysis/uploads", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-juro-csrf": "1",
    },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      sha256,
      locale,
      mode: "quick",
      consent: true,
    }),
  });
  const analysisId = init.analysis.id;
  await jsonRequest(`/api/platform/document-analysis/uploads/${encodeURIComponent(analysisId)}`, {
    method: "PUT",
    headers: {
      "content-type": file.type,
      "x-juro-csrf": "1",
      "x-juro-file-sha256": sha256,
    },
    body: file,
  });
  return jsonRequest<SecureDocumentUploadResult>(
    `/api/platform/document-analysis/uploads/${encodeURIComponent(analysisId)}/finalize`,
    { method: "POST", headers: { "x-juro-csrf": "1" } },
    [202],
  );
}

async function fileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function jsonRequest<T>(url: string, init: RequestInit, acceptedStatuses: number[] = []): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json() as T & { error?: string };
  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    throw new Error(body.error || "Файл не обработан.");
  }
  return body;
}
