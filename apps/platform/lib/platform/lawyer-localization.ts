import type { PlatformLocale } from "./routing";

/**
 * Keeps lawyer-facing copy explicit in every supported locale. English must
 * never silently inherit the Uzbek branch of a binary locale conditional.
 */
export function lawyerText<T>(
  locale: PlatformLocale,
  russian: T,
  uzbek: T,
  english: T,
): T {
  if (String(locale) === "ru") return russian;
  if (String(locale) === "uz") return uzbek;
  return english;
}

export function lawyerIntlLocale(locale: PlatformLocale): string {
  return lawyerText(locale, "ru-RU", "uz-UZ", "en-GB");
}

export function lawyerDocumentStatus(status: string, locale: PlatformLocale): string {
  const labels: Record<string, [string, string, string]> = {
    Черновик: ["Черновик", "Qoralama", "Draft"],
    Qoralama: ["Черновик", "Qoralama", "Draft"],
    Draft: ["Черновик", "Qoralama", "Draft"],
    draft: ["Черновик", "Qoralama", "Draft"],
    Готов: ["Готов", "Tayyor", "Ready"],
    Tayyor: ["Готов", "Tayyor", "Ready"],
    Ready: ["Готов", "Tayyor", "Ready"],
    ready: ["Готов", "Tayyor", "Ready"],
    Согласован: ["Согласован", "Kelishilgan", "Approved"],
    Kelishilgan: ["Согласован", "Kelishilgan", "Approved"],
    Approved: ["Согласован", "Kelishilgan", "Approved"],
    approved: ["Согласован", "Kelishilgan", "Approved"],
    Подписан: ["Подписан", "Imzolangan", "Signed"],
    Imzolangan: ["Подписан", "Imzolangan", "Signed"],
    Signed: ["Подписан", "Imzolangan", "Signed"],
    signed: ["Подписан", "Imzolangan", "Signed"],
    Архив: ["Архив", "Arxiv", "Archived"],
    Arxiv: ["Архив", "Arxiv", "Archived"],
    Archive: ["Архив", "Arxiv", "Archived"],
    archived: ["Архив", "Arxiv", "Archived"],
  };
  const value = labels[status];
  return value
    ? lawyerText(locale, value[0], value[1], value[2])
    : lawyerText(locale, "Документ", "Hujjat", "Document");
}
