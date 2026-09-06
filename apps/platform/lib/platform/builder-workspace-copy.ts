import type { PlatformLocale } from "./routing";

export const builderWorkspaceCopy = {
  ru: {
    documents: {
      loadError: "Не удалось загрузить документы.", deleted: "Документ удалён", deleteError: "Удаление не выполнено.", uploadError: "PDF не загружен.", shareError: "Ссылка не создана.", close: "Закрыть сообщение",
      title: "Мои документы", countOne: "документ", countMany: "документов и файлов", create: "Создать документ", languageNote: "Названия и содержимое документов отображаются на выбранном для каждого документа языке.",
      folders: { all: "Все", created: "Созданные", shared: "Доступные мне", favorite: "Избранное", archive: "Архив" },
      search: "Поиск по названию или участникам", statusFilter: "Фильтр по статусу", allStatuses: "Все статусы", statuses: { draft: "Черновик", ready: "Готов", approved: "Согласован", signed: "Подписан", archived: "Архив" },
      createdAfter: "Создано после даты", sort: "Сортировка", newest: "Новые сначала", oldest: "Старые сначала", byTitle: "По названию",
      loading: "Загружаем документы…", emptyTitle: "Здесь пока нет документов", emptyBody: "Выберите шаблон — черновик появится здесь после входа.", chooseTemplate: "Выбрать шаблон",
      sharedAccess: "Совместный доступ", participantsMissing: "Участники ещё не указаны", continue: "Продолжить", open: "Открыть", signedVersion: "Подписанная версия",
      caseLabel: "Дело", noCase: "Без дела", unavailableCase: "Недоступное или архивное дело", caseLinked: "Документ добавлен в дело", caseUnlinked: "Документ удалён из дела", caseLinkError: "Не удалось изменить дело.", caseSaving: "Сохраняем привязку",
      removeFavorite: "Убрать из избранного", addFavorite: "Добавить в избранное", more: "Другие действия", rename: "Переименовать", renameDialogTitle: "Переименовать документ", renameDialogBody: "Введите понятное название — оно будет показано в списке документов.", renameLabel: "Название", renameSave: "Сохранить название", renameSaving: "Сохраняем…", renameError: "Не удалось переименовать документ.", renamed: "Название сохранено", duplicate: "Создать копию", restore: "Восстановить", moveArchive: "Переместить в архив", uploadSigned: "Загрузить подписанный PDF", remove: "Удалить",
      standalone: "Отдельно сохранённый подписанный PDF", kilobytes: "КБ", active: "Активна", newLink: "Создать новую ссылку", deleteLink: "Удалить ссылку", code: "Код", codeShownOnce: "Код показывается только при создании. Если он утерян, создайте новую ссылку.", copyLink: "Скопировать ссылку", copyCode: "Скопировать код", copyAll: "Скопировать ссылку и код вместе", createDayLink: "Создать ссылку на 24 часа", download: "Скачать", share: "Поделиться",
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
      title: "Mening hujjatlarim", countOne: "ta hujjat", countMany: "ta hujjat va fayl", create: "Hujjat yaratish", languageNote: "Hujjat nomi va mazmuni har bir hujjat uchun tanlangan tilda ko‘rsatiladi.",
      folders: { all: "Barchasi", created: "Yaratilgan", shared: "Menga ulashilgan", favorite: "Tanlangan", archive: "Arxiv" },
      search: "Nomi yoki ishtirokchi bo‘yicha qidirish", statusFilter: "Holat bo‘yicha filter", allStatuses: "Barcha holatlar", statuses: { draft: "Qoralama", ready: "Tayyor", approved: "Kelishilgan", signed: "Imzolangan", archived: "Arxiv" },
      createdAfter: "Shu sanadan keyin yaratilgan", sort: "Saralash", newest: "Avval yangilari", oldest: "Avval eskilari", byTitle: "Nomi bo‘yicha",
      loading: "Hujjatlar yuklanmoqda…", emptyTitle: "Hozircha hujjatlar yo‘q", emptyBody: "Shablonni tanlang — tizimga kirgach, qoralama shu yerda paydo bo‘ladi.", chooseTemplate: "Shablonni tanlash",
      sharedAccess: "Hamkorlikdagi kirish", participantsMissing: "Ishtirokchilar hali ko‘rsatilmagan", continue: "Davom ettirish", open: "Ochish", signedVersion: "Imzolangan nusxa",
      caseLabel: "Ish", noCase: "Ishsiz", unavailableCase: "Mavjud bo‘lmagan yoki arxivdagi ish", caseLinked: "Hujjat ishga qo‘shildi", caseUnlinked: "Hujjat ishdan olib tashlandi", caseLinkError: "Ishni o‘zgartirib bo‘lmadi.", caseSaving: "Bog‘lanish saqlanmoqda",
      removeFavorite: "Tanlanganlardan olib tashlash", addFavorite: "Tanlanganlarga qo‘shish", more: "Boshqa amallar", rename: "Nomini o‘zgartirish", renameDialogTitle: "Hujjat nomini o‘zgartirish", renameDialogBody: "Tushunarli nom kiriting — u hujjatlar ro‘yxatida ko‘rsatiladi.", renameLabel: "Nomi", renameSave: "Nomni saqlash", renameSaving: "Saqlanmoqda…", renameError: "Hujjat nomini o‘zgartirib bo‘lmadi.", renamed: "Nom saqlandi", duplicate: "Nusxa yaratish", restore: "Tiklash", moveArchive: "Arxivga ko‘chirish", uploadSigned: "Imzolangan PDF-ni yuklash", remove: "O‘chirish",
      standalone: "Alohida saqlangan imzolangan PDF", kilobytes: "KB", active: "Faol", newLink: "Yangi havola yaratish", deleteLink: "Havolani o‘chirish", code: "Kod", codeShownOnce: "Kod faqat yaratilganda ko‘rsatiladi. Yo‘qolsa, yangi havola yarating.", copyLink: "Havolani nusxalash", copyCode: "Kodni nusxalash", copyAll: "Havola va kodni birga nusxalash", createDayLink: "24 soatlik havola yaratish", download: "Yuklab olish", share: "Ulashish",
      deleteDialog: "Imzolangan PDF bilan nima qilinsin?", deleteDialogBody: "Asosiy hujjat tiklash imkoniyatisiz o‘chiriladi.", deleteTogether: "Imzolangan PDF-ni hujjat bilan birga o‘chirish", keepSigned: "Imzolangan PDF-ni alohida saqlash", cancel: "Bekor qilish",
    },
    contacts: {
      saveError: "Kontaktni saqlab bo‘lmadi.", title: "Saqlangan kontaktlar", count: "ta kontakt yangi hujjatlar uchun", add: "Kontakt qo‘shish", search: "Kontaktni qidirish", missing: "Qo‘shimcha ma’lumot ko‘rsatilmagan", edit: "Tahrirlash", remove: "O‘chirish", emptyTitle: "Hozircha kontaktlar yo‘q", emptyBody: "Yangi hujjatlarda qayta ishlatish uchun shaxs ma’lumotlarini saqlang.", editTitle: "Kontaktni tahrirlash", newTitle: "Yangi kontakt", close: "Yopish", label: "Kontakt yorlig‘i", labelExample: "Aka, qo‘shni, mijoz", fullName: "F.I.Sh.", birthDate: "Tug‘ilgan sana", documentType: "Hujjat turi", notSelected: "Tanlanmagan", passport: "Pasport", idCard: "ID-karta", documentNumber: "Hujjat raqami", issuedBy: "Kim tomonidan berilgan", issueDate: "Berilgan sana", pinfl: "JShShIR", phone: "Telefon", address: "Manzil", cancel: "Bekor qilish", save: "Kontaktni saqlash",
    },
    notifications: {
      title: "Bildirishnomalar", subtitle: "Faqat JURO ichki hodisalari", readAll: "Barchasini o‘qilgan deb belgilash", openDocument: "Hujjatni ochish", markRead: "O‘qilgan deb belgilash", emptyTitle: "Yangi bildirishnomalar yo‘q", emptyBody: "Hujjatlaringiz bo‘yicha boshqa tomonning harakatlari shu yerda ko‘rinadi.",
    },
  },
  en: {
    documents: {
      loadError: "We could not load your documents.", deleted: "Document deleted", deleteError: "The document could not be deleted.", uploadError: "The PDF could not be uploaded.", shareError: "The share link could not be created.", close: "Close message",
      title: "My documents", countOne: "document", countMany: "documents and files", create: "Create document", languageNote: "Document titles, participant names and content remain in each document’s selected language.",
      folders: { all: "All", created: "Created by me", shared: "Shared with me", favorite: "Favourites", archive: "Archive" },
      search: "Search by title or participant", statusFilter: "Filter by status", allStatuses: "All statuses", statuses: { draft: "Draft", ready: "Ready", approved: "Approved", signed: "Signed", archived: "Archived" },
      createdAfter: "Created after", sort: "Sort documents", newest: "Newest first", oldest: "Oldest first", byTitle: "Title A–Z",
      loading: "Loading documents…", emptyTitle: "No documents yet", emptyBody: "Choose a template. Your draft will appear here after you sign in.", chooseTemplate: "Choose a template",
      sharedAccess: "Shared access", participantsMissing: "Participants have not been added yet", continue: "Continue", open: "Open", signedVersion: "Signed version",
      caseLabel: "Matter", noCase: "No matter", unavailableCase: "Unavailable or archived matter", caseLinked: "Document linked to matter", caseUnlinked: "Document removed from matter", caseLinkError: "The matter link could not be changed.", caseSaving: "Saving matter link",
      removeFavorite: "Remove from favourites", addFavorite: "Add to favourites", more: "More actions", rename: "Rename", renameDialogTitle: "Rename document", renameDialogBody: "Enter a clear title. It will appear in your document list.", renameLabel: "Title", renameSave: "Save title", renameSaving: "Saving…", renameError: "The document could not be renamed.", renamed: "Title saved", duplicate: "Duplicate", restore: "Restore", moveArchive: "Move to archive", uploadSigned: "Upload signed PDF", remove: "Delete",
      standalone: "Signed PDF stored separately", kilobytes: "KB", active: "Active", newLink: "Create new link", deleteLink: "Delete link", code: "Code", codeShownOnce: "The code is shown only when the link is created. Create a new link if you lose it.", copyLink: "Copy link", copyCode: "Copy code", copyAll: "Copy link and code", createDayLink: "Create 24-hour link", download: "Download", share: "Share",
      deleteDialog: "What should happen to the signed PDF?", deleteDialogBody: "The main document will be permanently deleted.", deleteTogether: "Delete the signed PDF with the document", keepSigned: "Keep the signed PDF separately", cancel: "Cancel",
    },
    contacts: {
      saveError: "The contact could not be saved.", title: "Saved contacts", count: "contacts available for new documents", add: "Add contact", search: "Search contacts", missing: "No additional details", edit: "Edit", remove: "Delete", emptyTitle: "No contacts yet", emptyBody: "Save a person's details to reuse them in future documents.", editTitle: "Edit contact", newTitle: "New contact", close: "Close", label: "Contact label", labelExample: "Brother, neighbour, client", fullName: "Full name", birthDate: "Date of birth", documentType: "Identity document", notSelected: "Not selected", passport: "Passport", idCard: "ID card", documentNumber: "Document number", issuedBy: "Issued by", issueDate: "Issue date", pinfl: "PINFL", phone: "Phone", address: "Address", cancel: "Cancel", save: "Save contact",
    },
    notifications: {
      title: "Notifications", subtitle: "JURO workspace activity only", readAll: "Mark all as read", openDocument: "Open document", markRead: "Mark as read", emptyTitle: "No new notifications", emptyBody: "Actions taken by other parties on your documents will appear here.",
    },
  },
} as const;

export function workspaceCopy(locale: PlatformLocale | null) {
  return builderWorkspaceCopy[locale ?? "ru"];
}

export function documentBuilderMetadataCopy(locale: PlatformLocale | null) {
  return {
    ru: {
      title: "Создать документ",
      description: "Библиотека и интерактивный конструктор юридических документов JURO.",
    },
    uz: {
        title: "Hujjat yaratish",
        description: "JURO yuridik hujjatlar kutubxonasi va interaktiv konstruktori.",
    },
    en: {
      title: "Create a document",
      description: "JURO's legal document library and interactive document builder.",
    },
  }[locale ?? "ru"];
}

export function localizedDocumentStatus(status: string, locale: PlatformLocale | null): string {
  const labels = builderWorkspaceCopy[locale ?? "ru"].documents.statuses;
  return ({
    Черновик: labels.draft,
    Готов: labels.ready,
    Согласован: labels.approved,
    Подписан: labels.signed,
    Архив: labels.archived,
  } as Record<string, string>)[status] ?? status;
}
