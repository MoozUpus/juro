import { lawyerText } from "./lawyer-localization";
import type { PlatformLocale } from "./routing";

export type LawyerProfileNotificationStatus =
  | "profile_incomplete"
  | "pending_review"
  | "public_approved"
  | "changes_requested"
  | "rejected"
  | "suspended"
  | "blocked"
  | "archived";

export function localizedLawyerProfileStatusNotification(
  locale: PlatformLocale,
  status: LawyerProfileNotificationStatus,
  reason?: string,
) {
  const suffix = reason?.trim()
    ? lawyerText(
        locale,
        ` Комментарий: ${reason.trim()}`,
        ` Izoh: ${reason.trim()}`,
        ` Note: ${reason.trim()}`,
      )
    : "";
  if (locale === "uz") {
    const messages: Record<LawyerProfileNotificationStatus, { title: string; body: string }> = {
      profile_incomplete: {
        title: "Yurist profilingiz yaratildi",
        body: "Marketpleysga yuborish uchun majburiy maydonlarni to‘ldiring.",
      },
      pending_review: {
        title: "Yurist profilingiz tekshiruvga yuborildi",
        body: "JURO moderatori profilingizni ko‘rib chiqadi. Tekshiruv tugaguncha yangi mijoz so‘rovlarini qabul qilib bo‘lmaydi.",
      },
      public_approved: {
        title: "Yurist profilingiz tasdiqlandi",
        body: `Profilingiz JURO marketpleysida qabul qilindi.${suffix}`,
      },
      changes_requested: {
        title: "Yurist profilingizni to‘ldirish kerak",
        body: `Qayta ko‘rib chiqishdan oldin ko‘rsatilgan izohni tuzating.${suffix}`,
      },
      rejected: {
        title: "Yurist profilingiz rad etildi",
        body: `Profil marketpleysda e’lon qilinmadi.${suffix}`,
      },
      suspended: {
        title: "Yurist profilingiz vaqtincha yashirildi",
        body: `Profil marketpleys va yangi mijoz so‘rovlaridan vaqtincha olib tashlandi.${suffix}`,
      },
      blocked: {
        title: "Yurist profilingiz bloklandi",
        body: `Profil marketpleysda ko‘rsatilmaydi va yangi mijoz so‘rovlarini qabul qila olmaydi.${suffix}`,
      },
      archived: {
        title: "Yurist profilingiz arxivlandi",
        body: `Profil marketpleysdan olib tashlandi.${suffix}`,
      },
    };
    return messages[status];
  }
  if (locale === "en") {
    const messages: Record<LawyerProfileNotificationStatus, { title: string; body: string }> = {
      profile_incomplete: {
        title: "Your lawyer profile has been created",
        body: "Complete the required fields to submit your profile to the marketplace.",
      },
      pending_review: {
        title: "Your lawyer profile is under review",
        body: "A JURO moderator will review your profile. You cannot accept new client requests until the review is complete.",
      },
      public_approved: {
        title: "Your lawyer profile has been approved",
        body: `Your profile is now approved for the JURO marketplace.${suffix}`,
      },
      changes_requested: {
        title: "Your lawyer profile needs changes",
        body: `Update the requested details before submitting the profile for review again.${suffix}`,
      },
      rejected: {
        title: "Your lawyer profile was not approved",
        body: `The profile has not been published in the marketplace.${suffix}`,
      },
      suspended: {
        title: "Your lawyer profile has been temporarily hidden",
        body: `The profile has been temporarily removed from the marketplace and cannot receive new client requests.${suffix}`,
      },
      blocked: {
        title: "Your lawyer profile has been blocked",
        body: `The profile is not visible in the marketplace and cannot receive new client requests.${suffix}`,
      },
      archived: {
        title: "Your lawyer profile has been archived",
        body: `The profile has been removed from the marketplace.${suffix}`,
      },
    };
    return messages[status];
  }
  const messages: Record<LawyerProfileNotificationStatus, { title: string; body: string }> = {
    profile_incomplete: {
      title: "Профиль юриста создан",
      body: "Заполните обязательные поля, чтобы отправить профиль в маркетплейс.",
    },
    pending_review: {
      title: "Профиль юриста отправлен на проверку",
      body: "Модератор JURO проверит профиль. До завершения проверки нельзя принимать новые клиентские заявки.",
    },
    public_approved: {
      title: "Профиль юриста одобрен",
      body: `Профиль принят в маркетплейс JURO.${suffix}`,
    },
    changes_requested: {
      title: "Профиль юриста нужно доработать",
      body: `Исправьте профиль перед повторной проверкой.${suffix}`,
    },
    rejected: {
      title: "Профиль юриста отклонён",
      body: `Профиль не опубликован в маркетплейсе.${suffix}`,
    },
    suspended: {
      title: "Профиль юриста временно скрыт",
      body: `Профиль временно снят с маркетплейса и не принимает новые заявки.${suffix}`,
    },
    blocked: {
      title: "Профиль юриста заблокирован",
      body: `Профиль не виден в маркетплейсе и не может принимать новые заявки.${suffix}`,
    },
    archived: {
      title: "Профиль юриста архивирован",
      body: `Профиль снят с маркетплейса.${suffix}`,
    },
  };
  return messages[status];
}
