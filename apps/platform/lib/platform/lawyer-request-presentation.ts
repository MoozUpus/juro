export function lawyerRequestServiceLabel(
  value: string | null | undefined,
  ru: boolean,
): string {
  const labels: Record<string, [string, string]> = {
    initial_consultation: ["Первичная консультация", "Dastlabki maslahat"],
    document_review: ["Проверка документа", "Hujjatni tekshirish"],
    case_strategy: ["Стратегия по делу", "Ish strategiyasi"],
    representation: ["Представительство", "Vakillik"],
    other: ["Другая юридическая помощь", "Boshqa yuridik yordam"],
  };
  return labels[value ?? ""]?.[ru ? 0 : 1]
    ?? (ru ? "Услуга не указана" : "Xizmat ko‘rsatilmagan");
}

export function lawyerRequestFormatLabel(
  value: string | null | undefined,
  ru: boolean,
): string {
  const labels: Record<string, [string, string]> = {
    chat: ["Чат", "Chat"],
    video: ["Видео", "Video"],
    phone: ["Телефон", "Telefon"],
    office: ["Очно", "Ofisda"],
  };
  return labels[value ?? ""]?.[ru ? 0 : 1]
    ?? (ru ? "Формат не указан" : "Format ko‘rsatilmagan");
}

export function formatLawyerRequestDate(value: string, ru: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tashkent",
  }).format(date);
}
