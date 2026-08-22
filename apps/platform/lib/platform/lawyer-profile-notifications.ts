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
  locale: "ru" | "uz",
  status: LawyerProfileNotificationStatus,
  reason?: string,
) {
  const suffix = reason?.trim()
    ? locale === "uz" ? ` Izoh: ${reason.trim()}` : ` Комментарий: ${reason.trim()}`
    : "";
  if (locale === "uz") {
    const messages: Record<LawyerProfileNotificationStatus, { title: string; body: string }> = {
      profile_incomplete: {
        title: "Yurist profilingiz yaratildi",
        body: "Marketpleysga yuborish uchun majburiy maydonlarni to‘ldiring.",
      },
      pending_review: {
        title: "Yurist profilingiz e’lon qilishga tayyor",
        body: "Ochiq ko‘rinishni tekshiring va e’lon qilishga rozilikni tasdiqlang. Tasdiqlanguncha yangi mijoz so‘rovlarini qabul qilib bo‘lmaydi.",
      },
      public_approved: {
        title: "Yurist profilingiz e’lon qilindi",
        body: `Profilingiz JURO marketpleysida ochiq e’lon qilindi.${suffix}`,
      },
      changes_requested: {
        title: "Yurist profilingizni to‘ldirish kerak",
        body: `Qayta e’lon qilishdan oldin ko‘rsatilgan izohni tuzating.${suffix}`,
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
  const messages: Record<LawyerProfileNotificationStatus, { title: string; body: string }> = {
    profile_incomplete: {
      title: "Профиль юриста создан",
      body: "Заполните обязательные поля, чтобы отправить профиль в маркетплейс.",
    },
    pending_review: {
      title: "Профиль юриста готов к публикации",
      body: "Проверьте публичный вид и подтвердите согласие на публикацию. До подтверждения новые клиентские заявки недоступны.",
    },
    public_approved: {
      title: "Профиль юриста опубликован",
      body: `Профиль публично размещён в маркетплейсе JURO.${suffix}`,
    },
    changes_requested: {
      title: "Профиль юриста нужно доработать",
      body: `Исправьте замечания перед повторной публикацией.${suffix}`,
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
