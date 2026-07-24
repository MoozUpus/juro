"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight, Bot, BriefcaseBusiness, Building2, Check, ChevronDown,
  CircleCheckBig, FileCheck2, FilePenLine, Fingerprint, Handshake,
  Languages, LockKeyhole, Menu, MessageSquareText, Rocket, Scale,
  ShieldCheck, Sparkles, UserRound, UsersRound, X,
} from "lucide-react";
import styles from "./LandingTestPage.module.css";

type Language = "ru" | "uz";
type LocalText = { ru: string; uz: string };

const text = (ru: string, uz: string): LocalText => ({ ru, uz });
const appUrl = (path: string, language: Language, accountType?: "individual" | "business") =>
  `https://app.juro.uz${path}?lang=${language}${accountType ? `&accountType=${accountType}` : ""}`;

const navigation = [
  ["capabilities", text("Возможности", "Imkoniyatlar")],
  ["audiences", text("Для кого", "Kim uchun")],
  ["how", text("Как это работает", "Qanday ishlaydi")],
  ["business", text("Для бизнеса", "Biznes uchun")],
  ["security", text("Безопасность", "Xavfsizlik")],
  ["pricing", text("Тарифы", "Tariflar")],
  ["knowledge", text("База знаний", "Bilimlar bazasi")],
  ["about", text("О JURO", "JURO haqida")],
] as const;

const audiences = [
  { icon: UserRound, title: text("Физические лица", "Jismoniy shaxslar"), body: text("Семейные, трудовые, долговые, жилищные и потребительские вопросы.", "Oila, mehnat, qarz, uy-joy va iste’molchi masalalari."), tasks: text("AI-юрист · заявления · претензии · план действий", "AI-yurist · arizalar · talabnomalar · harakat rejasi"), type: "individual" as const },
  { icon: Rocket, title: text("Стартапы", "Startaplar"), body: text("Документы для команды, инвестиций, NDA и интеллектуальной собственности.", "Jamoa, investitsiya, NDA va intellektual mulk hujjatlari."), tasks: text("Договоры · проверка рисков · консультации", "Shartnomalar · xavflarni tekshirish · maslahatlar"), type: "business" as const },
  { icon: BriefcaseBusiness, title: text("Малый бизнес", "Kichik biznes"), body: text("Договоры, претензии, кадровые документы и работа с задолженностью.", "Shartnomalar, talabnomalar, kadr hujjatlari va qarzdorlik bilan ishlash."), tasks: text("Шаблоны · анализ · контроль сроков", "Shablonlar · tahlil · muddatlar nazorati"), type: "business" as const },
  { icon: Building2, title: text("Средний и крупный бизнес", "O‘rta va yirik biznes"), body: text("Согласование документов, внутренние процессы и управление юридическими рисками.", "Hujjatlarni kelishish, ichki jarayonlar va huquqiy xavflarni boshqarish."), tasks: text("Совместная работа · роли · история изменений", "Hamkorlik · rollar · o‘zgarishlar tarixi"), type: "business" as const },
  { icon: Scale, title: text("Юристы и юридические отделы", "Yuristlar va yuridik bo‘limlar"), body: text("Исследования, анализ, шаблоны и автоматизация повторяющейся работы.", "Tadqiqot, tahlil, shablonlar va takroriy ishlarni avtomatlashtirish."), tasks: text("AI-помощь · редактор · проверка · согласование", "AI-yordam · muharrir · tekshiruv · kelishuv"), type: "business" as const },
];

