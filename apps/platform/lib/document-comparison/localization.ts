import type { AnalysisExportError } from "../document-analysis/exporter";
import type { PlatformLocale } from "../platform/routing";
import {
  platformLocaleValue,
  type PlatformLocalizedValue,
} from "../../content/platform-localization";
import type { ComparisonProcessingError } from "./types";

export type ComparisonRouteErrorCode =
  | "COMPARISON_NOT_FOUND"
  | "COMPARISON_UNAVAILABLE"
  | "COMPARISON_ALREADY_PROCESSING"
  | "COMPARISON_CHANGE_NOT_FOUND"
  | "COMPARISON_CASE_UNAVAILABLE"
  | "COMPARISON_UNSUPPORTED_CHANGE"
  | "COMPARISON_VERSION_NOT_FOUND"
  | "COMPARISON_FILE_UNAVAILABLE";

const routeErrors = {
  COMPARISON_NOT_FOUND: {
    ru: "Сравнение не найдено.",
    uz: "Taqqoslash topilmadi.",
    en: "The comparison was not found.",
  },
  COMPARISON_UNAVAILABLE: {
    ru: "Сравнение недоступно.",
    uz: "Taqqoslash mavjud emas.",
    en: "The comparison is unavailable.",
  },
  COMPARISON_ALREADY_PROCESSING: {
    ru: "Сравнение уже обрабатывается.",
    uz: "Taqqoslash allaqachon qayta ishlanmoqda.",
    en: "The comparison is already being processed.",
  },
  COMPARISON_CHANGE_NOT_FOUND: {
    ru: "Изменение не найдено.",
    uz: "O‘zgarish topilmadi.",
    en: "The change was not found.",
  },
  COMPARISON_CASE_UNAVAILABLE: {
    ru: "Дело не найдено или недоступно.",
    uz: "Ish topilmadi yoki undan foydalanib bo‘lmaydi.",
    en: "The matter was not found or is unavailable.",
  },
  COMPARISON_UNSUPPORTED_CHANGE: {
    ru: "Нет поддерживаемого изменения.",
    uz: "Qo‘llab-quvvatlanadigan o‘zgarish ko‘rsatilmagan.",
    en: "No supported change was provided.",
  },
  COMPARISON_VERSION_NOT_FOUND: {
    ru: "Версия не найдена.",
    uz: "Versiya topilmadi.",
    en: "The document version was not found.",
  },
  COMPARISON_FILE_UNAVAILABLE: {
    ru: "Файл недоступен.",
    uz: "Fayl mavjud emas.",
    en: "The file is unavailable.",
  },
} satisfies Record<ComparisonRouteErrorCode, PlatformLocalizedValue<string>>;

const processingErrors = {
  CORRUPT_FILE: {
    ru: "Одна из версий повреждена или недоступна.",
    uz: "Versiyalardan biri buzilgan yoki mavjud emas.",
    en: "One of the document versions is damaged or unavailable.",
  },
  FILE_SCAN_REQUIRED: {
    ru: "Проверка безопасности файла не завершена.",
    uz: "Fayl xavfsizligini tekshirish yakunlanmagan.",
    en: "File security validation has not completed.",
  },
  PASSWORD_PROTECTED: {
    ru: "PDF защищён паролем. Снимите защиту и загрузите файл повторно.",
    uz: "PDF parol bilan himoyalangan. Himoyani olib tashlab, faylni qayta yuklang.",
    en: "The PDF is password protected. Remove the protection and upload it again.",
  },
  NO_READABLE_TEXT: {
    ru: "В документе не найден читаемый текст.",
    uz: "Hujjatda o‘qiladigan matn topilmadi.",
    en: "No readable text was found in the document.",
  },
  OCR_REQUIRED: {
    ru: "Для этого документа требуется OCR.",
    uz: "Bu hujjat uchun OCR talab qilinadi.",
    en: "This document requires OCR before it can be compared.",
  },
  PAGE_LIMIT_EXCEEDED: {
    ru: "Документ превышает допустимое количество страниц.",
    uz: "Hujjat ruxsat etilgan sahifalar sonidan oshadi.",
    en: "The document exceeds the permitted page limit.",
  },
  PROCESSING_TIMEOUT: {
    ru: "Обработка превысила допустимое время.",
    uz: "Qayta ishlash ruxsat etilgan vaqtdan oshdi.",
    en: "Processing exceeded the permitted time limit.",
  },
  UNSUPPORTED_FILE: {
    ru: "Формат файла не поддерживается для сравнения.",
    uz: "Fayl formati taqqoslash uchun qo‘llab-quvvatlanmaydi.",
    en: "This file format is not supported for comparison.",
  },
} satisfies Record<ComparisonProcessingError["code"], PlatformLocalizedValue<string>>;

