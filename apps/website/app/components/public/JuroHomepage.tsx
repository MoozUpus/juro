"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  FileCheck2,
  Fingerprint,
  Play,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ru } from "../../../content/ru";
import { uz } from "../../../content/uz";
import type { Language } from "../../../content/types";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { JuroMotionDirector } from "./JuroMotionDirector";
import styles from "./juro-home.module.css";
import motionStyles from "./juro-motion.module.css";
import editorialStyles from "./juro-editorial.module.css";
import decisionStyles from "./juro-decision.module.css";
import laptopStyles from "./juro-laptop.module.css";

const copy = {
  ru: {
    hero: {
      eyebrow: "JURO · Юрист в кармане",
      titleA: "Расскажите,",
      titleB: "что произошло.",
      titleC: "Получите ясный следующий шаг.",
      lead: "JURO превращает вопрос, договор или срок по праву Узбекистана в понятные факты, риски и план — с возможностью подключить живого юриста.",
      primary: "Разобрать ситуацию бесплатно",
      secondary: "Увидеть JURO в работе",
      note: "Первичный сценарий можно начать бесплатно. Без загрузки данных на публичной странице.",
      scene: "Живая модель результата",
      input: "Ситуация человека",
      output: "Карта решения JURO",
      facts: "Подтверждённые факты",
      source: "Правовое основание",
      risk: "Риск и срок",
      action: "Следующий шаг",
    },
    scenarios: [
      {
        tab: "Зарплата",
        question: "Рабодатель второй месяц задерживает зарплату. Что мне делать?",
        facts: "Дата выплаты, трудовой договор, начисления",
        source: "Трудовое право · официальный источник",
        risk: "Важно сохранить доказательства и проверить сроки обращения",
        action: "Зафиксировать долг → подготовить обращение",
      },
      {
        tab: "Договор",
        question: "В договоре аренды неясно, когда возвращают депозит.",
        facts: "Срок аренды, сумма депозита, основания удержания",
        source: "Гражданское и договорное право",
        risk: "Формулировка допускает спорное удержание",
        action: "Уточнить срок и закрытый перечень удержаний",
      },
      {
        tab: "Бизнес",
        question: "Поставщик нарушил срок. Как действовать без потери позиции?",
        facts: "Договор, спецификация, срок, переписка",
        source: "Условия сделки + применимое право",
        risk: "Претензионный порядок и сроки уведомления",
        action: "Собрать доказательства → подготовить претензию",
      },
    ],
    proof: ["Право Узбекистана", "Русский и узбекский", "AI + живой юрист"],
    chapters: [["Путь", "product"], ["Документ", "analysis"], ["Дело", "case-flow"], ["Юрист", "lawyer-handoff"], ["Доверие", "trust"]],
    transition: {
      eyebrow: "НЕ ЕЩЁ ОДИН AI-ЧАТ",
      title: "Юридическая ясность не заканчивается ответом",
      lead: "В JURO каждый результат продолжает предыдущий. Факты, документ, сроки и решения остаются связанными с одним делом.",
      items: [
        ["01", "Понять", "Отделить факты от предположений"],
        ["02", "Проверить", "Увидеть источник и уровень риска"],
        ["03", "Подготовить", "Получить план или документ"],
        ["04", "Продолжить", "Передать контекст живому юристу"],
      ],
    },
    audience: {
      eyebrow: "ЧЕТЫРЕ УГЛА ЗРЕНИЯ",
      title: "Один продукт. Разная причина доверять.",
      investor: "Для партнёра и инвестора",
      investorBody: "Сквозная инфраструктура: AI, документы, дела и сеть специалистов — не набор несвязанных функций.",
      investorCta: "Смотреть презентацию",
    },
    document: {
      eyebrow: "DOCUMENT INTELLIGENCE",
      title: "Не просто подсветить пункт. Объяснить, что он меняет.",
      lead: "JURO связывает конкретную формулировку с риском, последствием и улучшенной редакцией. Пользователь видит не абстрактный балл, а причину.",
      file: "Договор аренды · пример",
      current: "Текущая редакция",
      finding: "Что обнаружено",
      revision: "Предложенная редакция",
      label: "Выберите пункт",
      clauses: [
        ["Депозит", "Депозит может быть удержан арендодателем по его усмотрению.", "Нет закрытого перечня оснований и требования подтвердить ущерб.", "Депозит удерживается только в размере подтверждённой задолженности или ущерба с письменным расчётом."],
        ["Изменение цены", "Арендная плата может быть изменена в одностороннем порядке в любое время.", "Нет срока уведомления и предела изменения стоимости.", "Изменение допускается не чаще одного раза в год с письменным уведомлением не менее чем за 30 дней."],
        ["Расторжение", "Порядок расторжения определяется дополнительным соглашением сторон.", "Ключевой механизм отложен на будущее и не даёт предсказуемого выхода.", "Каждая сторона вправе расторгнуть договор с письменным уведомлением за 30 календарных дней."],
      ],
      cta: "Проверить свой документ",
    },
    continuity: {
      eyebrow: "ЕДИНАЯ НИТЬ ДЕЛА",
      title: "Контекст не теряется между инструментами",
      lead: "Юридическая работа редко заканчивается одним сообщением. JURO сохраняет логику задачи — от первого вопроса до документа и специалиста.",
      steps: ["Ситуация", "Факты", "Источники", "Риски", "План", "Документ", "Юрист"],
      cardTitle: "Дело: возврат депозита",
      cardBody: "3 факта подтверждены · 1 риск требует действия",
      next: "Следующий шаг",
      nextBody: "Уточнить редакцию пункта 4.2 и направить её второй стороне",
    },
    handoff: {
      eyebrow: "AI + ЧЕЛОВЕК",
      title: "Юрист подключается к подготовленному делу, а не к пустому чату",
      lead: "Вы сами выбираете, какие факты, документы и выводы передать. Специалист видит структуру вопроса и продолжает работу с нужного места.",
      dossier: "Досье для передачи",
      ready: "Контекст подготовлен",
      items: ["Краткая хронология", "Подтверждённые факты", "Документы и риски", "Выбранный следующий шаг"],
      cta: "Посмотреть каталог юристов",
    },
    trust: {
      eyebrow: "ДОВЕРИЕ БЕЗ ЛОЗУНГОВ",
      title: "Проверяемые механики вместо обещания «всё безопасно»",
      lead: "JURO отделяет уже подтверждённое от того, что ещё уточняется. Это честнее — и полезнее для решения о доверии.",
      verified: "Подтверждено",
      policy: "Описано в политике",
      cta: "Открыть Trust Center",
      legal: "Все юридические документы",
    },
    resources: {
      eyebrow: "ПОЗНАКОМЬТЕСЬ БЛИЖЕ",
      title: "Не ищите отдельные адреса",
      items: [
        ["Видео", "2:42", "Посмотреть продукт и подход JURO", "video"],
        ["Юристы", "Каталог", "Познакомиться со специалистами", "lawyers"],
        ["Trust Center", "Факты", "Проверить работу с данными", "trust"],
        ["Правовой центр", "RU · UZ", "Открыть политики и условия", "legal"],
      ],
    },
    access: {
      eyebrow: "НАЧАТЬ БЕЗ ЛИШНЕГО РИСКА",
      title: "Сначала поймите ценность. Потом выбирайте формат.",
      plans: [
        ["Для себя", "Бесплатный старт", "Разбор личной ситуации, документы и понятный план", "Начать бесплатно"],
        ["Для бизнеса", "Условия до подтверждения", "Договоры, роли, сроки и единая история работы", "Создать бизнес-пространство"],
        ["Для юридической команды", "Индивидуальный формат", "Исследования, документы, согласование и аудит", "Обсудить задачу"],
      ],
      note: "Работа живого юриста и дополнительные услуги согласуются отдельно до подтверждения.",
    },
    faqTitle: "Вопросы, которые стоит задать до начала",
    finalTitle: "Юридический вопрос не должен оставаться просто вопросом",
    finalBody: "Опишите ситуацию. JURO поможет превратить её в факты, риски и понятный следующий шаг.",
    finalPrimary: "Начать бесплатно",
    finalSecondary: "Посмотреть видео",
  },
  uz: {
    hero: {
      eyebrow: "JURO · Cho‘ntagingizdagi yurist",
      titleA: "Nima bo‘lganini",
      titleB: "aytib bering.",
      titleC: "Aniq keyingi qadamni oling.",
      lead: "JURO O‘zbekiston huquqi bo‘yicha savol, shartnoma yoki muddatni tushunarli faktlar, xavflar va rejaga aylantiradi — zarur bo‘lsa jonli yuristni ulaydi.",
      primary: "Vaziyatni bepul tahlil qilish",
      secondary: "JURO qanday ishlashini ko‘rish",
      note: "Birinchi ssenariyni bepul boshlash mumkin. Ommaviy sahifaga ma’lumot yuklanmaydi.",
      scene: "Natijaning jonli modeli",
      input: "Inson vaziyati",
      output: "JURO yechim xaritasi",
      facts: "Tasdiqlangan faktlar",
      source: "Huquqiy asos",
      risk: "Xavf va muddat",
      action: "Keyingi qadam",
    },
    scenarios: [
      { tab: "Maosh", question: "Ish beruvchi ikkinchi oy maoshni kechiktiryapti. Nima qilay?", facts: "To‘lov sanasi, mehnat shartnomasi, hisob-kitob", source: "Mehnat huquqi · rasmiy manba", risk: "Dalillarni saqlash va murojaat muddatini tekshirish kerak", action: "Qarzni qayd etish → murojaat tayyorlash" },
      { tab: "Shartnoma", question: "Ijara shartnomasida depozit qachon qaytarilishi aniq emas.", facts: "Ijara muddati, depozit summasi, ushlab qolish asoslari", source: "Fuqarolik va shartnoma huquqi", risk: "Matn bahsli ushlab qolishga yo‘l beradi", action: "Muddat va yopiq asoslar ro‘yxatini aniqlashtirish" },
      { tab: "Biznes", question: "Yetkazib beruvchi muddatni buzdi. Pozitsiyani yo‘qotmasdan nima qilish kerak?", facts: "Shartnoma, spetsifikatsiya, muddat, yozishmalar", source: "Bitim shartlari + qo‘llaniladigan huquq", risk: "Talabnoma tartibi va xabardor qilish muddati", action: "Dalillar → talabnoma loyihasi" },
    ],
    proof: ["O‘zbekiston huquqi", "Rus va o‘zbek tillari", "AI + jonli yurist"],
    chapters: [["Yo‘l", "product"], ["Hujjat", "analysis"], ["Ish", "case-flow"], ["Yurist", "lawyer-handoff"], ["Ishonch", "trust"]],
    transition: { eyebrow: "YANA BIR AI-CHAT EMAS", title: "Yuridik aniqlik javob bilan tugamaydi", lead: "JUROda har bir natija avvalgisini davom ettiradi. Fakt, hujjat, muddat va qarorlar bitta ish bilan bog‘liq qoladi.", items: [["01", "Tushunish", "Faktni taxmindan ajratish"], ["02", "Tekshirish", "Manba va xavf darajasini ko‘rish"], ["03", "Tayyorlash", "Reja yoki hujjat olish"], ["04", "Davom ettirish", "Kontekstni jonli yuristga topshirish"]] },
    audience: { eyebrow: "TO‘RT NUQTAI NAZAR", title: "Bitta mahsulot. Ishonish uchun turli sabab.", investor: "Hamkor va investor uchun", investorBody: "AI, hujjatlar, ishlar va mutaxassislar tarmog‘i — alohida funksiyalar emas, yagona infratuzilma.", investorCta: "Taqdimotni ko‘rish" },
    document: { eyebrow: "DOCUMENT INTELLIGENCE", title: "Bandni ajratishning o‘zi emas. Uning ta’sirini tushuntirish.", lead: "JURO aniq matnni xavf, oqibat va yaxshilangan tahrir bilan bog‘laydi. Foydalanuvchi mavhum ball emas, sababni ko‘radi.", file: "Ijara shartnomasi · misol", current: "Joriy tahrir", finding: "Nima aniqlandi", revision: "Taklif etilgan tahrir", label: "Bandni tanlang", clauses: [["Depozit", "Depozit ijaraga beruvchining ixtiyoriga ko‘ra ushlab qolinishi mumkin.", "Asoslarning yopiq ro‘yxati va zararni tasdiqlash talabi yo‘q.", "Depozit faqat tasdiqlangan qarzdorlik yoki zarar miqdorida yozma hisob bilan ushlab qolinadi."], ["Narx o‘zgarishi", "Ijara haqi istalgan vaqtda bir tomonlama o‘zgartirilishi mumkin.", "Xabardor qilish muddati va o‘zgarish chegarasi yo‘q.", "O‘zgarish yiliga bir martadan ko‘p bo‘lmagan holda kamida 30 kun oldin yozma xabar bilan amalga oshiriladi."], ["Bekor qilish", "Bekor qilish tartibi tomonlarning qo‘shimcha kelishuvi bilan belgilanadi.", "Asosiy chiqish mexanizmi kelajakka qoldirilgan.", "Har bir tomon 30 kalendar kun oldin yozma xabar bilan shartnomani bekor qilishi mumkin."]], cta: "Hujjatimni tekshirish" },
    continuity: { eyebrow: "ISHNING YAGONA IPI", title: "Kontekst vositalar o‘rtasida yo‘qolmaydi", lead: "Yuridik ish kamdan-kam bitta xabar bilan tugaydi. JURO birinchi savoldan hujjat va mutaxassisgacha vazifa mantiqini saqlaydi.", steps: ["Vaziyat", "Faktlar", "Manbalar", "Xavflar", "Reja", "Hujjat", "Yurist"], cardTitle: "Ish: depozitni qaytarish", cardBody: "3 fakt tasdiqlangan · 1 xavf harakat talab qiladi", next: "Keyingi qadam", nextBody: "4.2-band tahririni aniqlashtirish va ikkinchi tomonga yuborish" },
    handoff: { eyebrow: "AI + INSON", title: "Yurist bo‘sh chatga emas, tayyorlangan ishga ulanadi", lead: "Qaysi fakt, hujjat va xulosalarni berishni o‘zingiz tanlaysiz. Mutaxassis savol tuzilishini ko‘rib, kerakli joydan davom etadi.", dossier: "Topshirish uchun dosye", ready: "Kontekst tayyor", items: ["Qisqa xronologiya", "Tasdiqlangan faktlar", "Hujjatlar va xavflar", "Tanlangan keyingi qadam"], cta: "Yuristlar katalogini ko‘rish" },
    trust: { eyebrow: "SHIORSIZ ISHONCH", title: "«Hammasi xavfsiz» va’dasi o‘rniga tekshiriladigan mexanika", lead: "JURO tasdiqlangan ma’lumotni hali aniqlashtirilayotgan ma’lumotdan ajratadi. Bu qaror uchun halolroq va foydaliroq.", verified: "Tasdiqlangan", policy: "Siyosatda bayon qilingan", cta: "Trust Centerni ochish", legal: "Barcha yuridik hujjatlar" },
    resources: { eyebrow: "YAQINROQ TANISHING", title: "Alohida manzillarni qidirmang", items: [["Video", "2:42", "JURO mahsuloti va yondashuvini ko‘rish", "video"], ["Yuristlar", "Katalog", "Mutaxassislar bilan tanishish", "lawyers"], ["Trust Center", "Faktlar", "Ma’lumotlar bilan ishlashni tekshirish", "trust"], ["Yuridik markaz", "RU · UZ", "Siyosat va shartlarni ochish", "legal"]] },
    access: { eyebrow: "ORTIQCHA XAVFSIZ BOSHLASH", title: "Avval qiymatni tushuning. Keyin formatni tanlang.", plans: [["O‘zingiz uchun", "Bepul boshlanish", "Shaxsiy vaziyat tahlili, hujjatlar va tushunarli reja", "Bepul boshlash"], ["Biznes uchun", "Tasdiqdan oldingi shartlar", "Shartnomalar, rollar, muddatlar va yagona tarix", "Biznes makonini yaratish"], ["Yuridik jamoa uchun", "Individual format", "Tadqiqot, hujjat, kelishuv va audit", "Vazifani muhokama qilish"]], note: "Jonli yurist va qo‘shimcha xizmatlar tasdiqdan oldin alohida kelishiladi." },
    faqTitle: "Boshlashdan oldin berish kerak bo‘lgan savollar",
    finalTitle: "Yuridik savol shunchaki savol bo‘lib qolmasligi kerak",
    finalBody: "Vaziyatni yozing. JURO uni fakt, xavf va tushunarli keyingi qadamga aylantirishga yordam beradi.",
    finalPrimary: "Bepul boshlash",
    finalSecondary: "Videoni ko‘rish",
  },
} as const;

