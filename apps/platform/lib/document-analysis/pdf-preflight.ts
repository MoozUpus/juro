import { getDocumentProxy } from "unpdf";

const PDF_PREFLIGHT_TIMEOUT_MS = 12_000;
export const DOCUMENT_ANALYSIS_PDF_PAGE_LIMIT = 500;

export class PdfPreflightError extends Error {
  constructor(
    public readonly code: "PDF_CORRUPT" | "PDF_PASSWORD_PROTECTED" | "PDF_PAGE_LIMIT_EXCEEDED" | "PDF_PREFLIGHT_TIMEOUT",
    message: string,
  ) {
    super(message);
    this.name = "PdfPreflightError";
  }
}

export async function inspectPdfPageCount(
  bytes: Uint8Array,
  limit = DOCUMENT_ANALYSIS_PDF_PAGE_LIMIT,
): Promise<number> {
  let document: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    document = await withTimeout(getDocumentProxy(bytes, { maxImageSize: 16_777_216 }));
    const pageCount = document.numPages;
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new PdfPreflightError("PDF_CORRUPT", "PDF не содержит читаемой структуры страниц.");
    }
    if (pageCount > limit) {
      throw new PdfPreflightError("PDF_PAGE_LIMIT_EXCEEDED", `PDF содержит ${pageCount} страниц; допустимо не более ${limit}.`);
    }
    return pageCount;
  } catch (error) {
    if (error instanceof PdfPreflightError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/password|encrypted|PasswordException/i.test(message)) {
      throw new PdfPreflightError("PDF_PASSWORD_PROTECTED", "PDF защищён паролем.");
    }
    throw new PdfPreflightError("PDF_CORRUPT", "PDF повреждён или не может быть прочитан.");
  } finally {
    await (document as { destroy?: () => Promise<void> } | null)?.destroy?.().catch(() => undefined);
  }
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new PdfPreflightError("PDF_PREFLIGHT_TIMEOUT", "Проверка структуры PDF превысила допустимое время.")),
          PDF_PREFLIGHT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