const capabilities = [
  { icon: Bot, title: text("AI-юрист", "AI-yurist"), body: text("Разбирает ситуацию, задаёт уточняющие вопросы и объясняет возможные следующие шаги.", "Vaziyatni tahlil qiladi, aniqlashtiruvchi savollar beradi va keyingi qadamlarni tushuntiradi."), href: "/ai-chat" },
  { icon: FileCheck2, title: text("Проверка документов", "Hujjatlarni tekshirish"), body: text("Выделяет спорные условия, пропуски и риски, сохраняя исходный документ под вашим контролем.", "Bahsli shartlar, bo‘shliqlar va xavflarni ko‘rsatadi, hujjat nazorati sizda qoladi."), href: "/document-review" },
  { icon: FilePenLine, title: text("Создание документов", "Hujjat yaratish"), body: text("Пошаговая анкета формирует редактируемый проект и показывает результат до скачивания.", "Bosqichma-bosqich anketa tahrirlanadigan loyihani yaratadi va yuklashdan oldin natijani ko‘rsatadi."), href: "/document-builder" },
  { icon: CircleCheckBig, title: text("План действий", "Harakatlar rejasi"), body: text("Связывает сроки, документы, доказательства и консультации в одном рабочем сценарии.", "Muddatlar, hujjatlar, dalillar va maslahatlarni bitta ish jarayonida bog‘laydi."), href: "/action-plan" },
  { icon: Handshake, title: text("Передача живому юристу", "Jonli yuristga topshirish"), body: text("С вашего согласия специалист получает подготовленный контекст, а не просит начинать заново.", "Roziligingiz bilan mutaxassis tayyorlangan kontekstni oladi, hammasini boshidan so‘ramaydi."), href: "/consultations" },
  { icon: UsersRound, title: text("Совместная работа", "Hamkorlikda ishlash"), body: text("Приглашайте стороны, обсуждайте пункты и согласовывайте изменения с разграничением прав.", "Tomonlarni taklif qiling, bandlarni muhokama qiling va huquqlar asosida o‘zgarishlarni kelishing."), href: "/documents" },
];

const faqs = [
  text("Чем JURO отличается от обычного AI-чата?", "JURO oddiy AI-chatdan nimasi bilan farq qiladi?"),
  text("Может ли AI заменить консультацию юриста?", "AI yurist maslahatini almashtira oladimi?"),
  text("Кто видит мои документы и персональные данные?", "Hujjatlarim va shaxsiy ma’lumotlarimni kim ko‘radi?"),
  text("Можно ли изменить созданный документ?", "Yaratilgan hujjatni o‘zgartirish mumkinmi?"),
  text("Как перейти от AI к живому специалисту?", "AIdan jonli mutaxassisga qanday o‘tish mumkin?"),
];

