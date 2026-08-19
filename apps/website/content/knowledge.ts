import type { PublicLanguage } from "./types";

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

export const knowledgeArticles: Record<PublicLanguage, Record<KnowledgeSlug, KnowledgeArticle>> = {
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
  en: {
    "contract-review-preparation": {
      title: "How to prepare for a contract review",
      description: "A practical checklist of materials and questions that helps make a contract review faster and more precise.",
      category: "Contracts",
      author: "JURO Editorial Team",
      reviewer: "JURO Legal Editorial Team",
      updatedAt: "26 July 2026",
      currentAsOf: "26 July 2026",
      sources: [{ title: "LexUZ — National database of legislation of the Republic of Uzbekistan", url: "https://lex.uz/" }],
      relatedTool: { label: "Review a document in JURO", path: "/document-review" },
      intro: "A contract review does not begin by searching for ‘risky words’; it begins by understanding the deal. The fuller the context, the easier it is to compare the text with the actual agreement and spot omissions.",
      sections: [
        { heading: "Collect the complete set", paragraphs: ["Use the latest version of the contract and every document it refers to. Annexes, specifications, terms of reference and correspondence can change the meaning of obligations as much as the main text."], points: ["the latest editable version and PDF copy", "annexes, specifications and schedules", "material correspondence and commercial proposal", "an earlier version with comments, if available"] },
        { heading: "Record the purpose and boundaries", paragraphs: ["Briefly state what each party must do, by when and for what amount. Separately mark terms without which the deal loses its value for you."], points: ["subject matter and expected outcome", "price, currency and payment procedure", "deadlines and acceptance criteria", "liability and termination procedure"] },
        { heading: "Prepare a list of questions", paragraphs: ["Frame questions through consequences: what happens if there is a delay, who pays additional costs, and whether work can be assigned to a third party. This turns a review into a clear negotiation plan."] },
      ],
      disclaimer: "This material is informational and does not replace individual legal advice. A significant, urgent or disputed transaction should be reviewed by a qualified legal professional.",
    },
    "facts-for-action-plan": {
      title: "What facts are needed for an action plan",
      description: "How to separate confirmed circumstances from assumptions and build a verifiable timeline.",
      category: "Action plans",
      author: "JURO Editorial Team",
      reviewer: "JURO Legal Editorial Team",
      updatedAt: "26 July 2026",
      currentAsOf: "26 July 2026",
      sources: [{ title: "LexUZ — National database of legislation of the Republic of Uzbekistan", url: "https://lex.uz/" }],
      relatedTool: { label: "Prepare an action plan in JURO", path: "/action-plan" },
      intro: "A good plan relies on facts that can be verified. An assumption can also matter, but it should be marked as unconfirmed and turned into a separate question or task.",
      sections: [
        { heading: "Start with the timeline", paragraphs: ["List events by date: what happened, who took part and which document confirms it. If the precise date is unknown, state a range instead of turning a guess into a fact."], points: ["date or period", "people involved", "action or inaction", "related document, message or payment"] },
        { heading: "Separate facts from positions", paragraphs: ["‘The counterparty breached the contract’ is an assessment. ‘Payment was due on 5 July’ and ‘payment had not arrived by 12 July’ are verifiable circumstances from which conclusions can be drawn."] },
        { heading: "Check deadlines and gaps", paragraphs: ["Collect known deadlines, actions already taken and missing information separately. Uncertainty should be visible in the plan, not hidden inside a confident statement."], points: ["what needs to happen immediately", "what depends on the other party’s response", "which document must be obtained", "when a live professional is needed"] },
      ],
      disclaimer: "An automatically prepared plan does not guarantee a legal outcome. The user must check the facts, deadlines and applicability of every step.",
    },
    "when-lawyer-review-is-needed": {
      title: "When a document needs a legal professional’s review",
      description: "Signals that automated review is not enough and professional analysis is needed.",
      category: "Legal review",
      author: "JURO Editorial Team",
      reviewer: "JURO Legal Editorial Team",
      updatedAt: "26 July 2026",
      currentAsOf: "26 July 2026",
      sources: [{ title: "LexUZ — National database of legislation of the Republic of Uzbekistan", url: "https://lex.uz/" }],
      relatedTool: { label: "Hand a document to a legal professional", path: "/consultations" },
      intro: "AI and structured templates are useful for an initial review, but they do not replace professional judgment where an error can cause material loss or irreversible consequences.",
      sections: [
        { heading: "A high cost of error", paragraphs: ["A live professional’s review is particularly important for real estate, investments, major obligations, security, guarantees, intellectual property and corporate control."] },
        { heading: "Dispute, urgency or unequal terms", paragraphs: ["Bring in a professional if a dispute has started, a deadline is expiring, the other party refuses to discuss terms, or the document contains unusual restrictions and material penalties."], points: ["a claim or court procedure is under way", "there is a short procedural or contractual deadline", "the text is governed by another country’s law", "multiple documents contradict one another"] },
        { heading: "How to prepare the handoff", paragraphs: ["Give the professional not only the file, but also a short purpose, confirmed facts, deadlines, disputed clauses and questions. The consultation can then begin with analysis rather than rebuilding the context."] },
      ],
      disclaimer: "This list is not exhaustive. If you are unsure about a document’s consequences, it is safer to obtain individual advice before signing or sending it.",
    },
  },
};
