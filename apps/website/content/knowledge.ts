import type { Language } from "./types";

export const knowledgeSlugs = [
  "contract-review-preparation",
  "facts-for-action-plan",
  "when-lawyer-review-is-needed",
] as const;

export type KnowledgeSlug = (typeof knowledgeSlugs)[number];

export type KnowledgeArticle = {
  title: string;
  description: string;
  category: string;
  author: string;
  reviewer: string;
  updatedAt: string;
  currentAsOf: string;
  sources: Array<{ title: string; url: string }>;
  relatedTool: { label: string; path: string };
  intro: string;
  sections: Array<{ heading: string; paragraphs: string[]; points?: string[] }>;
  disclaimer: string;
};

export const knowledgeArticles: Record<Language, Record<KnowledgeSlug, KnowledgeArticle>> = {
  ru: {
    "contract-review-preparation": {
      title: "Как подготовиться к проверке договора",
      description: "Практический список материалов и вопросов, которые помогают быстрее и точнее проверить договор.",
      category: "Договоры",
      author: "Редакция JURO",
      reviewer: "Юридическая редакция JURO",
      updatedAt: "26.07.2026",
      currentAsOf: "26.07.2026",
      sources: [{ title: "LexUZ — Национальная база данных законодательства Республики Узбекистан", url: "https://lex.uz/" }],
      relatedTool: { label: "Проверить документ в JURO", path: "/document-review" },
      intro: "Проверка договора начинается не с поиска «опасных слов», а с понимания сделки. Чем полнее контекст, тем легче сопоставить текст с реальными договорённостями и заметить пропуски.",
      sections: [
        {
          heading: "Соберите полный комплект",
          paragraphs: ["Нужна последняя версия договора и все документы, на которые она ссылается. Приложения, спецификации, техническое задание и переписка могут менять смысл обязательств не меньше, чем основной текст."],
          points: ["последняя редактируемая версия и PDF-копия", "приложения, спецификации и графики", "существенная переписка и коммерческое предложение", "предыдущая версия с замечаниями, если она есть"],
        },
        {
          heading: "Зафиксируйте цель и границы",
          paragraphs: ["Кратко опишите, что каждая сторона должна сделать, в какой срок и за какую сумму. Отдельно отметьте условия, без которых сделка для вас теряет смысл."],
          points: ["предмет и ожидаемый результат", "цена, валюта и порядок оплаты", "сроки и критерии приёмки", "ответственность и порядок прекращения"],
        },
        {
          heading: "Составьте список вопросов",
          paragraphs: ["Вопросы лучше формулировать через последствия: что произойдёт при задержке, кто оплачивает дополнительные расходы, можно ли передать работу третьему лицу. Это помогает превратить проверку в понятный план переговоров."],
        },
      ],
      disclaimer: "Материал носит информационный характер и не заменяет индивидуальную юридическую консультацию. Для крупной, срочной или спорной сделки рекомендуется проверка квалифицированным юристом.",
    },
    "facts-for-action-plan": {
      title: "Какие факты нужны для плана действий",
      description: "Как отделить подтверждённые обстоятельства от предположений и построить проверяемую хронологию.",
      category: "Планы действий",
      author: "Редакция JURO",
      reviewer: "Юридическая редакция JURO",
      updatedAt: "26.07.2026",
      currentAsOf: "26.07.2026",
      sources: [{ title: "LexUZ — Национальная база данных законодательства Республики Узбекистан", url: "https://lex.uz/" }],
      relatedTool: { label: "Составить план действий в JURO", path: "/action-plan" },
      intro: "Хороший план опирается на факты, которые можно проверить. Предположение тоже важно, но его нужно обозначить как неподтверждённое и превратить в отдельный вопрос или задачу.",
      sections: [
        {
          heading: "Начните с хронологии",
          paragraphs: ["Запишите события по датам: что произошло, кто участвовал и какой документ это подтверждает. Если точная дата неизвестна, укажите диапазон и не превращайте догадку в точный факт."],
          points: ["дата или период", "участники события", "действие или бездействие", "связанный документ, сообщение или платёж"],
        },
        {
          heading: "Разделите факты и позиции",
          paragraphs: ["Фраза «контрагент нарушил договор» является оценкой. Фразы «оплата должна была поступить 5 июля» и «на 12 июля платёж не поступил» — проверяемые обстоятельства, из которых уже можно делать выводы."],
        },
        {
          heading: "Проверьте сроки и пробелы",
          paragraphs: ["Отдельно соберите известные крайние сроки, уже выполненные действия и сведения, которых не хватает. Неопределённость должна быть видна в плане, а не скрыта внутри уверенной формулировки."],
          points: ["что нужно сделать немедленно", "что зависит от ответа другой стороны", "какой документ требуется получить", "когда нужен живой специалист"],
        },
      ],
      disclaimer: "Автоматически подготовленный план не гарантирует юридический результат. Пользователь должен проверить факты, сроки и применимость каждого шага.",
    },
    "when-lawyer-review-is-needed": {
      title: "Когда документ должен проверить живой юрист",
      description: "Признаки, при которых автоматической проверки недостаточно и нужен профессиональный анализ.",
      category: "Юридическая проверка",
      author: "Редакция JURO",
      reviewer: "Юридическая редакция JURO",
      updatedAt: "26.07.2026",
      currentAsOf: "26.07.2026",
      sources: [{ title: "LexUZ — Национальная база данных законодательства Республики Узбекистан", url: "https://lex.uz/" }],
      relatedTool: { label: "Передать документ юристу", path: "/consultations" },
      intro: "AI и структурированные шаблоны полезны для первичного разбора, но не заменяют профессиональное суждение там, где ошибка может привести к существенным потерям или необратимым последствиям.",
      sections: [
        {
          heading: "Высокая цена ошибки",
          paragraphs: ["Проверка живым юристом особенно важна для недвижимости, инвестиций, крупных обязательств, залога, поручительства, интеллектуальной собственности и корпоративного контроля."],
        },
        {
          heading: "Спор, срочность или неравные условия",
          paragraphs: ["Подключите специалиста, если спор уже начался, срок истекает, другая сторона отказывается обсуждать условия или документ содержит необычные ограничения и значительные штрафы."],
          points: ["идёт претензионная или судебная процедура", "есть короткий процессуальный или договорный срок", "текст регулируется правом другой страны", "несколько документов противоречат друг другу"],
        },
        {
          heading: "Как подготовить передачу",
          paragraphs: ["Передайте специалисту не только файл, но и краткую цель, подтверждённые факты, сроки, спорные пункты и вопросы. Так консультация начинается с анализа, а не с повторного сбора контекста."],
        },
      ],
      disclaimer: "Перечень не является исчерпывающим. При сомнении в последствиях документа безопаснее получить индивидуальную консультацию до подписания или отправки.",
    },
  },
  uz: {
    "contract-review-preparation": {
      title: "Shartnomani tekshirishga qanday tayyorlanish",
      description: "Shartnomani tezroq va aniqroq tekshirishga yordam beradigan materiallar va savollar ro‘yxati.",
      category: "Shartnomalar",
      author: "JURO tahririyati",
      reviewer: "JURO yuridik tahririyati",
      updatedAt: "26.07.2026",
      currentAsOf: "26.07.2026",
      sources: [{ title: "LexUZ — O‘zbekiston Respublikasi qonunchilik ma’lumotlari milliy bazasi", url: "https://lex.uz/" }],
      relatedTool: { label: "Hujjatni JUROda tekshirish", path: "/document-review" },
      intro: "Shartnoma tekshiruvi «xavfli so‘zlar»ni qidirishdan emas, bitimni tushunishdan boshlanadi. Kontekst qanchalik to‘liq bo‘lsa, matnni amaldagi kelishuvlar bilan solishtirish shunchalik oson bo‘ladi.",
      sections: [
        {
          heading: "To‘liq hujjatlar to‘plamini yig‘ing",
          paragraphs: ["Shartnomaning oxirgi nusxasi va unda havola qilingan barcha hujjatlar kerak. Ilovalar, spetsifikatsiyalar, texnik topshiriq va yozishmalar majburiyatlar mazmuniga ta’sir qilishi mumkin."],
          points: ["oxirgi tahrirlanadigan nusxa va PDF", "ilovalar, spetsifikatsiyalar va jadvallar", "muhim yozishmalar va tijorat taklifi", "izohlar bilan oldingi versiya, agar mavjud bo‘lsa"],
        },
        {
          heading: "Maqsad va chegaralarni belgilang",
          paragraphs: ["Har bir tomon nima qilishi, qaysi muddatda va qaysi summa evaziga bajarishi kerakligini qisqacha yozing. Siz uchun bitimning mazmunini yo‘qotadigan shartlarni alohida belgilang."],
          points: ["predmet va kutilgan natija", "narx, valyuta va to‘lov tartibi", "muddatlar va qabul qilish mezonlari", "javobgarlik va bekor qilish tartibi"],
        },
        {
          heading: "Savollar ro‘yxatini tuzing",
          paragraphs: ["Savollarni oqibat orqali ifodalash foydali: kechikish bo‘lsa nima bo‘ladi, qo‘shimcha xarajatni kim to‘laydi, ishni uchinchi shaxsga topshirish mumkinmi. Bu tekshiruvni muzokaralar rejasiga aylantiradi."],
        },
      ],
      disclaimer: "Material axborot xarakteriga ega va individual yuridik maslahatni almashtirmaydi. Yirik, shoshilinch yoki nizoli bitimni malakali yurist tekshirishi tavsiya etiladi.",
    },
    "facts-for-action-plan": {
      title: "Harakatlar rejasi uchun qanday faktlar kerak",
      description: "Tasdiqlangan holatlarni taxminlardan ajratish va tekshiriladigan xronologiya tuzish.",
      category: "Harakatlar rejasi",
      author: "JURO tahririyati",
      reviewer: "JURO yuridik tahririyati",
      updatedAt: "26.07.2026",
      currentAsOf: "26.07.2026",
      sources: [{ title: "LexUZ — O‘zbekiston Respublikasi qonunchilik ma’lumotlari milliy bazasi", url: "https://lex.uz/" }],
      relatedTool: { label: "JUROda harakatlar rejasini tuzish", path: "/action-plan" },
      intro: "Yaxshi reja tekshirish mumkin bo‘lgan faktlarga tayanadi. Taxmin ham muhim, lekin u tasdiqlanmagan deb belgilanib, alohida savol yoki vazifaga aylantirilishi kerak.",
      sections: [
        {
          heading: "Xronologiyadan boshlang",
          paragraphs: ["Voqealarni sana bo‘yicha yozing: nima bo‘ldi, kim qatnashdi va qaysi hujjat buni tasdiqlaydi. Aniq sana noma’lum bo‘lsa, vaqt oralig‘ini ko‘rsating."],
          points: ["sana yoki davr", "voqea ishtirokchilari", "harakat yoki harakatsizlik", "bog‘liq hujjat, xabar yoki to‘lov"],
        },
        {
          heading: "Fakt va bahoni ajrating",
          paragraphs: ["«Kontragent shartnomani buzdi» — bu baho. «To‘lov 5-iyulgacha kelishi kerak edi» va «12-iyul holatiga to‘lov kelmadi» — tekshiriladigan holatlardir."],
        },
        {
          heading: "Muddatlar va bo‘shliqlarni tekshiring",
          paragraphs: ["Ma’lum oxirgi muddatlar, bajarilgan ishlar va yetishmayotgan ma’lumotlarni alohida yig‘ing. Noaniqlik ishonchli jumla ichida yashirilmasligi kerak."],
          points: ["darhol nima qilish kerak", "nima boshqa tomon javobiga bog‘liq", "qaysi hujjatni olish kerak", "qachon jonli mutaxassis kerak"],
        },
      ],
      disclaimer: "Avtomatik tuzilgan reja yuridik natijani kafolatlamaydi. Foydalanuvchi faktlar, muddatlar va har bir qadamning qo‘llanishini tekshirishi kerak.",
    },
    "when-lawyer-review-is-needed": {
      title: "Hujjatni qachon jonli yurist tekshirishi kerak",
      description: "Avtomatik tekshiruv yetarli bo‘lmagan va professional tahlil talab qilinadigan holatlar.",
      category: "Yuridik tekshiruv",
      author: "JURO tahririyati",
      reviewer: "JURO yuridik tahririyati",
      updatedAt: "26.07.2026",
      currentAsOf: "26.07.2026",
      sources: [{ title: "LexUZ — O‘zbekiston Respublikasi qonunchilik ma’lumotlari milliy bazasi", url: "https://lex.uz/" }],
      relatedTool: { label: "Hujjatni yuristga topshirish", path: "/consultations" },
      intro: "AI va tuzilgan shablonlar dastlabki tahlil uchun foydali, ammo xato katta yo‘qotish yoki qaytarib bo‘lmaydigan oqibatga olib kelishi mumkin bo‘lgan joyda professional fikrni almashtirmaydi.",
      sections: [
        {
          heading: "Xatoning yuqori qiymati",
          paragraphs: ["Ko‘chmas mulk, investitsiya, yirik majburiyat, garov, kafillik, intellektual mulk va korporativ nazorat bo‘yicha jonli yurist tekshiruvi ayniqsa muhim."],
        },
        {
          heading: "Nizo, shoshilinchlik yoki teng bo‘lmagan shartlar",
          paragraphs: ["Nizo boshlangan, muddat tugayotgan, boshqa tomon shartlarni muhokama qilmayotgan yoki hujjatda katta jarima va noodatiy cheklovlar bo‘lsa, mutaxassisni jalb qiling."],
          points: ["da’vo yoki sud jarayoni ketmoqda", "qisqa protsessual yoki shartnoma muddati bor", "matn boshqa davlat huquqi bilan tartibga solinadi", "bir nechta hujjat bir-biriga zid"],
        },
        {
          heading: "Topshirishni qanday tayyorlash kerak",
          paragraphs: ["Mutaxassisga fayl bilan birga qisqa maqsad, tasdiqlangan faktlar, muddatlar, bahsli bandlar va savollarni bering. Shunda maslahat kontekstni qayta yig‘ishdan emas, tahlildan boshlanadi."],
        },
      ],
      disclaimer: "Ro‘yxat to‘liq emas. Hujjat oqibatlariga shubha bo‘lsa, imzolash yoki yuborishdan oldin individual maslahat olish xavfsizroq.",
    },
  },
};
