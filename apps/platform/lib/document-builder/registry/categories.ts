import type { DocumentCategory } from "./types";

export const DOCUMENT_CATEGORIES = [
  { code: "01", slug: "family", icon: "HeartHandshake", title: { ru: "Семья", uz: "Oila" }, description: { ru: "Брак, дети, алименты и родительские права.", uz: "Nikoh, bolalar, aliment va ota-onalik huquqlari." } },
  { code: "02", slug: "work", icon: "BriefcaseBusiness", title: { ru: "Трудовые отношения", uz: "Mehnat munosabatlari" }, description: { ru: "Документы работника и работодателя по трудовым спорам.", uz: "Mehnat nizolari bo‘yicha xodim va ish beruvchi hujjatlari." } },
  { code: "03", slug: "court", icon: "Scale", title: { ru: "Суд и процесс", uz: "Sud va protsess" }, description: { ru: "Заявления, ходатайства и процессуальные документы.", uz: "Arizalar, iltimosnomalar va protsessual hujjatlar." } },
  { code: "05", slug: "civil", icon: "FileText", title: { ru: "Гражданские споры", uz: "Fuqarolik nizolari" }, description: { ru: "Договорные и иные гражданско-правовые требования.", uz: "Shartnomaviy va boshqa fuqarolik-huquqiy talablar." } },
  { code: "06", slug: "debt", icon: "HandCoins", title: { ru: "Долги и обязательства", uz: "Qarzlar va majburiyatlar" }, description: { ru: "Взыскание задолженности, процентов и неустойки.", uz: "Qarzdorlik, foiz va neustoykani undirish." } },
  { code: "07", slug: "property", icon: "Landmark", title: { ru: "Имущество", uz: "Mol-mulk" }, description: { ru: "Право собственности, владение и регистрация имущества.", uz: "Mulk huquqi, egalik va mol-mulkni ro‘yxatdan o‘tkazish." } },
  { code: "08", slug: "consumer", icon: "ShoppingBag", title: { ru: "Права потребителей", uz: "Iste’molchilar huquqlari" }, description: { ru: "Товары, услуги, возврат денег и компенсации.", uz: "Tovarlar, xizmatlar, pulni qaytarish va kompensatsiyalar." } },
  { code: "09", slug: "damages", icon: "ShieldAlert", title: { ru: "Возмещение вреда", uz: "Zararni qoplash" }, description: { ru: "Материальный и моральный вред, регресс и убытки.", uz: "Moddiy va ma’naviy zarar, regress va ziyonlar." } },
  { code: "10", slug: "inheritance", icon: "ScrollText", title: { ru: "Наследство", uz: "Meros" }, description: { ru: "Завещания, наследники, сроки и раздел наследства.", uz: "Vasiyatnoma, merosxo‘rlar, muddatlar va merosni bo‘lish." } },
  { code: "11", slug: "housing", icon: "House", title: { ru: "Жильё", uz: "Uy-joy" }, description: { ru: "Пользование жильём, вселение, выселение и регистрация.", uz: "Uy-joydan foydalanish, kiritish, ko‘chirish va ro‘yxat." } },
  { code: "12", slug: "appeals", icon: "Gavel", title: { ru: "Обжалование", uz: "Shikoyat qilish" }, description: { ru: "Апелляционные и иные жалобы на судебные акты.", uz: "Sud hujjatlari ustidan apellyatsiya va boshqa shikoyatlar." } },
  { code: "13", slug: "contracts", icon: "Handshake", title: { ru: "Договоры", uz: "Shartnomalar" }, description: { ru: "Самостоятельные проекты гражданских и коммерческих договоров.", uz: "Fuqarolik va tijorat shartnomalarining mustaqil loyihalari." } },
  { code: "14", slug: "powers-of-attorney", icon: "BadgeCheck", title: { ru: "Доверенности", uz: "Ishonchnomalar" }, description: { ru: "Полномочия представителей и доверенности для разных ситуаций.", uz: "Vakillarning vakolatlari va turli holatlar uchun ishonchnomalar." } },
  { code: "15", slug: "applications", icon: "ClipboardPen", title: { ru: "Заявления", uz: "Arizalar" }, description: { ru: "Заявления в организации и уполномоченные органы.", uz: "Tashkilotlar va vakolatli organlarga arizalar." } },
  { code: "16", slug: "corporate", icon: "Building2", title: { ru: "Корпоративные документы", uz: "Korporativ hujjatlar" }, description: { ru: "Решения, протоколы и внутренние документы организаций.", uz: "Tashkilotlarning qarorlari, bayonnomalari va ichki hujjatlari." } },
  { code: "17", slug: "personal", icon: "UserRound", title: { ru: "Персональные документы", uz: "Shaxsiy hujjatlar" }, description: { ru: "Личные, семейные, трудовые и социальные обращения граждан.", uz: "Fuqarolarning shaxsiy, oilaviy, mehnat va ijtimoiy murojaatlari." } },
  { code: "18", slug: "notarial", icon: "Stamp", title: { ru: "Нотариальные проекты", uz: "Notarial loyihalar" }, description: { ru: "Проекты документов, для которых может потребоваться нотариальное удостоверение.", uz: "Notarial tasdiqlash talab qilinishi mumkin bo‘lgan hujjatlar loyihalari." } },
] as const satisfies readonly DocumentCategory[];

export function getCategory(slug: string): DocumentCategory | undefined {
  return DOCUMENT_CATEGORIES.find((category) => category.slug === slug);
}