export function LandingTestPage() {
  const [language, setLanguage] = useState<Language>("ru");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const tr = (value: LocalText) => value[language];

  useEffect(() => {
    const stored = window.localStorage.getItem("juro-public-language");
    const languageTimer = stored === "ru" || stored === "uz"
      ? window.setTimeout(() => setLanguage(stored), 0)
      : undefined;
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (languageTimer !== undefined) window.clearTimeout(languageTimer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem("juro-public-language", language);
  }, [language]);

  const register = appUrl("/register", language);
  const login = appUrl("/login", language);

  return <main className={styles.page}>
    <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}>
      <div className={styles.headerInner}>
        <Link className={styles.logo} href="/" aria-label="JURO — главная"><img src="/juro-logo-primary.png" alt="JURO" /></Link>
        <nav className={styles.desktopNav} aria-label={language === "ru" ? "Основная навигация" : "Asosiy navigatsiya"}>
          {navigation.map(([id, label]) => <a key={id} href={`#${id}`}>{tr(label)}</a>)}
        </nav>
        <div className={styles.headerActions}>
          <div className={styles.language} role="group" aria-label="RU / UZ"><button className={language === "ru" ? styles.active : ""} onClick={() => setLanguage("ru")}>RU</button><button className={language === "uz" ? styles.active : ""} onClick={() => setLanguage("uz")}>UZ</button></div>
          <a className={styles.login} href={login}>{language === "ru" ? "Войти" : "Kirish"}</a>
          <a className={styles.headerCta} href={register}>{language === "ru" ? "Начать" : "Boshlash"}<ArrowRight size={17}/></a>
          <button className={styles.menuButton} onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}>{menuOpen ? <X/> : <Menu/>}</button>
        </div>
      </div>
      <div id="mobile-menu" className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ""}`}>
        {navigation.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{tr(label)}</a>)}
        <a href={login}>{language === "ru" ? "Войти" : "Kirish"}</a><a className={styles.headerCta} href={register}>{language === "ru" ? "Начать работу" : "Ishni boshlash"}</a>
      </div>
    </header>

    <section className={styles.hero} id="about">
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}><Sparkles size={16}/>{language === "ru" ? "Юридическая работа — в одном защищённом пространстве" : "Yuridik ishlar — bitta himoyalangan makonda"}</span>
        <h1>{language === "ru" ? <>Разберитесь в ситуации.<br/><em>Подготовьте решение.</em></> : <>Vaziyatni tushuning.<br/><em>Yechimni tayyorlang.</em></>}</h1>
        <p>{language === "ru" ? "JURO помогает физическим лицам и бизнесу получить понятный разбор, подготовить документы, контролировать сроки и при необходимости передать контекст живому юристу." : "JURO jismoniy shaxslar va biznesga tushunarli tahlil olish, hujjat tayyorlash, muddatlarni nazorat qilish va zarur bo‘lsa kontekstni jonli yuristga topshirishga yordam beradi."}</p>
        <div className={styles.heroActions}><a className={styles.primary} href={register}>{language === "ru" ? "Решить юридический вопрос" : "Yuridik masalani hal qilish"}<ArrowRight size={18}/></a><a className={styles.secondary} href="#how">{language === "ru" ? "Посмотреть процесс" : "Jarayonni ko‘rish"}</a></div>
        <div className={styles.trustLine}><span><ShieldCheck/> {language === "ru" ? "Права проверяются на сервере" : "Huquqlar serverda tekshiriladi"}</span><span><Languages/> RU / UZ</span><span><UserRound/> AI + {language === "ru" ? "живой юрист" : "jonli yurist"}</span></div>
      </div>
      <div className={styles.heroVisual}>
        <div className={styles.heroCard}><span className={styles.heroCardIcon}><Bot/></span><small>JURO AI</small><strong>{language === "ru" ? "Что произошло?" : "Nima bo‘ldi?"}</strong><p>{language === "ru" ? "Опишите ситуацию своими словами. Я помогу отделить факты от предположений и собрать следующие шаги." : "Vaziyatni o‘z so‘zlaringiz bilan yozing. Faktlarni taxminlardan ajratib, keyingi qadamlarni yig‘ishga yordam beraman."}</p><div><i></i><span>{language === "ru" ? "Контекст сохраняется только в вашем рабочем пространстве" : "Kontekst faqat ish makoningizda saqlanadi"}</span></div></div>
        <div className={styles.jurobek}><img src="/jurobek-avatar.webp" alt={language === "ru" ? "Jurobek — AI-помощник JURO" : "Jurobek — JURO AI-yordamchisi"}/></div>
      </div>
    </section>

    <section className={styles.section} id="audiences"><SectionHead eyebrow={text("Для кого", "Kim uchun")} title={text("Юридические инструменты под вашу роль", "Roluingizga mos yuridik vositalar")} body={text("Выберите пространство: личные вопросы или рабочие процессы компании. Общая платформа сохраняет единый уровень безопасности и качества.", "Shaxsiy masalalar yoki kompaniya jarayonlari uchun makonni tanlang. Yagona platforma bir xil xavfsizlik va sifat darajasini saqlaydi.")} language={language}/><div className={styles.audienceGrid}>{audiences.map(({ icon: Icon, ...item }) => <a className={styles.audienceCard} href={appUrl("/register", language, item.type)} key={item.title.ru}><Icon/><h3>{tr(item.title)}</h3><p>{tr(item.body)}</p><small>{tr(item.tasks)}</small><span>{language === "ru" ? "Выбрать сценарий" : "Ssenariyni tanlash"}<ArrowRight/></span></a>)}</div></section>

    <section className={`${styles.section} ${styles.capabilitySection}`} id="capabilities"><SectionHead eyebrow={text("Возможности", "Imkoniyatlar")} title={text("От вопроса до готового действия", "Savoldan tayyor harakatgacha")} body={text("Инструменты связаны между собой: факты из дела используются в плане, документах и консультации без повторного ввода.", "Ishdagi faktlar reja, hujjatlar va maslahatlarda qayta kiritilmasdan ishlatiladi.")} language={language}/><div className={styles.capabilityGrid}>{capabilities.map(({ icon: Icon, ...item }) => <a href={appUrl(item.href, language)} key={item.title.ru}><Icon/><h3>{tr(item.title)}</h3><p>{tr(item.body)}</p><span>{language === "ru" ? "Открыть инструмент" : "Vosita ochish"}<ArrowRight/></span></a>)}</div></section>

    <section className={styles.difference} id="business"><div><span className={styles.eyebrow}>JURO ≠ CHATBOT</span><h2>{language === "ru" ? "Не просто ответ. Управляемый юридический процесс." : "Shunchaki javob emas. Boshqariladigan yuridik jarayon."}</h2><p>{language === "ru" ? "Обычный чат заканчивается сообщением. JURO связывает ответ с делом, документом, сроком и ответственным участником." : "Oddiy chat xabar bilan tugaydi. JURO javobni ish, hujjat, muddat va mas’ul ishtirokchi bilan bog‘laydi."}</p></div><div className={styles.comparison}><article><small>{language === "ru" ? "Обычный AI-чат" : "Oddiy AI-chat"}</small>{[text("Изолированный ответ", "Alohida javob"),text("Нет рабочего статуса", "Ish holati yo‘q"),text("Контекст приходится повторять", "Kontekstni takrorlash kerak")].map(x=><span key={x.ru}><X/>{tr(x)}</span>)}</article><article className={styles.comparisonActive}><small>JURO</small>{[text("Дело и хронология", "Ish va xronologiya"),text("Документы и сроки", "Hujjatlar va muddatlar"),text("Передача юристу с контекстом", "Kontekst bilan yuristga topshirish")].map(x=><span key={x.ru}><Check/>{tr(x)}</span>)}</article></div></section>

    <section className={styles.section} id="how"><SectionHead eyebrow={text("Как это работает", "Qanday ishlaydi")} title={text("Понятный путь без потери контекста", "Kontekstni yo‘qotmasdan tushunarli yo‘l")} body={text("Каждый следующий шаг использует уже подтверждённые вами данные.", "Har bir keyingi qadam siz tasdiqlagan ma’lumotlardan foydalanadi.")} language={language}/><ol className={styles.steps}>{[text("Опишите ситуацию", "Vaziyatni yozing"),text("Подтвердите факты", "Faktlarni tasdiqlang"),text("Получите оценку рисков", "Xavflar bahosini oling"),text("Сформируйте план", "Reja tuzing"),text("Подготовьте документ", "Hujjat tayyorlang")].map((item,index)=><li key={item.ru}><b>{String(index+1).padStart(2,"0")}</b><span>{tr(item)}</span></li>)}</ol></section>

    <section className={styles.planSection}><div className={styles.sectionNumber}>07</div><div><span className={styles.eyebrow}>{language === "ru" ? "ПЛАН И СРОКИ" : "REJA VA MUDDATLAR"}</span><h2>{language === "ru" ? "Следующий шаг всегда виден" : "Keyingi qadam doimo ko‘rinadi"}</h2><p>{language === "ru" ? "План показывает, что уже сделано, что нужно подготовить и какие сроки требуют внимания. Прогресс рассчитывается по фактически завершённым действиям." : "Reja bajarilgan ishlar, tayyorlanadigan narsalar va e’tibor talab qiladigan muddatlarni ko‘rsatadi. Jarayon haqiqiy yakunlangan harakatlar bo‘yicha hisoblanadi."}</p><a href={appUrl("/action-plan",language)}>{language === "ru" ? "Создать план действий" : "Harakatlar rejasini yaratish"}<ArrowRight/></a></div><div className={styles.planCard}><span><b>{language === "ru" ? "Подготовить письменное требование" : "Yozma talab tayyorlash"}</b><small>{language === "ru" ? "Следующее действие" : "Keyingi harakat"}</small></span><div><i style={{width:"40%"}}></i></div><strong>2 / 5</strong><p>{language === "ru" ? "Пример интерфейса. Сроки определяются из данных конкретного дела." : "Interfeys namunasi. Muddatlar aniq ish ma’lumotlaridan belgilanadi."}</p></div></section>

    <section className={styles.handoffSection}><div className={styles.sectionNumber}>08</div><div><span className={styles.eyebrow}>{language === "ru" ? "ПЕРЕДАЧА ЮРИСТУ" : "YURISTGA TOPSHIRISH"}</span><h2>{language === "ru" ? "Когда нужен человек — он получает подготовленный контекст" : "Inson kerak bo‘lganda, u tayyor kontekstni oladi"}</h2><p>{language === "ru" ? "Вы сами выбираете, какие материалы передать. Юрист видит подтверждённые факты, документы, открытые вопросы и сроки — только в пределах выданного доступа." : "Qaysi materiallarni topshirishni o‘zingiz tanlaysiz. Yurist faqat berilgan ruxsat doirasida tasdiqlangan faktlar, hujjatlar, ochiq savollar va muddatlarni ko‘radi."}</p><a href={appUrl("/consultations",language)}>{language === "ru" ? "Выбрать консультацию" : "Maslahatni tanlash"}<ArrowRight/></a></div><div className={styles.contextList}>{[text("Краткое резюме ситуации", "Vaziyatning qisqa mazmuni"),text("Документы и доказательства", "Hujjatlar va dalillar"),text("План и ближайшие сроки", "Reja va yaqin muddatlar"),text("Вопросы для специалиста", "Mutaxassis uchun savollar")].map(item=><span key={item.ru}><Check/>{tr(item)}</span>)}</div></section>

    <section className={`${styles.section} ${styles.security}`} id="security"><div><span className={styles.eyebrow}>{language === "ru" ? "БЕЗОПАСНОСТЬ" : "XAVFSIZLIK"}</span><h2>{language === "ru" ? "Конфиденциальность встроена в продукт" : "Maxfiylik mahsulotning o‘ziga singdirilgan"}</h2><p>{language === "ru" ? "JURO отделяет публичные материалы от личного рабочего пространства и проверяет доступ к документам на сервере." : "JURO ommaviy materiallarni shaxsiy ish makonidan ajratadi va hujjatlarga kirishni serverda tekshiradi."}</p></div><div>{[{icon:LockKeyhole,label:text("Закрытое рабочее пространство", "Yopiq ish makoni")},{icon:Fingerprint,label:text("Разграничение ролей и прав", "Rollar va huquqlarni ajratish")},{icon:ShieldCheck,label:text("Приватные файлы без публичных URL", "Ommaviy URLlarsiz maxfiy fayllar")},{icon:MessageSquareText,label:text("Прозрачная история действий", "Shaffof harakatlar tarixi")}].map(({icon:Icon,label})=><span key={label.ru}><Icon/>{tr(label)}</span>)}</div></section>

    <section className={styles.section} id="pricing"><SectionHead eyebrow={text("Тарифы", "Tariflar")} title={text("Начните с подходящего пространства", "Mos makondan boshlang")} body={text("Актуальные условия, доступные функции и стоимость показываются перед подтверждением тарифа в личном кабинете.", "Amaldagi shartlar, mavjud imkoniyatlar va narx tarifni tasdiqlashdan oldin shaxsiy kabinetda ko‘rsatiladi.")} language={language}/><div className={styles.pricingGrid}>{[{title:text("Личное пространство", "Shaxsiy makon"),type:"individual" as const,items:[text("Личные дела и документы", "Shaxsiy ishlar va hujjatlar"),text("AI-помощь и планы", "AI-yordam va rejalar"),text("Передача юристу", "Yuristga topshirish")]},{title:text("Бизнес-пространство", "Biznes makoni"),type:"business" as const,items:[text("Командная работа", "Jamoaviy ish"),text("Корпоративные документы", "Korporativ hujjatlar"),text("Роли и согласование", "Rollar va kelishuv")]},{title:text("Юридическая команда", "Yuridik jamoa"),type:"business" as const,items:[text("Шаблоны и редактор", "Shablonlar va muharrir"),text("Комментарии и предложения", "Izohlar va takliflar"),text("История изменений", "O‘zgarishlar tarixi")]}].map(plan=><article key={plan.title.ru}><h3>{tr(plan.title)}</h3><ul>{plan.items.map(item=><li key={item.ru}><Check/>{tr(item)}</li>)}</ul><a href={appUrl("/register",language,plan.type)}>{language === "ru" ? "Посмотреть условия" : "Shartlarni ko‘rish"}<ArrowRight/></a></article>)}</div></section>

    <section className={styles.knowledge} id="knowledge"><div><span className={styles.eyebrow}>{language === "ru" ? "БАЗА ЗНАНИЙ" : "BILIMLAR BAZASI"}</span><h2>{language === "ru" ? "Понимайте право до принятия решения" : "Qaror qabul qilishdan oldin huquqni tushuning"}</h2><p>{language === "ru" ? "Краткие материалы объясняют процесс, риски и подготовку документов без обещаний гарантированного результата." : "Qisqa materiallar kafolatlangan natija va’da qilmasdan jarayon, xavflar va hujjat tayyorlashni tushuntiradi."}</p><a href={appUrl("/help",language)}>{language === "ru" ? "Открыть базу знаний" : "Bilimlar bazasini ochish"}<ArrowRight/></a></div><div className={styles.knowledgeCards}>{[text("Как подготовиться к проверке договора", "Shartnomani tekshirishga qanday tayyorlanish"),text("Какие факты нужны для плана действий", "Harakatlar rejasi uchun qanday faktlar kerak"),text("Когда документ должен проверить юрист", "Hujjatni qachon yurist tekshirishi kerak")].map((item,index)=><article key={item.ru}><small>{String(index+1).padStart(2,"0")}</small><h3>{tr(item)}</h3><span>{language === "ru" ? "Практическое руководство" : "Amaliy qo‘llanma"}</span></article>)}</div></section>

    <section className={styles.section}><SectionHead eyebrow={text("FAQ", "FAQ")} title={text("Частые вопросы", "Ko‘p beriladigan savollar")} body={text("Прозрачно объясняем возможности и ограничения сервиса.", "Xizmat imkoniyatlari va cheklovlarini ochiq tushuntiramiz.")} language={language}/><div className={styles.faq}>{faqs.map((question,index)=><article key={question.ru}><button aria-expanded={openFaq===index} onClick={()=>setOpenFaq(openFaq===index?-1:index)}><span>{tr(question)}</span><ChevronDown/></button>{openFaq===index&&<p>{index===0?(language==="ru"?"JURO сохраняет рабочий контекст, связывает ответы с делами, документами и сроками и позволяет передать их специалисту.":"JURO ish kontekstini saqlaydi, javoblarni ishlar, hujjatlar va muddatlar bilan bog‘laydi hamda mutaxassisga topshirishga imkon beradi."):index===1?(language==="ru"?"Нет. AI помогает подготовиться и структурировать информацию, но сложные, срочные и спорные ситуации требуют профессиональной проверки.":"Yo‘q. AI tayyorlanish va ma’lumotni tuzishga yordam beradi, ammo murakkab, shoshilinch va bahsli vaziyatlar professional tekshiruvni talab qiladi."):index===2?(language==="ru"?"Доступ получают только вы и явно приглашённые участники в пределах назначенных прав.":"Faqat siz va aniq taklif qilingan ishtirokchilar belgilangan huquqlar doirasida kirish oladi."):index===3?(language==="ru"?"Да. Проекты документов можно сохранять, продолжать и редактировать; важные изменения должны проходить повторную проверку.":"Ha. Hujjat loyihalarini saqlash, davom ettirish va tahrirlash mumkin; muhim o‘zgarishlar qayta tekshirilishi kerak."):(language==="ru"?"Вы выбираете консультацию и подтверждаете передачу контекста. Права доступа можно отозвать.":"Maslahatni tanlaysiz va kontekst uzatilishini tasdiqlaysiz. Kirish huquqlarini bekor qilish mumkin.")}</p>}</article>)}</div></section>

    <section className={styles.finalCta}><span>JURO</span><h2>{language === "ru" ? "Начните с фактов. Дойдите до понятного действия." : "Faktlardan boshlang. Tushunarli harakatgacha boring."}</h2><p>{language === "ru" ? "Создайте личное или бизнес-пространство и выберите первый инструмент." : "Shaxsiy yoki biznes makonini yarating va birinchi vositani tanlang."}</p><a href={register}>{language === "ru" ? "Начать работу" : "Ishni boshlash"}<ArrowRight/></a><small>{language === "ru" ? "JURO не является государственным органом или нотариусом. AI-инструменты не заменяют обязательную профессиональную помощь." : "JURO davlat organi yoki notarius emas. AI vositalari majburiy professional yordamni almashtirmaydi."}</small></section>

    <Footer language={language}/>
  </main>;
}

function SectionHead({ eyebrow, title, body, language }: { eyebrow: LocalText; title: LocalText; body: LocalText; language: Language }) {
  return <header className={styles.sectionHead}><span>{eyebrow[language]}</span><h2>{title[language]}</h2><p>{body[language]}</p></header>;
}

function Footer({ language }: { language: Language }) {
  const ru = language === "ru";
  const legal = [
    ["terms", ru ? "Условия использования" : "Foydalanish shartlari"],
    ["privacy-policy", ru ? "Политика конфиденциальности" : "Maxfiylik siyosati"],
    ["personal-data-processing", ru ? "Обработка персональных данных" : "Shaxsiy ma’lumotlarni qayta ishlash"],
    ["cookies", "Cookies"],
    ["ai-rules", ru ? "Правила использования AI" : "AIdan foydalanish qoidalari"],
  ];
  return <footer className={styles.footer}><div className={styles.footerBrand}><img src="/juro-logo-light.png" alt="JURO"/><p>{ru ? "Цифровое рабочее пространство для юридических вопросов, документов и совместной работы." : "Yuridik masalalar, hujjatlar va hamkorlik uchun raqamli ish makoni."}</p><small>© {new Date().getFullYear()} JURO</small></div><div><b>{ru?"Продукт":"Mahsulot"}</b><a href={appUrl("/ai-chat",language)}>AI-{ru?"юрист":"yurist"}</a><a href={appUrl("/document-builder",language)}>{ru?"Создать документ":"Hujjat yaratish"}</a><a href={appUrl("/document-review",language)}>{ru?"Проверить документ":"Hujjatni tekshirish"}</a><a href={appUrl("/action-plan",language)}>{ru?"План действий":"Harakatlar rejasi"}</a></div><div><b>{ru?"Компаниям":"Kompaniyalar uchun"}</b><a href={appUrl("/register",language,"business")}>{ru?"Бизнес-пространство":"Biznes makoni"}</a><a href="#security">{ru?"Безопасность":"Xavfsizlik"}</a><a href="#pricing">{ru?"Тарифы":"Tariflar"}</a><a href={appUrl("/consultations",language)}>{ru?"Консультации":"Maslahatlar"}</a></div><div><b>{ru?"Правовая информация":"Huquqiy ma’lumot"}</b>{legal.map(([slug,label])=><Link href={`/${language}/${slug}`} key={slug}>{label}</Link>)}</div></footer>;
}
