import type { Language } from "./types";

type IconName =
  | "message"
  | "file-check"
  | "file-plus"
  | "diff"
  | "list"
  | "scale"
  | "users"
  | "bell"
  | "briefcase";

export type ExperienceContent = {
  heroRoute: {
    label: string;
    stages: Array<{ short: string; title: string; detail: string }>;
    complete: string;
    replay: string;
  };
  heroFrame: {
    label: string;
    question: string;
    facts: string;
    source: string;
    risk: string;
    action: string;
  };
  finder: {
    eyebrow: string;
    title: string;
    body: string;
    prompt: string;
    back: string;
    resultLabel: string;
    prepareLabel: string;
    cta: string;
    tasks: Array<{
      id: string;
      title: string;
      icon: IconName;
      scenarios: Array<{
        title: string;
        tool: string;
        prepare: string[];
        path: string;
        accountType?: "business";
      }>;
    }>;
  };
  tools: {
    eyebrow: string;
    title: string;
    body: string;
    account: string;
    items: Array<{
      title: string;
      body: string;
      result: string;
      cta: string;
      path: string;
      icon: IconName;
      accountType?: "business";
    }>;
  };
  demo: {
    eyebrow: string;
    title: string;
    body: string;
    scenarioLabel: string;
    stages: string[];
    cta: string;
    privacy: string;
    scenarios: Array<{
      title: string;
      question: string;
      facts: string;
      source: string;
      risk: string;
      plan: string;
      document: string;
      path: string;
    }>;
  };
  versionCompare: {
    eyebrow: string;
    title: string;
    body: string;
    tabs: string[];
    before: string;
    after: string;
    summary: string;
    change: string;
    consequence: string;
    riskLabel: string;
    risk: string;
    recommendation: string;
    recommendationBody: string;
    cta: string;
  };
  monitoring: {
    eyebrow: string;
    title: string;
    body: string;
    status: string;
    statusBody: string;
    cta: string;
    sourceLabel: string;
    source: string;
  };
  trust: {
    eyebrow: string;
    title: string;
    body: string;
    checked: string;
    items: Array<{ title: string; body: string; state: string }>;
    cta: string;
  };
  pricing: {
    eyebrow: string;
    title: string;
    body: string;
    personal: string;
    business: string;
    included: string;
    note: string;
    plans: {
      personal: Array<{
        title: string;
        forWhom: string;
        price: string;
        items: string[];
        cta: string;
        path: string;
      }>;
      business: Array<{
        title: string;
        forWhom: string;
        price: string;
        items: string[];
        cta: string;
        path: string;
      }>;
    };
  };
  health: {
    eyebrow: string;
    title: string;
    body: string;
    yes: string;
    no: string;
    progress: string;
    result: string;
    levels: [string, string, string];
    resultBodies: [string, string, string];
    restart: string;
    cta: string;
    disclaimer: string;
    questions: string[];
  };
  sourceStatus: {
    eyebrow: string;
    title: string;
    body: string;
    labels: { source: string; status: string; checked: string; languages: string };
    official: string;
    available: string;
    checked: string;
    languages: string;
    unavailable: string;
    cta: string;
  };
  cookie: {
    title: string;
    body: string;
    essential: string;
    accept: string;
    policy: string;
  };
};