const processingFallback: PlatformLocalizedValue<string> = {
  ru: "Сравнение не завершено. Повторите обработку.",
  uz: "Taqqoslash yakunlanmadi. Qayta ishlashni takrorlang.",
  en: "The comparison could not be completed. Try processing it again.",
};

const exportErrors = {
  ANALYSIS_EXPORT_NOT_FOUND: {
    ru: "Экспорт не найден или недоступен.",
    uz: "Eksport topilmadi yoki mavjud emas.",
    en: "The export was not found or is unavailable.",
  },
  ANALYSIS_EXPORT_NOT_READY: {
    ru: "Экспорт доступен после завершения сравнения.",
    uz: "Eksport taqqoslash yakunlangandan keyin mavjud bo‘ladi.",
    en: "The export will be available after the comparison is complete.",
  },
  ANALYSIS_EXPORT_INVALID_SOURCE: {
    ru: "Данные сравнения для экспорта недоступны.",
    uz: "Eksport uchun taqqoslash ma’lumotlari mavjud emas.",
    en: "The comparison data required for export is unavailable.",
  },
  ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT: {
    ru: "Idempotency-Key некорректен или уже относится к другому экспорту.",
    uz: "Idempotency-Key noto‘g‘ri yoki boshqa eksportga tegishli.",
    en: "The Idempotency-Key is invalid or already belongs to another export.",
  },
  ANALYSIS_EXPORT_OBJECT_FAILED: {
    ru: "Файл экспорта временно недоступен.",
    uz: "Eksport fayli vaqtincha mavjud emas.",
    en: "The export file is temporarily unavailable.",
  },
  ANALYSIS_EXPORT_NOT_TERMINAL: {
    ru: "Дождитесь завершения экспорта.",
    uz: "Eksport yakunlanishini kuting.",
    en: "Wait for the export to finish.",
  },
  ANALYSIS_EXPORT_DELETE_FAILED: {
    ru: "Не удалось удалить экспорт.",
    uz: "Eksportni o‘chirib bo‘lmadi.",
    en: "The export could not be deleted.",
  },
  ANALYSIS_EXPORT_CAPACITY_UNAVAILABLE: {
    ru: "Очередь экспорта временно занята. Повторите попытку позднее.",
    uz: "Eksport navbati vaqtincha band. Keyinroq qayta urinib ko‘ring.",
    en: "The export queue is temporarily busy. Please try again later.",
  },
  ANALYSIS_EXPORT_FORMAT_INVALID: {
    ru: "Поддерживаются только PDF и DOCX.",
    uz: "Faqat PDF va DOCX formatlari qo‘llab-quvvatlanadi.",
    en: "Only PDF and DOCX formats are supported.",
  },
} satisfies Record<AnalysisExportError["code"], PlatformLocalizedValue<string>>;

export function comparisonRouteErrorMessage(
  code: ComparisonRouteErrorCode,
  locale: PlatformLocale,
): string {
  return platformLocaleValue(locale, routeErrors[code]);
}

export function comparisonProcessingErrorMessage(
  code: string,
  locale: PlatformLocale,
): string {
  const localized = (processingErrors as Record<string, PlatformLocalizedValue<string>>)[code]
    ?? processingFallback;
  return platformLocaleValue(locale, localized);
}

export function comparisonExportErrorMessage(
  code: AnalysisExportError["code"],
  locale: PlatformLocale,
): string {
  return platformLocaleValue(locale, exportErrors[code]);
}
