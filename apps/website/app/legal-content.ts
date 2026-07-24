export type LegalLocale = "ru" | "uz";
export type LegalSlug = "terms" | "privacy-policy" | "personal-data-processing" | "cookies" | "ai-rules";

type LegalDocument = {
  title: string;
  description: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
};

const sharedRu = "Документ применяется к публичному сайту JURO и пользовательскому приложению в пределах функций, доступных конкретному пользователю.";
const sharedUz = "Hujjat JURO ommaviy sayti va foydalanuvchiga mavjud funksiyalar doirasidagi ilovaga tatbiq etiladi.";

export const legalDocuments: Record<LegalLocale, Record<LegalSlug, LegalDocument>> = {
  ru: {
    terms: { title: "Условия использования", description: "Основные правила использования сайта, приложения и инструментов JURO.", sections: [
      { heading: "Область применения", paragraphs: [sharedRu, "Используя сервис, пользователь обязан предоставлять достоверные сведения и соблюдать права других лиц."] },
      { heading: "Возможности и ограничения", paragraphs: ["JURO помогает структурировать информацию, создавать проекты документов и организовывать совместную работу.", "Материалы AI и шаблоны не являются гарантией результата и не заменяют обязательное нотариальное, государственное или профессиональное действие."] },
      { heading: "Права и обязанности", paragraphs: ["Пользователь контролирует вводимые данные и принимает решение об использовании результата.", "JURO вправе обновлять функции для безопасности, качества и соответствия применимым требованиям."] },
      { heading: "Изменение условий", paragraphs: ["Актуальная редакция публикуется на этой странице с датой обновления. Существенные изменения сообщаются доступным в продукте способом."] },
    ] },
    "privacy-policy": { title: "Политика конфиденциальности", description: "Как JURO обращается с данными при предоставлении цифровых юридических инструментов.", sections: [
      { heading: "Какие данные используются", paragraphs: [sharedRu, "Состав данных зависит от выбранной функции и может включать данные аккаунта, ответы в формах, документы, настройки и технические сведения, необходимые для безопасности сервиса."] },
      { heading: "Цели обработки", paragraphs: ["Данные используются для предоставления выбранной функции, сохранения работы, разграничения доступа, предотвращения злоупотреблений и исполнения запросов пользователя."] },
      { heading: "Доступ и безопасность", paragraphs: ["Доступ предоставляется пользователю и явно приглашённым участникам в пределах назначенных прав.", "JURO применяет организационные и технические меры, соответствующие характеру обрабатываемой информации."] },
      { heading: "Права пользователя", paragraphs: ["Пользователь может управлять профилем, документами, приглашениями и доступными согласиями через интерфейс или канал поддержки, указанный в продукте."] },
    ] },
    "personal-data-processing": { title: "Обработка персональных данных", description: "Правила обработки персональных данных при использовании функций JURO.", sections: [
      { heading: "Основания и объём", paragraphs: [sharedRu, "Обрабатываются только данные, необходимые для выбранного сценария, исполнения пользовательского запроса и обеспечения безопасности."] },
      { heading: "Действия с данными", paragraphs: ["В зависимости от функции данные могут быть получены, сохранены, систематизированы, использованы для формирования результата и удалены по предусмотренному процессу."] },
      { heading: "Передача участникам", paragraphs: ["Передача документа другой стороне или юристу выполняется по действию пользователя и с серверной проверкой прав доступа."] },
      { heading: "Обращения", paragraphs: ["Запрос по персональным данным можно направить через доступный в приложении раздел помощи. Контактные реквизиты публикуются только после их подтверждения владельцем сервиса."] },
    ] },
    cookies: { title: "Правила использования cookies", description: "Какие локальные технологии нужны для работы сайта и приложения JURO.", sections: [
      { heading: "Назначение", paragraphs: [sharedRu, "Cookies и аналогичные технологии могут использоваться для сессии, безопасности, языка интерфейса и технической устойчивости."] },
      { heading: "Обязательные технологии", paragraphs: ["Технологии, необходимые для входа, защиты запросов и сохранения выбранных настроек, обеспечивают базовую работу продукта."] },
      { heading: "Управление", paragraphs: ["Пользователь может изменить настройки браузера. Ограничение обязательных cookies может нарушить вход и сохранение состояния."] },
      { heading: "Изменения", paragraphs: ["Перечень и назначение технологий уточняются при подключении новых подтверждённых сервисов."] },
    ] },
    "ai-rules": { title: "Правила использования AI", description: "Принципы безопасного использования AI-функций JURO.", sections: [
      { heading: "Роль AI", paragraphs: [sharedRu, "AI помогает анализировать введённые сведения, объяснять поля, предлагать структуру и выявлять возможные противоречия."] },
      { heading: "Контроль пользователя", paragraphs: ["AI не должен незаметно изменять подтверждённые факты. Предлагаемые изменения требуют проверки и действия пользователя."] },
      { heading: "Ограничения", paragraphs: ["AI может ошибаться и не заменяет обязательную юридическую, нотариальную или государственную процедуру.", "Сложные, срочные и спорные ситуации рекомендуется передавать квалифицированному специалисту."] },
      { heading: "Безопасное использование", paragraphs: ["Не следует вводить данные, не относящиеся к решаемой задаче. Пользователь должен проверить даты, суммы, стороны и итоговый текст перед применением."] },
    ] },
  },
  uz: {
    terms: { title: "Foydalanish shartlari", description: "JURO sayti, ilovasi va vositalaridan foydalanishning asosiy qoidalari.", sections: [
      { heading: "Qo‘llanish doirasi", paragraphs: [sharedUz, "Xizmatdan foydalanganda foydalanuvchi ishonchli ma’lumot taqdim etishi va boshqa shaxslarning huquqlariga rioya qilishi kerak."] },
      { heading: "Imkoniyatlar va cheklovlar", paragraphs: ["JURO ma’lumotlarni tuzish, hujjat loyihalarini yaratish va hamkorlikni tashkil qilishga yordam beradi.", "AI materiallari va shablonlar natijani kafolatlamaydi hamda majburiy notarial, davlat yoki professional harakatni almashtirmaydi."] },
      { heading: "Huquq va majburiyatlar", paragraphs: ["Foydalanuvchi kiritilgan ma’lumotlarni nazorat qiladi va natijadan foydalanish haqida qaror qabul qiladi.", "JURO xavfsizlik va sifat uchun funksiyalarni yangilashi mumkin."] },
      { heading: "Shartlarni o‘zgartirish", paragraphs: ["Amaldagi tahrir yangilanish sanasi bilan shu sahifada e’lon qilinadi."] },
    ] },
    "privacy-policy": { title: "Maxfiylik siyosati", description: "JURO raqamli yuridik vositalarni taqdim etishda ma’lumotlar bilan qanday ishlaydi.", sections: [
      { heading: "Qanday ma’lumotlar ishlatiladi", paragraphs: [sharedUz, "Ma’lumotlar tarkibi tanlangan funksiyaga bog‘liq bo‘lib, akkaunt, shakl javoblari, hujjatlar va xavfsizlik uchun zarur texnik ma’lumotlarni o‘z ichiga olishi mumkin."] },
      { heading: "Qayta ishlash maqsadlari", paragraphs: ["Ma’lumotlar tanlangan funksiyani taqdim etish, ishni saqlash, kirishni chegaralash va suiiste’molning oldini olish uchun ishlatiladi."] },
      { heading: "Kirish va xavfsizlik", paragraphs: ["Kirish foydalanuvchi va u aniq taklif qilgan ishtirokchilarga belgilangan huquqlar doirasida beriladi."] },
      { heading: "Foydalanuvchi huquqlari", paragraphs: ["Foydalanuvchi profil, hujjatlar, takliflar va mavjud roziliklarni interfeys yoki yordam bo‘limi orqali boshqarishi mumkin."] },
    ] },
    "personal-data-processing": { title: "Shaxsiy ma’lumotlarni qayta ishlash", description: "JURO funksiyalaridan foydalanishda shaxsiy ma’lumotlarni qayta ishlash qoidalari.", sections: [
      { heading: "Asos va hajm", paragraphs: [sharedUz, "Faqat tanlangan ssenariy, foydalanuvchi so‘rovi va xavfsizlik uchun zarur ma’lumotlar qayta ishlanadi."] },
      { heading: "Ma’lumotlar bilan amallar", paragraphs: ["Funksiyaga qarab ma’lumotlar olinishi, saqlanishi, tizimlashtirilishi, natija yaratish uchun ishlatilishi va belgilangan jarayon bo‘yicha o‘chirilishi mumkin."] },
      { heading: "Ishtirokchilarga uzatish", paragraphs: ["Boshqa tomon yoki yuristga uzatish foydalanuvchi harakati va serverdagi huquq tekshiruvi orqali amalga oshiriladi."] },
      { heading: "Murojaatlar", paragraphs: ["Ma’lumotlar bo‘yicha so‘rov ilovadagi yordam bo‘limi orqali yuboriladi. Rekvizitlar xizmat egasi tasdiqlagandan keyin e’lon qilinadi."] },
    ] },
    cookies: { title: "Cookies qoidalari", description: "JURO sayt va ilovasining ishlashi uchun zarur mahalliy texnologiyalar.", sections: [
      { heading: "Maqsad", paragraphs: [sharedUz, "Cookies va o‘xshash texnologiyalar sessiya, xavfsizlik, interfeys tili va texnik barqarorlik uchun ishlatilishi mumkin."] },
      { heading: "Majburiy texnologiyalar", paragraphs: ["Kirish, so‘rovlarni himoyalash va tanlangan sozlamalarni saqlash uchun zarur texnologiyalar mahsulotning asosiy ishlashini ta’minlaydi."] },
      { heading: "Boshqarish", paragraphs: ["Brauzer sozlamalarini o‘zgartirish mumkin. Majburiy cookiesni cheklash kirish va holatni saqlashga xalaqit berishi mumkin."] },
      { heading: "O‘zgarishlar", paragraphs: ["Yangi tasdiqlangan servislar ulanganda texnologiyalar ro‘yxati aniqlashtiriladi."] },
    ] },
    "ai-rules": { title: "AIdan foydalanish qoidalari", description: "JURO AI-funksiyalaridan xavfsiz foydalanish tamoyillari.", sections: [
      { heading: "AI roli", paragraphs: [sharedUz, "AI kiritilgan ma’lumotlarni tahlil qilish, maydonlarni tushuntirish, tuzilma taklif qilish va qarama-qarshiliklarni aniqlashga yordam beradi."] },
      { heading: "Foydalanuvchi nazorati", paragraphs: ["AI tasdiqlangan faktlarni yashirin o‘zgartirmasligi kerak. Takliflar foydalanuvchi tekshiruvi va harakatini talab qiladi."] },
      { heading: "Cheklovlar", paragraphs: ["AI xato qilishi mumkin va majburiy yuridik, notarial yoki davlat tartibini almashtirmaydi.", "Murakkab, shoshilinch va bahsli vaziyatlarni mutaxassisga topshirish tavsiya etiladi."] },
      { heading: "Xavfsiz foydalanish", paragraphs: ["Vazifaga aloqasi bo‘lmagan ma’lumotlarni kiritmaslik kerak. Sana, summa, tomonlar va yakuniy matn foydalanishdan oldin tekshirilishi shart."] },
    ] },
  },
};

export const legalSlugs = Object.keys(legalDocuments.ru) as LegalSlug[];