export const experience: Record<Language, ExperienceContent> = {
  ru: {
    heroRoute: {
      label: "Золотой маршрут решения JURO",
      stages: [
        { short: "01", title: "Ситуация", detail: "JURO уточняет факты" },
        { short: "02", title: "Источники", detail: "Показывает основание" },
        { short: "03", title: "План", detail: "Собирает следующие шаги" },
        { short: "04", title: "Документ", detail: "Готовит результат" },
      ],
      complete: "Контекст сохраняется между этапами",
      replay: "Повторить маршрут",
    },
    heroFrame: {
      label: "Пример результата",
      question: "Поставщик просрочил поставку. Что делать?",
      facts: "3 факта требуют подтверждения",
      source: "Источник будет показан рядом с выводом",
      risk: "Риск срока претензии",
      action: "Составить план и претензию",
    },
    finder: {
      eyebrow: "LEGAL ROUTE FINDER",
      title: "Не знаете, с какого инструмента начать?",
      body: "Выберите тип задачи. Навигатор подскажет подходящий сценарий JURO и список материалов для подготовки — без выдачи окончательного юридического заключения.",
      prompt: "Что вы хотите сделать?",
      back: "Изменить задачу",
      resultLabel: "Рекомендуемый сценарий",
      prepareLabel: "Подготовьте",
      cta: "Перейти в JURO",
      tasks: [
        {
          id: "situation",
          title: "Разобрать ситуацию",
          icon: "message",
          scenarios: [
            { title: "Личный вопрос", tool: "AI-юрист и план действий", prepare: ["краткую хронологию", "важные даты", "имеющиеся документы"], path: "/ai-chat" },
            { title: "Вопрос бизнеса", tool: "Бизнес-разбор и рабочее дело", prepare: ["цель компании", "участников", "договоры и переписку"], path: "/ai-chat", accountType: "business" },
          ],
        },
        {
          id: "document",
          title: "Проверить документ",
          icon: "file-check",
          scenarios: [
            { title: "Один договор", tool: "Анализ документа", prepare: ["последнюю версию", "приложения", "вашу роль в сделке"], path: "/document-review" },
            { title: "Две версии", tool: "Сравнение редакций", prepare: ["старую версию", "новую версию", "важные для вас условия"], path: "/document-comparison" },
          ],
        },
        {
          id: "create",
          title: "Создать документ",
          icon: "file-plus",
          scenarios: [
            { title: "Личный документ", tool: "Конструктор документов", prepare: ["данные сторон", "суммы и даты", "желаемые условия"], path: "/document-builder" },
            { title: "Документ бизнеса", tool: "Бизнес-конструктор", prepare: ["реквизиты", "предмет сделки", "сроки и порядок оплаты"], path: "/document-builder", accountType: "business" },
          ],
        },
      ],
    },
    tools: {
      eyebrow: "ВОЗМОЖНОСТИ",
      title: "Девять инструментов — один юридический процесс",
      body: "Факты, файлы, сроки и решения остаются связаны с делом. Переход между инструментами не заставляет пользователя заново пересказывать ситуацию.",
      account: "Откроется в защищённом аккаунте",
      items: [
        { title: "AI-юрист", body: "Уточняет факты и отделяет их от предположений.", result: "Структурированный разбор с уровнем уверенности.", cta: "Разобрать ситуацию", path: "/ai-chat", icon: "message" },
        { title: "Анализ документа", body: "Показывает замечания рядом с соответствующими условиями.", result: "Резюме, пробелы, риски и вопросы.", cta: "Проверить документ", path: "/document-review", icon: "file-check" },
        { title: "Создание документа", body: "Проводит по вопросам и формирует редактируемый проект.", result: "Проект документа с проверкой ключевых данных.", cta: "Создать документ", path: "/document-builder", icon: "file-plus" },
        { title: "Сравнение версий", body: "Сопоставляет старую и новую редакции по смыслу и риску.", result: "Изменения, последствия и рекомендация.", cta: "Сравнить документы", path: "/document-comparison", icon: "diff" },
        { title: "План действий", body: "Связывает шаги, сроки, ответственных и документы.", result: "Понятное ближайшее действие.", cta: "Собрать план", path: "/action-plan", icon: "list" },
        { title: "Проверка источников", body: "Открывает правовое основание рядом с выводом.", result: "Проверяемая связь между выводом и источником.", cta: "Начать исследование", path: "/ai-chat", icon: "scale" },
        { title: "Живой юрист", body: "Получает только выбранный и подтверждённый контекст.", result: "Передача без повторного пересказа.", cta: "Передать вопрос", path: "/consultations", icon: "users" },
        { title: "Мониторинг", body: "Помогает определить, какие дела и документы может затронуть изменение.", result: "Настраиваемые области внимания после запуска feed.", cta: "Настроить мониторинг", path: "/monitoring", icon: "bell", accountType: "business" },
        { title: "Рабочее пространство", body: "Объединяет роли, комментарии, версии и историю.", result: "Управляемый процесс для команды.", cta: "Создать пространство", path: "/dashboard", icon: "briefcase", accountType: "business" },
      ],
    },
    demo: {
      eyebrow: "ИНТЕРАКТИВНОЕ ДЕМО",
      title: "Посмотрите, как JURO превращает вопрос в результат",
      body: "Демо использует только обезличенные примеры. Публичная страница не принимает реальные документы и персональные данные.",
      scenarioLabel: "Выберите пример",
      stages: ["Уточнение", "Источник", "Риск", "План", "Документ"],
      cta: "Разобрать свою ситуацию",
      privacy: "Реальная работа продолжается только в защищённом аккаунте JURO.",
      scenarios: [
        { title: "Задержка зарплаты", question: "Работодатель второй месяц задерживает выплату.", facts: "Нужны даты, трудовой договор и подтверждение начислений.", source: "JURO предложит проверить применимые нормы и официальный источник.", risk: "Важно не пропустить сроки и сохранить доказательства.", plan: "Зафиксировать задолженность → направить обращение → оценить дальнейший порядок.", document: "Черновик обращения работодателю.", path: "/ai-chat" },
        { title: "Долг по расписке", question: "Срок возврата по расписке истёк.", facts: "Нужны расписка, дата возврата, платежи и переписка.", source: "Правовое основание будет связано с конкретным выводом.", risk: "Риск утраты доказательств и затягивания взыскания.", plan: "Собрать подтверждения → рассчитать долг → подготовить требование.", document: "Проект досудебного требования.", path: "/action-plan" },
        { title: "Договор поставки", question: "Поставщик просрочил поставку товара.", facts: "Нужны договор, спецификация, срок и переписка.", source: "JURO покажет применимые условия договора и официальный источник.", risk: "Уведомление и претензия могут быть ограничены сроком.", plan: "Проверить условия → зафиксировать нарушение → направить претензию.", document: "Проект претензии поставщику.", path: "/document-review" },
        { title: "Аренда", question: "Арендодатель хочет досрочно прекратить договор.", facts: "Нужны договор, уведомление и сведения о нарушениях.", source: "Вывод будет отделён от неподтверждённых предположений.", risk: "Риск потери доступа к помещению и обеспечительного платежа.", plan: "Проверить основание → оценить срок уведомления → подготовить ответ.", document: "Проект ответа на уведомление.", path: "/document-review" },
        { title: "Сотрудник", question: "Нужно правильно оформить нового сотрудника.", facts: "Нужны роль, условия, режим и порядок оплаты.", source: "JURO предложит проверить обязательные требования по официальному источнику.", risk: "Неполные документы создают трудовые и налоговые риски.", plan: "Определить формат → собрать данные → подготовить комплект.", document: "Проект трудового документа.", path: "/document-builder" },
        { title: "NDA стартапа", question: "Команда хочет подписать соглашение о конфиденциальности.", facts: "Нужны стороны, перечень информации, срок и допустимые раскрытия.", source: "Источник и применимое право требуют отдельного подтверждения.", risk: "Слишком широкие или неисполнимые ограничения.", plan: "Определить цель → согласовать определения → проверить исключения.", document: "Проект NDA для дальнейшей проверки.", path: "/document-builder" },
      ],
    },
    versionCompare: {
      eyebrow: "СРАВНЕНИЕ ДОКУМЕНТОВ",
      title: "Не только что изменилось, но и почему это важно",
      body: "JURO сопоставляет две версии, объясняет смысл изменения и показывает, чья позиция стала рискованнее.",
      tabs: ["Кратко", "До и после", "Изменение риска", "Рекомендация"],
      before: "Уведомление направляется не позднее чем за 30 календарных дней.",
      after: "Уведомление направляется не позднее чем за 5 календарных дней.",
      summary: "Срок уведомления сокращён с 30 до 5 календарных дней.",
      change: "30 дней → 5 дней",
      consequence: "У стороны становится меньше времени для отказа от автоматического продления.",
      riskLabel: "Риск для Заказчика",
      risk: "Высокий",
      recommendation: "Рекомендация",
      recommendationBody: "Предложить срок не менее 20–30 календарных дней либо исключить автоматическое продление.",
      cta: "Сравнить свои документы",
    },
    monitoring: {
      eyebrow: "МОНИТОРИНГ ЗАКОНОДАТЕЛЬСТВА",
      title: "Изменился закон — поймите, что может быть затронуто",
      body: "JURO будет связывать проверенное обновление с областями права, делами и документами пользователя, чтобы показать возможное влияние и следующий шаг.",
      status: "Функция готовится к запуску",
      statusBody: "Автоматическая лента не публикуется, пока не подключён и не проверен стабильный источник данных.",
      cta: "Настроить мониторинг",
      sourceLabel: "Подтверждённый публичный источник",
      source: "LexUZ — Национальная база данных законодательства Республики Узбекистан",
    },
    trust: {
      eyebrow: "ДОВЕРИЕ И БЕЗОПАСНОСТЬ",
      title: "Проверяемые механизмы вместо общих обещаний",
      body: "На главной показаны только факты, которые можно подтвердить в продукте или технической конфигурации. Остальные сведения честно отмечены как требующие уточнения.",
      checked: "Информация проверена 26.07.2026",
      items: [
        { title: "Приватные рабочие объекты", body: "Дела и документы не включаются в публичные страницы или sitemap.", state: "Подтверждено" },
        { title: "Роли и доступ", body: "Доступ связан с сессией, ролью и правами конкретного участника.", state: "Подтверждено" },
        { title: "Удаление данных", body: "Процесс и сроки зависят от типа данных и обязательных сроков хранения.", state: "Описано в политике" },
        { title: "AI-провайдеры и subprocessors", body: "Список будет опубликован после окончательного утверждения production-конфигурации.", state: "Уточняется" },
      ],
      cta: "Открыть Trust Center",
    },
    pricing: {
      eyebrow: "ТАРИФЫ",
      title: "Понятный контекст до регистрации и оплаты",
      body: "JURO не показывает вымышленные скидки и лимиты. Неутверждённые коммерческие условия честно отмечены как «Скоро» или «Связаться».",
      personal: "Для себя",
      business: "Для бизнеса",
      included: "Что включено",
      note: "Стоимость живого юриста и дополнительных услуг показывается отдельно до подтверждения.",
      plans: {
        personal: [
          { title: "Бесплатный старт", forWhom: "Чтобы попробовать первый сценарий", price: "0 сум", items: ["Первичный AI-разбор", "Демо плана действий", "Переход к первому документу"], cta: "Начать бесплатно", path: "/register" },
          { title: "Индивидуальный", forWhom: "Для регулярных личных вопросов", price: "Скоро", items: ["Расширенные лимиты", "История дел и документов", "Дополнительные инструменты"], cta: "Следить за запуском", path: "/register" },
        ],
        business: [
          { title: "Бизнес", forWhom: "Для команды и договорной работы", price: "Связаться", items: ["Бизнес-пространство", "Роли и совместная работа", "Версии, сроки и документы"], cta: "Обсудить подключение", path: "/register" },
          { title: "Юридическая команда", forWhom: "Для управляемых юридических процессов", price: "Связаться", items: ["Командные роли", "Библиотека и согласование", "Индивидуальная конфигурация"], cta: "Обсудить решение", path: "/register" },
        ],
      },
    },
    health: {
      eyebrow: "LEGAL HEALTH CHECK",
      title: "Где бизнесу стоит навести юридический порядок?",
      body: "Ответьте на шесть коротких вопросов. Результат покажет области внимания и подходящие инструменты JURO.",
      yes: "Да",
      no: "Нет / не уверен",
      progress: "Вопрос",
      result: "Уровень готовности",
      levels: ["Требует внимания", "Базовый порядок", "Системный подход"],
      resultBodies: [
        "Есть несколько базовых областей, которые стоит структурировать в первую очередь.",
        "Часть процессов оформлена, но остаются зоны для проверки и стандартизации.",
        "Основные процессы выглядят структурированно; следующий шаг — поддерживать актуальность и контроль.",
      ],
      restart: "Пройти заново",
      cta: "Открыть инструменты для бизнеса",
      disclaimer: "Результат не является юридическим аудитом и основан только на ваших ответах.",
      questions: [
        "Основные отношения с клиентами и поставщиками оформлены письменными договорами?",
        "Команда использует утверждённые и актуальные шаблоны?",
        "В договорах определены сроки уведомлений, оплаты и прекращения?",
        "Обработка персональных данных описана и распределена по ответственным?",
        "Отношения с сотрудниками и подрядчиками оформлены письменно?",
        "Компания отслеживает изменения законодательства, затрагивающие её документы и процессы?",
      ],
    },
    sourceStatus: {
      eyebrow: "СТАТУС ИСТОЧНИКОВ",
      title: "Понятно, откуда берётся правовая основа",
      body: "JURO различает официальный источник, пользовательский документ и вывод AI. Недоступность источника не должна маскироваться уверенным ответом.",
      labels: { source: "Источник", status: "Статус", checked: "Проверено", languages: "Языки" },
      official: "LexUZ",
      available: "Официальная база доступна публично",
      checked: "26.07.2026",
      languages: "RU / UZ",
      unavailable: "Если источник временно недоступен, JURO должен показать это и предложить повторную проверку вместо вымышленной ссылки.",
      cta: "Открыть LexUZ",
    },
    cookie: {
      title: "Настройки cookies",
      body: "Необходимые технологии поддерживают язык и базовую работу. Необязательная аналитика включается только с вашего согласия и не получает текст юридических вопросов или документов.",
      essential: "Только необходимые",
      accept: "Разрешить аналитику",
      policy: "Подробнее",
    },
  },
  uz: {
    heroRoute: {
      label: "JURO yechimining oltin yo‘li",
      stages: [
        { short: "01", title: "Vaziyat", detail: "JURO faktlarni aniqlaydi" },
        { short: "02", title: "Manbalar", detail: "Asosni ko‘rsatadi" },
        { short: "03", title: "Reja", detail: "Keyingi qadamlarni tuzadi" },
        { short: "04", title: "Hujjat", detail: "Natijani tayyorlaydi" },
      ],
      complete: "Kontekst bosqichlar orasida saqlanadi",
      replay: "Yo‘lni takrorlash",
    },
    heroFrame: {
      label: "Natija namunasi",
      question: "Yetkazib beruvchi kechikdi. Nima qilish kerak?",
      facts: "3 ta faktni tasdiqlash kerak",
      source: "Manba xulosa yonida ko‘rsatiladi",
      risk: "Talabnoma muddati xavfi",
      action: "Reja va talabnoma tayyorlash",
    },
    finder: {
      eyebrow: "LEGAL ROUTE FINDER",
      title: "Qaysi vositadan boshlashni bilmaysizmi?",
      body: "Vazifa turini tanlang. Navigator yakuniy huquqiy xulosa bermasdan, mos JURO ssenariysi va tayyorlash kerak bo‘lgan ma’lumotlarni ko‘rsatadi.",
      prompt: "Nima qilmoqchisiz?",
      back: "Vazifani o‘zgartirish",
      resultLabel: "Tavsiya etilgan ssenariy",
      prepareLabel: "Tayyorlang",
      cta: "JUROga o‘tish",
      tasks: [
        {
          id: "situation",
          title: "Vaziyatni tahlil qilish",
          icon: "message",
          scenarios: [
            { title: "Shaxsiy savol", tool: "AI-yurist va harakatlar rejasi", prepare: ["qisqa xronologiya", "muhim sanalar", "mavjud hujjatlar"], path: "/ai-chat" },
            { title: "Biznes savoli", tool: "Biznes-tahlil va ish maydoni", prepare: ["kompaniya maqsadi", "ishtirokchilar", "shartnoma va yozishmalar"], path: "/ai-chat", accountType: "business" },
          ],
        },
        {
          id: "document",
          title: "Hujjatni tekshirish",
          icon: "file-check",
          scenarios: [
            { title: "Bitta shartnoma", tool: "Hujjat tahlili", prepare: ["oxirgi versiya", "ilovalar", "bitimdagi rolingiz"], path: "/document-review" },
            { title: "Ikki versiya", tool: "Tahrirlarni solishtirish", prepare: ["oldingi versiya", "yangi versiya", "siz uchun muhim shartlar"], path: "/document-comparison" },
          ],
        },
        {
          id: "create",
          title: "Hujjat yaratish",
          icon: "file-plus",
          scenarios: [
            { title: "Shaxsiy hujjat", tool: "Hujjat konstruktori", prepare: ["tomonlar ma’lumoti", "summa va sanalar", "kerakli shartlar"], path: "/document-builder" },
            { title: "Biznes hujjati", tool: "Biznes konstruktori", prepare: ["rekvizitlar", "bitim predmeti", "muddat va to‘lov tartibi"], path: "/document-builder", accountType: "business" },
          ],
        },
      ],
    },
    tools: {
      eyebrow: "IMKONIYATLAR",
      title: "To‘qqiz vosita — bitta yuridik jarayon",
      body: "Faktlar, fayllar, muddatlar va qarorlar ish bilan bog‘liq qoladi. Vositalar orasida o‘tishda vaziyatni qayta aytish shart emas.",
      account: "Himoyalangan akkauntda ochiladi",
      items: [
        { title: "AI-yurist", body: "Faktlarni aniqlaydi va taxminlardan ajratadi.", result: "Ishonch darajasi bilan tuzilgan tahlil.", cta: "Vaziyatni tahlil qilish", path: "/ai-chat", icon: "message" },
        { title: "Hujjat tahlili", body: "Izohlarni tegishli shartlar yonida ko‘rsatadi.", result: "Qisqa mazmun, bo‘shliqlar, xavflar va savollar.", cta: "Hujjatni tekshirish", path: "/document-review", icon: "file-check" },
        { title: "Hujjat yaratish", body: "Savollar orqali tahrirlanadigan loyiha tayyorlaydi.", result: "Muhim ma’lumotlari tekshirilgan loyiha.", cta: "Hujjat yaratish", path: "/document-builder", icon: "file-plus" },
        { title: "Versiyalarni solishtirish", body: "Eski va yangi tahrirni mazmun va xavf bo‘yicha solishtiradi.", result: "O‘zgarish, oqibat va tavsiya.", cta: "Hujjatlarni solishtirish", path: "/document-comparison", icon: "diff" },
        { title: "Harakatlar rejasi", body: "Qadam, muddat, mas’ul va hujjatlarni bog‘laydi.", result: "Tushunarli keyingi harakat.", cta: "Reja tuzish", path: "/action-plan", icon: "list" },
        { title: "Manbalarni tekshirish", body: "Huquqiy asosni xulosa yonida ochadi.", result: "Xulosa va manba o‘rtasida tekshiriladigan bog‘liqlik.", cta: "Tadqiqotni boshlash", path: "/ai-chat", icon: "scale" },
        { title: "Jonli yurist", body: "Faqat tanlangan va tasdiqlangan kontekstni oladi.", result: "Qayta tushuntirmasdan topshirish.", cta: "Savolni topshirish", path: "/consultations", icon: "users" },
        { title: "Monitoring", body: "O‘zgarish qaysi ish va hujjatlarga ta’sir qilishi mumkinligini ko‘rsatadi.", result: "Feed ishga tushgach sozlanadigan yo‘nalishlar.", cta: "Monitoringni sozlash", path: "/monitoring", icon: "bell", accountType: "business" },
        { title: "Ish maydoni", body: "Rollar, izohlar, versiyalar va tarixni birlashtiradi.", result: "Jamoa uchun boshqariladigan jarayon.", cta: "Maydon yaratish", path: "/dashboard", icon: "briefcase", accountType: "business" },
      ],
    },
    demo: {
      eyebrow: "INTERAKTIV DEMO",
      title: "JURO savolni qanday natijaga aylantirishini ko‘ring",
      body: "Demo faqat shaxssizlantirilgan misollardan foydalanadi. Ommaviy sahifa haqiqiy hujjat yoki shaxsiy ma’lumot qabul qilmaydi.",
      scenarioLabel: "Misolni tanlang",
      stages: ["Aniqlash", "Manba", "Xavf", "Reja", "Hujjat"],
      cta: "O‘z vaziyatimni tahlil qilish",
      privacy: "Haqiqiy ish faqat himoyalangan JURO akkauntida davom etadi.",
      scenarios: [
        { title: "Ish haqi kechikishi", question: "Ish beruvchi ikki oydan beri ish haqini kechiktirmoqda.", facts: "Sanalar, mehnat shartnomasi va hisob-kitob tasdig‘i kerak.", source: "JURO tegishli qoidalar va rasmiy manbani tekshirishni taklif qiladi.", risk: "Muddatni o‘tkazmaslik va dalillarni saqlash muhim.", plan: "Qarzni qayd etish → murojaat yuborish → keyingi tartibni baholash.", document: "Ish beruvchiga murojaat loyihasi.", path: "/ai-chat" },
        { title: "Tilxat bo‘yicha qarz", question: "Tilxatdagi qaytarish muddati o‘tdi.", facts: "Tilxat, qaytarish sanasi, to‘lovlar va yozishmalar kerak.", source: "Huquqiy asos aniq xulosa bilan bog‘lanadi.", risk: "Dalillarni yo‘qotish va undirishni kechiktirish xavfi.", plan: "Dalillarni yig‘ish → qarzni hisoblash → talab tayyorlash.", document: "Sudgacha talab loyihasi.", path: "/action-plan" },
        { title: "Yetkazib berish", question: "Yetkazib beruvchi tovarni kechiktirdi.", facts: "Shartnoma, spetsifikatsiya, muddat va yozishmalar kerak.", source: "JURO shartnoma sharti va rasmiy manbani ko‘rsatadi.", risk: "Bildirishnoma va talabnoma muddati cheklangan bo‘lishi mumkin.", plan: "Shartlarni tekshirish → buzilishni qayd etish → talabnoma yuborish.", document: "Yetkazib beruvchiga talabnoma loyihasi.", path: "/document-review" },
        { title: "Ijara", question: "Ijaraga beruvchi shartnomani muddatidan oldin bekor qilmoqchi.", facts: "Shartnoma, bildirishnoma va buzilishlar haqidagi ma’lumot kerak.", source: "Xulosa tasdiqlanmagan taxminlardan ajratiladi.", risk: "Joydan foydalanish va ta’minot to‘lovini yo‘qotish xavfi.", plan: "Asosni tekshirish → bildirishnoma muddatini baholash → javob tayyorlash.", document: "Bildirishnomaga javob loyihasi.", path: "/document-review" },
        { title: "Xodim", question: "Yangi xodimni to‘g‘ri rasmiylashtirish kerak.", facts: "Lavozim, shartlar, rejim va to‘lov tartibi kerak.", source: "JURO majburiy talablarni rasmiy manba bo‘yicha tekshirishni taklif qiladi.", risk: "To‘liq bo‘lmagan hujjatlar mehnat va soliq xavfini oshiradi.", plan: "Formatni aniqlash → ma’lumotlarni yig‘ish → to‘plam tayyorlash.", document: "Mehnat hujjati loyihasi.", path: "/document-builder" },
        { title: "Startap NDA", question: "Jamoa maxfiylik kelishuvini imzolamoqchi.", facts: "Tomonlar, axborot ro‘yxati, muddat va ruxsat etilgan oshkor qilish kerak.", source: "Manba va qo‘llaniladigan huquq alohida tasdiqlanadi.", risk: "Juda keng yoki bajarib bo‘lmaydigan cheklovlar.", plan: "Maqsadni aniqlash → ta’riflarni kelishish → istisnolarni tekshirish.", document: "Keyingi tekshiruv uchun NDA loyihasi.", path: "/document-builder" },
      ],
    },
    versionCompare: {
      eyebrow: "HUJJATLARNI SOLISHTIRISH",
      title: "Faqat nima o‘zgargani emas, nima uchun muhimligi ham",
      body: "JURO ikki versiyani solishtiradi, o‘zgarish mazmunini tushuntiradi va qaysi tomonning xavfi oshganini ko‘rsatadi.",
      tabs: ["Qisqacha", "Oldin va keyin", "Xavf o‘zgarishi", "Tavsiya"],
      before: "Bildirishnoma kamida 30 kalendar kun oldin yuboriladi.",
      after: "Bildirishnoma kamida 5 kalendar kun oldin yuboriladi.",
      summary: "Bildirishnoma muddati 30 kundan 5 kalendar kungacha qisqartirilgan.",
      change: "30 kun → 5 kun",
      consequence: "Tomon avtomatik uzaytirishdan voz kechish uchun kamroq vaqtga ega bo‘ladi.",
      riskLabel: "Buyurtmachi uchun xavf",
      risk: "Yuqori",
      recommendation: "Tavsiya",
      recommendationBody: "Kamida 20–30 kunlik muddatni taklif qilish yoki avtomatik uzaytirishni olib tashlash.",
      cta: "Hujjatlarimni solishtirish",
    },
    monitoring: {
      eyebrow: "QONUNCHILIK MONITORINGI",
      title: "Qonun o‘zgardi — nimaga ta’sir qilishi mumkinligini tushuning",
      body: "JURO tekshirilgan yangilanishni huquq sohasi, foydalanuvchi ishlari va hujjatlari bilan bog‘lab, ehtimoliy ta’sir va keyingi qadamni ko‘rsatadi.",
      status: "Funksiya ishga tushirishga tayyorlanmoqda",
      statusBody: "Barqaror manba ulanib tekshirilmaguncha avtomatik lenta e’lon qilinmaydi.",
      cta: "Monitoringni sozlash",
      sourceLabel: "Tasdiqlangan ommaviy manba",
      source: "LexUZ — O‘zbekiston Respublikasi qonunchilik ma’lumotlari milliy bazasi",
    },
    trust: {
      eyebrow: "ISHONCH VA XAVFSIZLIK",
      title: "Umumiy va’dalar o‘rniga tekshiriladigan mexanizmlar",
      body: "Bosh sahifada faqat mahsulot yoki texnik sozlamada tasdiqlanadigan faktlar ko‘rsatiladi. Qolgan ma’lumotlar aniqlashtirilayotgan deb belgilanadi.",
      checked: "Ma’lumot 26.07.2026 kuni tekshirildi",
      items: [
        { title: "Yopiq ish obyektlari", body: "Ishlar va hujjatlar ommaviy sahifa yoki sitemapga kiritilmaydi.", state: "Tasdiqlangan" },
        { title: "Rollar va kirish", body: "Kirish sessiya, rol va aniq ishtirokchi huquqlariga bog‘liq.", state: "Tasdiqlangan" },
        { title: "Ma’lumotlarni o‘chirish", body: "Jarayon va muddat ma’lumot turi hamda majburiy saqlash muddatiga bog‘liq.", state: "Siyosatda bayon qilingan" },
        { title: "AI-provayderlar va subprocessors", body: "Ro‘yxat production konfiguratsiyasi yakuniy tasdiqlangach e’lon qilinadi.", state: "Aniqlashtirilmoqda" },
      ],
      cta: "Trust Center ochish",
    },
    pricing: {
      eyebrow: "TARIFLAR",
      title: "Ro‘yxatdan o‘tish va to‘lovdan oldin tushunarli shartlar",
      body: "JURO soxta chegirma va limitlarni ko‘rsatmaydi. Tasdiqlanmagan tijorat shartlari «Tez orada» yoki «Bog‘lanish» deb belgilanadi.",
      personal: "O‘zim uchun",
      business: "Biznes uchun",
      included: "Nimalar kiradi",
      note: "Jonli yurist va qo‘shimcha xizmatlar narxi tasdiqlashdan oldin alohida ko‘rsatiladi.",
      plans: {
        personal: [
          { title: "Bepul boshlanish", forWhom: "Birinchi ssenariyni sinash uchun", price: "0 so‘m", items: ["Dastlabki AI-tahlil", "Harakatlar rejasi demosi", "Birinchi hujjatga o‘tish"], cta: "Bepul boshlash", path: "/register" },
          { title: "Individual", forWhom: "Muntazam shaxsiy savollar uchun", price: "Tez orada", items: ["Kengaytirilgan limitlar", "Ish va hujjatlar tarixi", "Qo‘shimcha vositalar"], cta: "Ishga tushishni kuzatish", path: "/register" },
        ],
        business: [
          { title: "Biznes", forWhom: "Jamoa va shartnoma ishlari uchun", price: "Bog‘lanish", items: ["Biznes-makon", "Rollar va hamkorlik", "Versiyalar, muddatlar va hujjatlar"], cta: "Ulanishni muhokama qilish", path: "/register" },
          { title: "Yuridik jamoa", forWhom: "Boshqariladigan yuridik jarayonlar uchun", price: "Bog‘lanish", items: ["Jamoa rollari", "Kutubxona va kelishuv", "Individual konfiguratsiya"], cta: "Yechimni muhokama qilish", path: "/register" },
        ],
      },
    },
    health: {
      eyebrow: "LEGAL HEALTH CHECK",
      title: "Biznesda qaysi yuridik jarayonlarni tartibga keltirish kerak?",
      body: "Oltita qisqa savolga javob bering. Natija e’tibor kerak bo‘lgan sohalar va mos JURO vositalarini ko‘rsatadi.",
      yes: "Ha",
      no: "Yo‘q / ishonchim komil emas",
      progress: "Savol",
      result: "Tayyorlik darajasi",
      levels: ["E’tibor talab qiladi", "Asosiy tartib", "Tizimli yondashuv"],
      resultBodies: [
        "Birinchi navbatda tuzish kerak bo‘lgan bir nechta asosiy soha mavjud.",
        "Jarayonlarning bir qismi rasmiylashtirilgan, lekin tekshirish va standartlashtirish zonalari qolgan.",
        "Asosiy jarayonlar tuzilgan; keyingi qadam — ularning dolzarbligi va nazoratini saqlash.",
      ],
      restart: "Qayta o‘tish",
      cta: "Biznes vositalarini ochish",
      disclaimer: "Natija yuridik audit emas va faqat sizning javoblaringizga asoslanadi.",
      questions: [
        "Mijoz va yetkazib beruvchilar bilan asosiy munosabatlar yozma shartnomalar bilan rasmiylashtirilganmi?",
        "Jamoa tasdiqlangan va dolzarb shablonlardan foydalanadimi?",
        "Shartnomalarda bildirishnoma, to‘lov va bekor qilish muddatlari belgilanganmi?",
        "Shaxsiy ma’lumotlarni qayta ishlash tartibi va mas’ullar belgilanganmi?",
        "Xodim va pudratchilar bilan munosabatlar yozma rasmiylashtirilganmi?",
        "Kompaniya hujjat va jarayonlarga ta’sir qiladigan qonunchilik o‘zgarishlarini kuzatadimi?",
      ],
    },
    sourceStatus: {
      eyebrow: "MANBALAR HOLATI",
      title: "Huquqiy asos qayerdan olingani tushunarli",
      body: "JURO rasmiy manba, foydalanuvchi hujjati va AI xulosasini ajratadi. Manba ishlamasa, bu ishonchli javob ortiga yashirilmasligi kerak.",
      labels: { source: "Manba", status: "Holat", checked: "Tekshirilgan", languages: "Tillar" },
      official: "LexUZ",
      available: "Rasmiy baza ommaga ochiq",
      checked: "26.07.2026",
      languages: "RU / UZ",
      unavailable: "Manba vaqtincha ishlamasa, JURO soxta havola o‘rniga buni ko‘rsatishi va qayta tekshirishni taklif qilishi kerak.",
      cta: "LexUZni ochish",
    },
    cookie: {
      title: "Cookies sozlamalari",
      body: "Zarur texnologiyalar til va asosiy ishni ta’minlaydi. Ixtiyoriy analitika faqat roziligingiz bilan yoqiladi va yuridik savol yoki hujjat matnini olmaydi.",
      essential: "Faqat zarur",
      accept: "Analitikaga ruxsat",
      policy: "Batafsil",
    },
  },
};
