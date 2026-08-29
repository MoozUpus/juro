import type { PlatformLocale } from "./routing";

export const builderWorkspaceCopy = {
  ru: {
    documents: {
      loadError: "Не удалось загрузить документы.", deleted: "Документ удалён", deleteError: "Удаление не выполнено.", uploadError: "PDF не загружен.", shareError: "Ссылка не создана.", close: "Закрыть сообщение",
      title: "Мои документы", countOne: "документ", countMany: "документов и файлов", create: "Создать документ",
      folders: { all: "Все", created: "Созданные", shared: "Доступные мне", favorite: "Избранное", archive: "Архив" },
      search: "Поиск по названию или участникам", statusFilter: "Фильтр по статусу", allStatuses: "Все статусы", statuses: { draft: "Черновик", ready: "Готов", approved: "Согласован", signed: "Подписан", archived: "Архив" },
      createdAfter: "Создано после даты", sort: "Сортировка", newest: "Новые сначала", oldest: "Старые сначала", byTitle: "По названию",
      loading: "Загружаем документы…", emptyTitle: "Здесь пока нет документов", emptyBody: "Выберите шаблон — черновик появится здесь после входа.", chooseTemplate: "Выбрать шаблон",
      sharedAccess: "Совместный доступ", participantsMissing: "Участники ещё не указаны", continue: "Продолжить", open: "Открыть", signedVersion: "Подписанная версия",
      caseLabel: "Дело", noCase: "Без дела", unavailableCase: "Недоступное или архивное дело", caseLinked: "Документ добавлен в дело", caseUnlinked: "Документ удалён из дела", caseLinkError: "Не удалось изменить дело.", caseSaving: "Сохраняем привязку",
      removeFavorite: "Убрать из избранного", addFavorite: "Добавить в избранное", more: "Другие действия", renamePrompt: "Новое название", rename: "Переименовать", duplicate: "Создать копию", restore: "Восстановить", moveArchive: "Переместить в архив", uploadSigned: "Загрузить подписанный PDF", remove: "Удалить",
      standalone: "Отдельно сохранённый подписанный PDF", kilobytes: "КБ", active: "Активна", newLink: "Создать новую ссылку", deleteLink: "Удалить ссылку", code: "Код", copyLink: "Скопировать ссылку", copyCode: "Скопировать код", copyAll: "Скопировать ссылку и код вместе", createDayLink: "Создать ссылку на 24 часа", download: "Скачать", share: "Поделиться",
      deleteDialog: "Что сделать с подписанным PDF?", deleteDialogBody: "Основной документ будет удалён без возможности восстановления.", deleteTogether: "Удалить подписанный PDF вместе с документом", keepSigned: "Сохранить подписанный PDF отдельно", cancel: "Отмена",
    },
    contacts: {
      saveError: "Не удалось сохранить контакт.", title: "Сохранённые контакты", count: "контактов для новых документов", add: "Добавить контакт", search: "Найти контакт", missing: "Дополнительные данные не указаны", edit: "Редактировать", remove: "Удалить", emptyTitle: "Контактов пока нет", emptyBody: "Сохраните данные человека, чтобы выбирать их при создании новых расписок.", editTitle: "Редактировать контакт", newTitle: "Новый контакт", close: "Закрыть", label: "Пользовательская метка", labelExample: "Брат, сосед, клиент", fullName: "Ф.И.О.", birthDate: "Дата рождения", documentType: "Тип документа", notSelected: "Не выбран", passport: "Паспорт", idCard: "ID-карта", documentNumber: "Номер документа", issuedBy: "Кем выдан", issueDate: "Дата выдачи", pinfl: "ПИНФЛ", phone: "Телефон", address: "Адрес", cancel: "Отмена", save: "Сохранить контакт",
    },
    notifications: {
      title: "Уведомления", subtitle: "Только внутренние события JURO", readAll: "Прочитать все", openDocument: "Открыть документ", markRead: "Отметить прочитанным", emptyTitle: "Новых уведомлений нет", emptyBody: "Здесь появятся действия второй стороны по вашим документам.",
    },
  },
  uz: {
    documents: {
      loadError: "Hujjatlarni yuklab bo‘lmadi.", deleted: "Hujjat o‘chirildi", deleteError: "Hujjatni o‘chirib bo‘lmadi.", uploadError: "PDF yuklanmadi.", shareError: "Havola yaratilmadi.", close: "Xabarni yopish",
      title: "Mening hujjatlarim", countOne: "ta hujjat", countMany: "ta hujjat va fayl", create: "Hujjat yaratish",
      folders: { all: "Barchasi", created: "Yaratilgan", shared: "Menga ulashilgan", favorite: "Tanlangan", archive: "Arxiv" },
      search: "Nomi yoki ishtirokchi bo‘yicha qidirish", statusFilter: "Holat bo‘yicha filter", allStatuses: "Barcha holatlar", statuses: { draft: "Qoralama", ready: "Tayyor", approved: "Kelishilgan", signed: "Imzolangan", archived: "Arxiv" },
      createdAfter: "Shu sanadan keyin yaratilgan", sort: "Saralash", newest: "Avval yangilari", oldest: "Avval eskilari", byTitle: "Nomi bo‘yicha",
      loading: "Hujjatlar yuklanmoqda…", emptyTitle: "Hozircha hujjatlar yo‘q", emptyBody: "Shablonni tanlang — tizimga kirgach, qoralama shu yerda paydo bo‘ladi.", chooseTemplate: "Shablonni tanlash",
      sharedAccess: "Hamkorlikdagi kirish", participantsMissing: "Ishtirokchilar hali ko‘rsatilmagan", continue: "Davom ettirish", open: "Ochish", signedVersion: "Imzolangan nusxa",
      caseLabel: "Ish", noCase: "Ishsiz", unavailableCase: "Mavjud bo‘lmagan yoki arxivdagi ish", caseLinked: "Hujjat ishga qo‘shildi", caseUnlinked: "Hujjat ishdan olib tashlandi", caseLinkError: "Ishni o‘zgartirib bo‘lmadi.", caseSaving: "Bog‘lanish saqlanmoqda",
      removeFavorite: "Tanlanganlardan olib tashlash", addFavorite: "Tanlanganlarga qo‘shish", more: "Boshqa amallar", renamePrompt: "Yangi nom", rename: "Nomini o‘zgartirish", duplicate: "Nusxa yaratish", restore: "Tiklash", moveArchive: "Arxivga ko‘chirish", uploadSigned: "Imzolangan PDF-ni yuklash", remove: "O‘chirish",
      standalone: "Alohida saqlangan imzolangan PDF", kilobytes: "KB", active: "Faol", newLink: "Yangi havola yaratish", deleteLink: "Havolani o‘chirish", code: "Kod", copyLink: "Havolani nusxalash", copyCode: "Kodni nusxalash", copyAll: "Havola va kodni birga nusxalash", createDayLink: "24 soatlik havola yaratish", download: "Yuklab olish", share: "Ulashish",
      deleteDialog: "Imzolangan PDF bilan nima qilinsin?", deleteDialogBody: "Asosiy hujjat tiklash imkoniyatisiz o‘chiriladi.", deleteTogether: "Imzolangan PDF-ni hujjat bilan birga o‘chirish", keepSigned: "Imzolangan PDF-ni alohida saqlash", cancel: "Bekor qilish",
    },
    contacts: {
      saveError: "Kontaktni saqlab bo‘lmadi.", title: "Saqlangan kontaktlar", count: "ta kontakt yangi hujjatlar uchun", add: "Kontakt qo‘shish", search: "Kontaktni qidirish", missing: "Qo‘shimcha ma’lumot ko‘rsatilmagan", edit: "Tahrirlash", remove: "O‘chirish", emptyTitle: "Hozircha kontaktlar yo‘q", emptyBody: "Yangi hujjatlarda qayta ishlatish uchun shaxs ma’lumotlarini saqlang.", editTitle: "Kontaktni tahrirlash", newTitle: "Yangi kontakt", close: "Yopish", label: "Kontakt yorlig‘i", labelExample: "Aka, qo‘shni, mijoz", fullName: "F.I.Sh.", birthDate: "Tug‘ilgan sana", documentType: "Hujjat turi", notSelected: "Tanlanmagan", passport: "Pasport", idCard: "ID-karta", documentNumber: "Hujjat raqami", issuedBy: "Kim tomonidan berilgan", issueDate: "Berilgan sana", pinfl: "JShShIR", phone: "Telefon", address: "Manzil", cancel: "Bekor qilish", save: "Kontaktni saqlash",
    },
    notifications: {
      title: "Bildirishnomalar", subtitle: "Faqat JURO ichki hodisalari", readAll: "Barchasini o‘qilgan deb belgilash", openDocument: "Hujjatni ochish", markRead: "O‘qilgan deb belgilash", emptyTitle: "Yangi bildirishnomalar yo‘q", emptyBody: "Hujjatlaringiz bo‘yicha boshqa tomonning harakatlari shu yerda ko‘rinadi.",
    },
  },
} as const;

export function workspaceCopy(locale: PlatformLocale | null) {
  return builderWorkspaceCopy[locale === "uz" ? "uz" : "ru"];
}

export function documentBuilderMetadataCopy(locale: PlatformLocale | null) {
  return locale === "uz"
    ? {
        title: "Hujjat yaratish",
        description: "JURO yuridik hujjatlar kutubxonasi va interaktiv konstruktori.",
      }
    : {
        title: "Создать документ",
        description: "Библиотека и интерактивный конструктор юридических документов JURO.",
      };
}

export function localizedDocumentStatus(status: string, locale: PlatformLocale | null): string {
  if (locale !== "uz") return status;
  const labels = builderWorkspaceCopy.uz.documents.statuses;
  return ({ Черновик: labels.draft, Готов: labels.ready, Согласован: labels.approved, Подписан: labels.signed, Архив: labels.archived } as Record<string, string>)[status] ?? status;
}
