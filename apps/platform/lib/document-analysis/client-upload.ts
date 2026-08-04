export type SecureDocumentUploadResult = {
  analysis: {
    id: string;
    fileId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    errorCode?: string | null;
    caseId?: string | null;
  };
  message?: string;
  code?: string;
};

export type SecureDocumentUploadProgress = {
  phase: "hashing" | "uploading" | "finalizing";
  loaded: number;
  total: number;
};

export async function uploadDocumentForAnalysis(
  file: File,
  locale: "ru" | "uz",
  onProgress?: (progress: SecureDocumentUploadProgress) => void,
  caseId?: string | null,
): Promise<SecureDocumentUploadResult> {
  if (file.size <= 0 || file.size > 50 * 1024 * 1024) {
    throw new Error(locale === "ru" ? "Размер файла должен быть от 1 байта до 50 МБ." : "Fayl hajmi 1 baytdan 50 MB gacha bo‘lishi kerak.");
  }
  onProgress?.({ phase: "hashing", loaded: 0, total: file.size });
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
      caseId: caseId || null,
      consent: true,
    }),
  });
  const analysisId = init.analysis.id;
  await putFileWithProgress(
    `/api/platform/document-analysis/uploads/${encodeURIComponent(analysisId)}`,
    file,
    sha256,
    (loaded, total) => onProgress?.({ phase: "uploading", loaded, total }),
  );
  onProgress?.({ phase: "finalizing", loaded: file.size, total: file.size });
  return jsonRequest<SecureDocumentUploadResult>(
    `/api/platform/document-analysis/uploads/${encodeURIComponent(analysisId)}/finalize`,
    { method: "POST", headers: { "x-juro-csrf": "1" } },
    [202],
  );
}

function putFileWithProgress(
  url: string,
  file: File,
  sha256: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("content-type", file.type);
    request.setRequestHeader("x-juro-csrf", "1");
    request.setRequestHeader("x-juro-file-sha256", sha256);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    });
    request.addEventListener("error", () => reject(new Error("Файл не обработан.")));
    request.addEventListener("abort", () => reject(new Error("Файл не обработан.")));
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) return resolve();
      try {
        const body = JSON.parse(request.responseText) as { error?: string };
        reject(new Error(body.error || "Файл не обработан."));
      } catch {
        reject(new Error("Файл не обработан."));
      }
    });
    request.send(file);
  });
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