export function JuroHomepage({ language }: { language: Language }) {
  const t = copy[language];
  const content = language === "ru" ? ru : uz;
  const [scenario, setScenario] = useState(0);
  const [clause, setClause] = useState(0);
  const scenarioInteracted = useRef(false);
  const clauseInteracted = useRef(false);
  const activeScenario = t.scenarios[scenario];
  const activeClause = t.document.clauses[clause];
  const register = `https://app.juro.uz/register?lang=${language}&accountType=individual`;

  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      let targetId: string;
      try { targetId = decodeURIComponent(hash); } catch { return; }
      const target = document.getElementById(targetId);
      if (!target) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" }));
    };
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (!scenarioInteracted.current && !document.hidden) {
        setScenario((current) => (current + 1) % t.scenarios.length);
      }
    }, 5200);
    return () => window.clearInterval(timer);
  }, [t.scenarios.length]);

  useEffect(() => {
    const updateClause = (event: Event) => {
      if (clauseInteracted.current) return;
      const next = (event as CustomEvent<number>).detail;
      if (Number.isInteger(next) && next >= 0 && next < t.document.clauses.length) setClause(next);
    };
    document.addEventListener("juro:document-step", updateClause);
    return () => document.removeEventListener("juro:document-step", updateClause);
  }, [t.document.clauses.length]);

  const selectScenario = (index: number) => {
    scenarioInteracted.current = true;
    setScenario(index);
  };

  const selectClause = (index: number) => {
    clauseInteracted.current = true;
    setClause(index);
  };

  const moveTab = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: number,
    length: number,
    prefix: string,
    select: (index: number) => void,
  ) => {
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + length) % length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = length - 1;
    else return;
    event.preventDefault();
    select(next);
    requestAnimationFrame(() => document.getElementById(`${prefix}-${next}`)?.focus());
  };

  return (
    <div className={`${styles.page} ${motionStyles.motionRoot}`} data-juro-motion-root lang={language}>
      <JuroMotionDirector />
      <SiteHeader locale={language} tone="dark" />
      <nav aria-label={language === "ru" ? "Разделы истории JURO" : "JURO hikoyasi bo‘limlari"} className={motionStyles.chapterNav}>
        {t.chapters.map(([label, id], index) => <a data-chapter-link href={`#${id}`} key={id}><span>0{index + 1}</span><strong>{label}</strong></a>)}
      </nav>
      <main id="main-content">
        <section className={`${styles.hero} ${motionStyles.heroMotion}`} data-motion-hero>
          <div aria-hidden="true" className={`${styles.heroAtmosphere} ${motionStyles.atmosphereMotion}`}><i /><i /><i /></div>
          <div className={`${styles.heroGrid} ${laptopStyles.heroGrid}`}>
            <div className={`${styles.heroCopy} ${motionStyles.heroCopyMotion} ${laptopStyles.heroCopy}`}>
              <p className={styles.eyebrow}>{t.hero.eyebrow}</p>
              <h1 className={laptopStyles.heroTitle}><span>{t.hero.titleA}</span><span>{t.hero.titleB}</span><em>{t.hero.titleC}</em></h1>
              <p className={styles.heroLead}>{t.hero.lead}</p>
              <div className={styles.heroActions}>
                <a className={styles.buttonGold} href={register}>{t.hero.primary}<ArrowRight aria-hidden="true" size={18} /></a>
                <a className={styles.buttonGhost} href="#product"><Play aria-hidden="true" size={16} />{t.hero.secondary}</a>
              </div>
              <p className={styles.heroNote}>{t.hero.note}</p>
              <ul className={styles.heroProof}>{t.proof.map((item) => <li key={item}><Check aria-hidden="true" size={14} />{item}</li>)}</ul>
            </div>
            <div className={`${styles.heroProduct} ${motionStyles.heroProductMotion} ${laptopStyles.heroProduct}`} data-motion-product>
              <div className={styles.sceneTop}><span><CircleDot aria-hidden="true" size={14} />{t.hero.scene}</span><small>01 — 04</small></div>
              <div aria-label={language === "ru" ? "Примеры юридических ситуаций" : "Yuridik vaziyatlar misollari"} className={styles.scenarioTabs} role="tablist">
                {t.scenarios.map((item, index) => <button aria-controls="scenario-panel" aria-selected={scenario === index} id={`scenario-tab-${index}`} key={item.tab} onClick={() => selectScenario(index)} onKeyDown={(event) => moveTab(event, index, t.scenarios.length, "scenario-tab", selectScenario)} role="tab" tabIndex={scenario === index ? 0 : -1} type="button">{item.tab}</button>)}
              </div>
              <div aria-labelledby={`scenario-tab-${scenario}`} aria-live="polite" className={`${styles.caseMap} ${motionStyles.caseMapMotion}`} id="scenario-panel" key={scenario} role="tabpanel">
                <div className={`${styles.caseInput} ${motionStyles.caseInputMotion}`}><span>{t.hero.input}</span><p>{activeScenario.question}</p></div>
                <div aria-hidden="true" className={`${styles.caseThread} ${motionStyles.caseThreadMotion}`}><i /><i /><i /><i /></div>
                <div className={`${styles.caseOutput} ${motionStyles.caseOutputMotion}`}>
                  <span className={styles.outputLabel}>{t.hero.output}</span>
                  <article><Fingerprint aria-hidden="true" size={18} /><div><small>{t.hero.facts}</small><strong>{activeScenario.facts}</strong></div></article>
                  <article><Scale aria-hidden="true" size={18} /><div><small>{t.hero.source}</small><strong>{activeScenario.source}</strong></div></article>
                  <article><Clock3 aria-hidden="true" size={18} /><div><small>{t.hero.risk}</small><strong>{activeScenario.risk}</strong></div></article>
                  <article className={styles.actionResult}><ArrowDownRight aria-hidden="true" size={18} /><div><small>{t.hero.action}</small><strong>{activeScenario.action}</strong></div></article>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.transitionSection} ${motionStyles.storySection} ${laptopStyles.transitionSection}`} data-chapter id="product">
          <div className={`${styles.sectionIntro} ${laptopStyles.sectionIntro}`} data-reveal="left"><p className={styles.eyebrowDark}>{t.transition.eyebrow}</p><h2 className={laptopStyles.transitionTitle}>{t.transition.title}</h2><p>{t.transition.lead}</p></div>
          <div className={`${styles.transitionRail} ${motionStyles.storyRail}`} data-story-rail>{t.transition.items.map(([number, title, body]) => <article className={motionStyles.storyStep} data-story-step key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div><ChevronRight aria-hidden="true" size={18} /></article>)}</div>
        </section>

        <section className={styles.audienceSection} id="audiences">
          <header className={styles.sectionHeader} data-reveal><p className={styles.eyebrowDark}>{t.audience.eyebrow}</p><h2>{t.audience.title}</h2></header>
          <div className={styles.audienceLayout}>
            <div className={styles.audienceList}>{content.audience.top.map((item, index) => <article className={motionStyles.audienceCardMotion} data-reveal="left" key={item.id}><span>0{index + 1}</span><div><h3>{item.title}</h3><p>{item.body}</p><ul>{item.scenarios.map((scenarioItem) => <li key={scenarioItem}>{scenarioItem}</li>)}</ul></div><a href={`${register}&intent=${item.id}`}>{item.cta}<ArrowRight aria-hidden="true" size={16} /></a></article>)}</div>
            <aside className={`${styles.investorPanel} ${motionStyles.investorMotion}`} data-reveal="right"><span>04</span><Sparkles aria-hidden="true" size={26} /><h3>{t.audience.investor}</h3><p>{t.audience.investorBody}</p><Link href={`/${language}/video`}>{t.audience.investorCta}<ArrowRight aria-hidden="true" size={17} /></Link></aside>
          </div>
        </section>

        <section className={`${styles.documentSection} ${motionStyles.documentStory}`} data-chapter data-document-story id="analysis">
          <header className={styles.documentIntro} data-reveal><p className={styles.eyebrowLight}>{t.document.eyebrow}</p><h2>{t.document.title}</h2><p>{t.document.lead}</p></header>
          <div className={`${styles.documentLab} ${motionStyles.documentLabMotion}`} data-reveal="mask">
            <div className={`${styles.documentCanvas} ${motionStyles.documentCanvasMotion}`}>
              <div className={styles.documentToolbar}><span><FileCheck2 aria-hidden="true" size={16} />{t.document.file}</span><i>•••</i></div>
              <p data-current={clause === 0 || undefined}>4.1. {t.document.clauses[0][1]}</p>
              <p data-current={clause === 1 || undefined}>4.2. {t.document.clauses[1][1]}</p>
              <p data-current={clause === 2 || undefined}>6.3. {t.document.clauses[2][1]}</p>
              <div aria-hidden="true" className={styles.documentMarker} data-clause={clause}>0{clause + 1}</div>
            </div>
            <div className={styles.findingPanel}>
              <span>{t.document.label}</span>
              <div aria-label={t.document.label} className={styles.clauseTabs} role="tablist">{t.document.clauses.map((item, index) => <button aria-controls="clause-panel" aria-selected={clause === index} id={`clause-tab-${index}`} key={item[0]} onClick={() => selectClause(index)} onKeyDown={(event) => moveTab(event, index, t.document.clauses.length, "clause-tab", selectClause)} role="tab" tabIndex={clause === index ? 0 : -1} type="button">0{index + 1}<small>{item[0]}</small></button>)}</div>
              <div aria-labelledby={`clause-tab-${clause}`} aria-live="polite" className={`${styles.findingContent} ${motionStyles.findingContentMotion}`} id="clause-panel" key={clause} role="tabpanel">
                <small>{t.document.current}</small><p>{activeClause[1]}</p>
                <small>{t.document.finding}</small><strong>{activeClause[2]}</strong>
                <small>{t.document.revision}</small><blockquote>{activeClause[3]}</blockquote>
              </div>
              <a href={`https://app.juro.uz/${language}/individual/document-analysis`}>{t.document.cta}<ArrowRight aria-hidden="true" size={17} /></a>
            </div>
          </div>
        </section>

        <section className={`${styles.continuitySection} ${motionStyles.continuityMotion}`} data-chapter data-continuity-story id="case-flow">
          <div className={styles.continuityCopy} data-reveal="left"><p className={styles.eyebrowDark}>{t.continuity.eyebrow}</p><h2>{t.continuity.title}</h2><p>{t.continuity.lead}</p></div>
          <div className={`${styles.continuityVisual} ${motionStyles.continuityVisualMotion}`} data-reveal="right">
            <div className={styles.caseCard}><small>JURO / CASE 024</small><h3>{t.continuity.cardTitle}</h3><p>{t.continuity.cardBody}</p></div>
            <ol>{t.continuity.steps.map((step, index) => <li data-active={index === 0 || undefined} data-continuity-step key={step}><span>0{index + 1}</span>{step}</li>)}</ol>
            <div className={styles.nextCard}><span>{t.continuity.next}</span><strong>{t.continuity.nextBody}</strong><ArrowDownRight aria-hidden="true" size={20} /></div>
          </div>
        </section>

        <section className={`${styles.handoffSection} ${motionStyles.handoffMotion}`} data-chapter data-handoff-story id="lawyer-handoff">
          <div className={`${styles.jurobekStage} ${motionStyles.jurobekMotion}`} data-reveal="left"><div aria-hidden="true" className={styles.jurobekHalo} /><Image alt={content.hero.jurobekAlt} height={1672} src="/jurobek-point.webp" unoptimized width={941} /></div>
          <div className={styles.handoffCopy} data-reveal><p className={styles.eyebrowLight}>{t.handoff.eyebrow}</p><h2>{t.handoff.title}</h2><p>{t.handoff.lead}</p><Link href={`/${language}/lawyers`}>{t.handoff.cta}<ArrowRight aria-hidden="true" size={18} /></Link></div>
          <div className={`${styles.dossier} ${motionStyles.dossierMotion}`}><div><span>{t.handoff.dossier}</span><small><ShieldCheck aria-hidden="true" size={15} />{t.handoff.ready}</small></div>{t.handoff.items.map((item, index) => <p key={item}><i>0{index + 1}</i><Check aria-hidden="true" size={15} />{item}</p>)}</div>
        </section>

        <section className={`${styles.trustSection} ${editorialStyles.trustSection}`} data-chapter id="trust">
          <header data-reveal><p className={styles.eyebrowDark}>{t.trust.eyebrow}</p><h2>{t.trust.title}</h2><p>{t.trust.lead}</p></header>
          <div className={`${styles.trustGrid} ${editorialStyles.trustGrid}`}>{content.security.items.map((item, index) => <article className={`${motionStyles.trustMotion} ${editorialStyles.trustItem}`} data-primary={index === 0 || undefined} data-reveal key={item.title}><span>{index === 2 ? t.trust.policy : t.trust.verified}</span><ShieldCheck aria-hidden="true" size={22} /><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
          <div className={styles.trustActions}><Link href={`/${language}/trust`}>{t.trust.cta}<ArrowRight aria-hidden="true" size={17} /></Link><Link href={`/${language}/legal`}>{t.trust.legal}</Link></div>
        </section>

        <section className={`${styles.resourcesSection} ${editorialStyles.resourcesSection}`} id="resources">
          <header data-reveal><p className={styles.eyebrowDark}>{t.resources.eyebrow}</p><h2>{t.resources.title}</h2></header>
          <div className={editorialStyles.resourceGrid}>{t.resources.items.map(([title, meta, body, path], index) => <Link className={`${motionStyles.resourceMotion} ${editorialStyles.resourceItem}`} data-primary={index === 0 || undefined} data-reveal href={`/${language}/${path}`} key={path}><span>0{index + 1}</span><small>{meta}</small><h3>{title}</h3><p>{body}</p>{index === 0 ? <div className={editorialStyles.watchSignal}><Play aria-hidden="true" size={15} />{language === "ru" ? "Смотреть обзор" : "Sharhni ko‘rish"}</div> : null}<ArrowDownRight aria-hidden="true" size={22} /></Link>)}</div>
        </section>

        <section className={`${styles.accessSection} ${decisionStyles.accessSection}`} id="pricing">
          <header data-reveal><p className={styles.eyebrowLight}>{t.access.eyebrow}</p><h2>{t.access.title}</h2></header>
          <div className={`${styles.accessPlans} ${decisionStyles.accessPlans}`}>{t.access.plans.map(([title, meta, body, cta], index) => <article className={`${motionStyles.planMotion} ${decisionStyles.accessPlan}`} data-featured={index === 1 || undefined} data-reveal key={title}><span>0{index + 1}</span><small>{meta}</small><h3>{title}</h3><p>{body}</p><a href={index === 2 ? "mailto:muzaffarbekmurodoff@gmail.com" : `${register}&intent=${index === 1 ? "business" : "individual"}`}>{cta}<ArrowRight aria-hidden="true" size={16} /></a></article>)}</div>
          <p className={styles.accessNote}>{t.access.note}</p>
        </section>

        <section className={styles.faqSection} id="faq">
          <header data-reveal><p className={styles.eyebrowDark}>FAQ</p><h2>{t.faqTitle}</h2></header>
          <div>{content.faq.items.slice(0, 8).map((item, index) => <details key={item.question}><summary><span>0{index + 1}</span>{item.question}<i aria-hidden="true">+</i></summary><p>{item.answer}</p></details>)}</div>
        </section>

        <section className={`${styles.finalSection} ${motionStyles.finalMotion}`} data-reveal="mask" id="start">
          <div aria-hidden="true" className={styles.finalLine}><i /><i /><i /></div>
          <p className={styles.eyebrowLight}>JURO · {language === "ru" ? "ЮРИСТ В КАРМАНЕ" : "CHO‘NTAGINGIZDAGI YURIST"}</p>
          <h2>{t.finalTitle}</h2><p>{t.finalBody}</p>
          <div><a className={styles.buttonGold} href={register}>{t.finalPrimary}<ArrowRight aria-hidden="true" size={18} /></a><Link className={styles.buttonGhost} href={`/${language}/video`}><Play aria-hidden="true" size={16} />{t.finalSecondary}</Link></div>
        </section>
      </main>
      <SiteFooter locale={language} />
    </div>
  );
}
