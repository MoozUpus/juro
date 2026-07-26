export type AppLegalSlug = "terms" | "privacy" | "cookies" | "ai-rules" | "personal-data";

type LegalDocument = {
  title: string;
  description: string;
  updated: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
};

const sharedRu = {
  operator: "Оператор платформы: {OPERATOR_LEGAL_NAME}, контакты: {OPERATOR_EMAIL}, адрес: {OPERATOR_ADDRESS}. Эти реквизиты должны быть заполнены владельцем проекта до юридического утверждения редакции.",
  disclaimer: "JURO не является государственным органом, нотариусом или судом. AI-инструменты не заменяют помощь специалиста там, где она обязательна или разумно необходима.",
};
const sharedUz = {
  operator: "Platforma operatori: {OPERATOR_LEGAL_NAME}, aloqa: {OPERATOR_EMAIL}, manzil: {OPERATOR_ADDRESS}. Ushbu rekvizitlar huquqiy tahrir tasdiqlanishidan oldin loyiha egasi tomonidan to‘ldirilishi kerak.",
  disclaimer: "JURO davlat organi, notarius yoki sud emas. AI vositalari majburiy yoki oqilona zarur bo‘lgan mutaxassis yordamini almashtirmaydi.",
};

export const appLegalContent: Record<"ru" | "uz", Record<AppLegalSlug, LegalDocument>> = {
  ru: {
    terms: {
      title: "Условия использования личного кабинета JURO",
      description: "Правила регистрации, работы с AI, документами, командой и специалистами внутри app.juro.uz.",
      updated: "26 июля 2026",
      sections: [
        { heading: "1. Область действия", paragraphs: ["Эти условия относятся к закрытому личному кабинету app.juro.uz и дополняют информационные условия публичного сайта. Используя кабинет, пользователь подтверждает дееспособность и право передавать загружаемые материалы.", sharedRu.operator] },
        { heading: "2. Возможности и ограничения", paragraphs: ["JURO помогает структурировать ситуацию, хранить дела, создавать и проверять документы, вести планы и передавать выбранный контекст специалисту. Доступность отдельных функций зависит от тарифа, технических интеграций и применимых ограничений.", sharedRu.disclaimer] },
        { heading: "3. Аккаунт и команда", paragraphs: ["Пользователь отвечает за доступ к своему email и действия в активной сессии. Владелец рабочего пространства управляет ролями участников; серверные проверки ограничивают доступ к данным пространства.", "Запрещается загружать данные или документы без законного основания, вмешиваться в работу сервиса, обходить ограничения и пытаться получить доступ к чужим материалам."] },
        { heading: "4. Платные услуги и прекращение", paragraphs: ["Цена, период, лимиты, дополнительные услуги и условия отмены показываются до подтверждения платежа. Платёж не считается выполненным без подтверждения платёжного провайдера.", "Пользователь может прекратить использование сервиса и запросить удаление аккаунта в настройках приватности. Архивирование документа не является удалением аккаунта или данных."] },
      ],
    },
    privacy: {
      title: "Политика конфиденциальности приложения JURO",
      description: "Как закрытый кабинет обрабатывает аккаунт, документы, юридические ситуации и служебные журналы.",
      updated: "26 июля 2026",
      sections: [
        { heading: "1. Какие данные обрабатываются", paragraphs: ["JURO обрабатывает данные регистрации, настройки рабочего пространства, введённые пользователем факты, документы, комментарии, планы, согласия, технические журналы и историю действий. Состав данных зависит от используемой функции.", sharedRu.operator] },
        { heading: "2. Цели и доступ", paragraphs: ["Данные используются для предоставления функций кабинета, обеспечения безопасности, исполнения запросов, поддержки, расчёта лимитов и выполнения юридических обязанностей. Участники команды и специалисты видят только тот объём, который разрешён ролью, настройками и отдельным согласием.", "Содержание юридических вопросов и документов не должно передаваться в продуктовую аналитику."] },
        { heading: "3. Провайдеры и передача", paragraphs: ["Для email, AI, хранения файлов, мониторинга и платежей могут использоваться внешние обработчики. До включения конкретного провайдера оператор должен определить договорные основания, территорию обработки, сроки хранения и меры защиты.", "При трансграничной передаче оператор обязан применять предусмотренное применимым правом основание и уведомление."] },
        { heading: "4. Права пользователя", paragraphs: ["В настройках можно получить переносимый экспорт метаданных, посмотреть историю согласий и направить запрос на удаление. Отдельные сведения могут сохраняться в течение обязательного срока или для защиты законных требований.", "Для обращения или жалобы используйте {OPERATOR_EMAIL}."] },
      ],
    },
    cookies: {
      title: "Правила cookies приложения JURO",
      description: "Необходимые cookies сессии, языка и пользовательских настроек.",
      updated: "26 июля 2026",
      sections: [
        { heading: "Необходимые cookies", paragraphs: ["Приложение использует защищённую cookie сессии для входа, cookie языка и технические значения, необходимые для безопасности и сохранения настроек. Без них закрытый кабинет может работать некорректно."] },
        { heading: "Аналитика", paragraphs: ["Необязательная аналитика должна включаться только в соответствии с применимыми требованиями и настройками согласия. В события нельзя помещать текст вопроса, содержимое документа, OTP, паспортные или платёжные реквизиты."] },
        { heading: "Управление", paragraphs: ["Пользователь может ограничить cookies через браузер и управлять необязательными категориями в настройках приватности после подключения consent-платформы. Удаление необходимой cookie завершает сессию."] },
      ],
    },
    "ai-rules": {
      title: "Правила использования AI в JURO",
      description: "Границы AI-разбора, источники, проверка и передача специалисту.",
      updated: "26 июля 2026",
      sections: [
        { heading: "1. Роль AI", paragraphs: ["AI помогает собрать факты, выявить неопределённости, подготовить черновик плана или документа. Ответ может быть неполным или ошибочным и не является гарантией результата.", sharedRu.disclaimer] },
        { heading: "2. Источники", paragraphs: ["Правовые объяснения должны ссылаться только на источники из контролируемого серверного реестра с датой проверки. Если подходящий источник не найден, JURO сообщает об этом и не придумывает статью, номер акта или ссылку."] },
        { heading: "3. Данные и проверка", paragraphs: ["Не вводите лишние персональные данные. Перед отправкой материалов внешнему AI-провайдеру оператор должен включить его в политику конфиденциальности и применить минимизацию данных.", "Перед важным решением пользователь должен проверить факты, даты, реквизиты и при необходимости обратиться к квалифицированному специалисту."] },
        { heading: "4. Живой специалист", paragraphs: ["Передача специалисту выполняется отдельно. Пользователь видит, какие материалы передаются, и подтверждает согласие; доступ не распространяется на всё пространство автоматически."] },
      ],
    },
    "personal-data": {
      title: "Уведомление об обработке персональных данных",
      description: "Состав, цели и управление обработкой данных внутри JURO.",
      updated: "26 июля 2026",
      sections: [
        { heading: "Обработка", paragraphs: ["JURO обрабатывает данные, необходимые для аккаунта, рабочего пространства и выбранных функций. Чувствительные сведения следует вводить только когда это действительно необходимо для юридического сценария.", sharedRu.operator] },
        { heading: "Согласия", paragraphs: ["Согласие на общие правила, анализ документа, передачу специалисту и запись консультации фиксируются отдельно, когда соответствующая операция требует согласия. Согласие можно отозвать на будущее, если иное не следует из закона или уже исполненной операции."] },
        { heading: "Хранение и удаление", paragraphs: ["Сроки хранения должны быть утверждены оператором для каждой категории данных. Запрос на удаление доступен в настройках; архивирование объекта не считается удалением."] },
      ],
    },
  },
  uz: {
    terms: {
      title: "JURO shaxsiy kabinetidan foydalanish shartlari",
      description: "app.juro.uz ichida ro‘yxatdan o‘tish, AI, hujjatlar, jamoa va mutaxassislar bilan ishlash qoidalari.",
      updated: "2026-yil 26-iyul",
      sections: [
        { heading: "1. Qo‘llanish sohasi", paragraphs: ["Ushbu shartlar app.juro.uz yopiq kabinetiga tegishli va ommaviy sayt axborot shartlarini to‘ldiradi. Kabinetdan foydalangan shaxs yuklanadigan materiallarni berish huquqiga ega ekanini tasdiqlaydi.", sharedUz.operator] },
        { heading: "2. Imkoniyatlar va cheklovlar", paragraphs: ["JURO vaziyatni tuzishga, ishlarni saqlashga, hujjat yaratish va tekshirishga, reja yuritishga hamda tanlangan kontekstni mutaxassisga berishga yordam beradi. Ayrim funksiyalar tarif va texnik integratsiyalarga bog‘liq.", sharedUz.disclaimer] },
        { heading: "3. Hisob va jamoa", paragraphs: ["Foydalanuvchi o‘z emailiga kirish va faol sessiyadagi harakatlar uchun javob beradi. Makon egasi rollarni boshqaradi; server tekshiruvlari ma’lumotlarga kirishni cheklaydi.", "Qonuniy asossiz ma’lumot yuklash, xizmatga xalaqit berish va begona materiallarga kirishga urinish taqiqlanadi."] },
        { heading: "4. To‘lov va foydalanishni tugatish", paragraphs: ["Narx, davr, limitlar va bekor qilish shartlari to‘lovni tasdiqlashdan oldin ko‘rsatiladi. Provayder tasdig‘isiz to‘lov bajarilgan hisoblanmaydi.", "Hisobni o‘chirish so‘rovi maxfiylik sozlamalarida beriladi. Hujjatni arxivlash hisobni o‘chirish emas."] },
      ],
    },
    privacy: {
      title: "JURO ilovasi maxfiylik siyosati",
      description: "Yopiq kabinet hisob, hujjat, yuridik vaziyat va xizmat jurnallarini qanday qayta ishlaydi.",
      updated: "2026-yil 26-iyul",
      sections: [
        { heading: "1. Qayta ishlanadigan ma’lumotlar", paragraphs: ["JURO ro‘yxatdan o‘tish ma’lumotlari, makon sozlamalari, faktlar, hujjatlar, izohlar, rejalar, roziliklar va harakatlar tarixini qayta ishlaydi.", sharedUz.operator] },
        { heading: "2. Maqsad va kirish", paragraphs: ["Ma’lumotlar kabinet funksiyalari, xavfsizlik, qo‘llab-quvvatlash va majburiyatlarni bajarish uchun ishlatiladi. Jamoa a’zolari va mutaxassislar faqat rol va alohida rozilik doirasidagi ma’lumotni ko‘radi.", "Yuridik savol va hujjat mazmuni mahsulot analitikasiga yuborilmasligi kerak."] },
        { heading: "3. Provayderlar va uzatish", paragraphs: ["Email, AI, fayl saqlash, monitoring va to‘lov uchun tashqi qayta ishlovchilar ishlatilishi mumkin. Har bir provayder uchun asos, hudud, muddat va himoya choralari belgilanadi.", "Transchegaraviy uzatishda amaldagi huquq talablari bajarilishi kerak."] },
        { heading: "4. Foydalanuvchi huquqlari", paragraphs: ["Sozlamalarda metadata eksporti, roziliklar tarixi va o‘chirish so‘rovi mavjud. Ayrim ma’lumotlar majburiy muddat davomida saqlanishi mumkin.", "Murojaat yoki shikoyat uchun {OPERATOR_EMAIL} manzilidan foydalaning."] },
      ],
    },
    cookies: {
      title: "JURO ilovasi cookie qoidalari",
      description: "Sessiya, til va foydalanuvchi sozlamalari uchun zarur cookie fayllari.",
      updated: "2026-yil 26-iyul",
      sections: [
        { heading: "Zarur cookies", paragraphs: ["Ilova kirish uchun himoyalangan sessiya cookie-si, til cookie-si va xavfsizlik hamda sozlamalar uchun zarur texnik qiymatlardan foydalanadi."] },
        { heading: "Analitika", paragraphs: ["Ixtiyoriy analitika faqat tegishli talab va rozilikka muvofiq yoqiladi. Savol matni, hujjat mazmuni, OTP, pasport va to‘lov rekvizitlari analitikaga yuborilmaydi."] },
        { heading: "Boshqarish", paragraphs: ["Foydalanuvchi brauzer orqali cookie-larni cheklashi va consent platformasi ulangach ixtiyoriy toifalarni boshqarishi mumkin. Zarur cookie-ni o‘chirish sessiyani tugatadi."] },
      ],
    },
    "ai-rules": {
      title: "JUROda AIdan foydalanish qoidalari",
      description: "AI tahlili, manbalar, tekshirish va mutaxassisga topshirish chegaralari.",
      updated: "2026-yil 26-iyul",
      sections: [
        { heading: "1. AI roli", paragraphs: ["AI faktlarni yig‘ish, noaniqliklarni aniqlash va reja yoki hujjat loyihasini tayyorlashga yordam beradi. Javob xato bo‘lishi mumkin va natijani kafolatlamaydi.", sharedUz.disclaimer] },
        { heading: "2. Manbalar", paragraphs: ["Huquqiy tushuntirishlar faqat tekshirish sanasi bo‘lgan server reestridagi manbalarga tayanadi. Manba topilmasa, JURO modda yoki havolani o‘ylab topmaydi."] },
        { heading: "3. Ma’lumot va tekshirish", paragraphs: ["Ortiqcha shaxsiy ma’lumotlarni kiritmang. Tashqi AI-provayderga uzatishdan oldin u maxfiylik siyosatida ko‘rsatilishi va ma’lumot minimallashtirilishi kerak.", "Muhim qaror oldidan fakt, sana va rekvizitlarni tekshirib, kerak bo‘lsa mutaxassisga murojaat qiling."] },
        { heading: "4. Jonli mutaxassis", paragraphs: ["Mutaxassisga topshirish alohida amalga oshiriladi. Foydalanuvchi beriladigan materiallarni ko‘radi va rozilik beradi; butun makonga avtomatik kirish berilmaydi."] },
      ],
    },
    "personal-data": {
      title: "Shaxsiy ma’lumotlarni qayta ishlash xabarnomasi",
      description: "JURO ichida ma’lumotlar tarkibi, maqsadi va boshqaruvi.",
      updated: "2026-yil 26-iyul",
      sections: [
        { heading: "Qayta ishlash", paragraphs: ["JURO hisob, makon va tanlangan funksiyalar uchun zarur ma’lumotlarni qayta ishlaydi. Nozik ma’lumotlar faqat yuridik ssenariy uchun zarur bo‘lsa kiritilishi kerak.", sharedUz.operator] },
        { heading: "Roziliklar", paragraphs: ["Umumiy qoidalar, hujjat tahlili, mutaxassisga uzatish va konsultatsiya yozuvi uchun roziliklar zarur holatlarda alohida qayd etiladi."] },
        { heading: "Saqlash va o‘chirish", paragraphs: ["Har bir toifa uchun saqlash muddati operator tomonidan tasdiqlanishi kerak. O‘chirish so‘rovi sozlamalarda mavjud; arxivlash o‘chirish emas."] },
      ],
    },
  },
};
