import { DOCUMENT_CATEGORIES } from "../document-builder/registry/categories";
import type { PlatformLocale } from "./routing";

type LocalizedValue = readonly [ru: string, uz: string];

const platformStatusLabels: Record<string, LocalizedValue> = {
  open: ["Открыто", "Ochiq"],
  active: ["Активно", "Faol"],
  completed: ["Завершено", "Yakunlangan"],
  archived: ["В архиве", "Arxivda"],
  not_started: ["Не начато", "Boshlanmagan"],
  planned: ["Запланировано", "Rejalashtirilgan"],
  in_progress: ["В работе", "Jarayonda"],
  waiting_information: ["Ожидает информации", "Ma’lumot kutilmoqda"],
  waiting_counterparty: ["Ожидает другую сторону", "Qarshi tomon kutilmoqda"],
  cancelled: ["Отменено", "Bekor qilingan"],
  proposed: ["Время предложено", "Vaqt taklif qilingan"],
  confirmed: ["Подтверждено", "Tasdiqlangan"],
  accepted: ["Заявка принята", "So‘rov qabul qilingan"],
  conflict_check_pending: ["Требуется проверка конфликта", "Manfaatlar to‘qnashuvini tekshirish kerak"],
  awaiting_user_consent: ["Ожидается решение клиента", "Mijozning qarori kutilmoqda"],
  access_granted: ["Доступ предоставлен", "Ruxsat berilgan"],
  needs_information: ["Ожидаются сведения клиента", "Mijoz ma’lumoti kutilmoqda"],
  declined: ["Заявка отклонена", "So‘rov rad etilgan"],
  access_revoked: ["Доступ отозван", "Ruxsat bekor qilingan"],
  conflict_declined: ["Конфликт интересов", "Manfaatlar to‘qnashuvi"],
  offer_proposed: ["Условия направлены клиенту", "Shartlar mijozga yuborilgan"],
  offer_accepted: ["Условия приняты", "Shartlar qabul qilingan"],
  offer_declined: ["Условия отклонены", "Shartlar rad etilgan"],
  service_proposal_proposed: ["Предложение услуги направлено", "Xizmat taklifi yuborilgan"],
};

const documentStatusLabels: Record<string, LocalizedValue> = {
  Черновик: ["Черновик", "Qoralama"],
  Готов: ["Готов", "Tayyor"],
  Согласован: ["Согласован", "Kelishilgan"],
  Подписан: ["Подписан", "Imzolangan"],
  Архив: ["В архиве", "Arxivda"],
};

function localized(
  labels: Record<string, LocalizedValue>,
  value: string,
  locale: PlatformLocale,
  fallback: LocalizedValue,
) {
  return labels[value]?.[locale === "ru" ? 0 : 1] ?? fallback[locale === "ru" ? 0 : 1];
}

/** Converts persisted workflow values to safe, user-facing copy. */
export function platformStatusLabel(value: string, locale: PlatformLocale) {
  return localized(platformStatusLabels, value, locale, ["Статус обновлён", "Holat yangilandi"]);
}

export function documentStatusLabel(value: string, locale: PlatformLocale) {
  return localized(documentStatusLabels, value, locale, ["Статус документа обновлён", "Hujjat holati yangilandi"]);
}

export function documentCategoryLabel(value: string, locale: PlatformLocale) {
  const category = DOCUMENT_CATEGORIES.find(
    (item) => item.slug === value || item.title.ru === value || item.title.uz === value,
  );
  return category?.title[locale] ?? (locale === "ru" ? "Документ" : "Hujjat");
}
