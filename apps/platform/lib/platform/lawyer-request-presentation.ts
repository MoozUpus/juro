import { lawyerIntlLocale, lawyerText } from "./lawyer-localization";
import type { PlatformLocale } from "./routing";

export function lawyerRequestServiceLabel(
  value: string | null | undefined,
  locale: PlatformLocale,
): string {
  const labels: Record<string, [string, string, string]> = {
    initial_consultation: ["Первичная консультация", "Dastlabki maslahat", "Initial consultation"],
    document_review: ["Проверка документа", "Hujjatni tekshirish", "Document review"],
    case_strategy: ["Стратегия по делу", "Ish strategiyasi", "Case strategy"],
    representation: ["Представительство", "Vakillik", "Representation"],
    other: ["Другая юридическая помощь", "Boshqa yuridik yordam", "Other legal assistance"],
  };
  const label = labels[value ?? ""];
  return label
    ? lawyerText(locale, label[0], label[1], label[2])
    : lawyerText(locale, "Услуга не указана", "Xizmat ko‘rsatilmagan", "Service not specified");
}

export function lawyerRequestFormatLabel(
  value: string | null | undefined,
  locale: PlatformLocale,
): string {
  const labels: Record<string, [string, string, string]> = {
    chat: ["Чат", "Chat", "Chat"],
    video: ["Видео", "Video", "Video"],
    phone: ["Телефон", "Telefon", "Phone"],
    office: ["Очно", "Ofisda", "In person"],
  };
  const label = labels[value ?? ""];
  return label
    ? lawyerText(locale, label[0], label[1], label[2])
    : lawyerText(locale, "Формат не указан", "Format ko‘rsatilmagan", "Format not specified");
}

export function formatLawyerRequestDate(value: string, locale: PlatformLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lawyerIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tashkent",
  }).format(date);
}
