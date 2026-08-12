import type { OperationalLocale } from "../operations/operational-feature-flags";

/**
 * Public URL retrieval remains disabled until it has a fetch path that is
 * resistant to DNS rebinding.  Treat every value other than the exact,
 * explicitly deployed string as disabled.
 */
export function publicDocumentUrlImportEnabled(value: string | undefined): boolean {
  return value === "true";
}

export function publicDocumentUrlImportDisabledMessage(locale: OperationalLocale): string {
  return locale === "uz"
    ? "Ommaviy havola orqali import vaqtincha mavjud emas. Faylni qurilmadan yuklang."
    : "Импорт по публичной ссылке временно недоступен. Загрузите файл с устройства.";
}
