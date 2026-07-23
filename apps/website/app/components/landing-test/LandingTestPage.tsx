"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Languages, Menu, ShieldCheck, UserRound, X } from "lucide-react";
import styles from "./LandingTestPage.module.css";

const JURO_APP_URL = "https://app.juro.uz/";
type Language = "ru" | "uz";

const copy = {
  ru: {
    nav: ["Возможности", "Как это работает", "Для бизнеса", "Тарифы", "О JURO"],
    login: "Войти", try: "Попробовать JURO",
    badge: "AI-помощник и живые юристы в одном сервисе",
    title1: "Юрист в кармане.", title2: "Помощь — в нужный момент.",
    body: "Опишите ситуацию, задайте вопрос или загрузите документ. JURO поможет разобраться, объяснит риски и предложит понятный план действий.",
    ask: "Спросите Jurobek:", primary: "Задать вопрос", secondary: "Посмотреть, как это работает",
    quickLabel: "С чем может помочь JURO:",
    quick: ["Проверить договор", "Создать документ", "Получить план действий", "Связаться с юристом"],
    questions: ["Работодатель задерживает зарплату. Что делать?", "Проверь этот договор и покажи основные риски.", "Как правильно вернуть долг по расписке?", "Помоги составить претензию продавцу.", "Какие документы нужны для регистрации бизнеса?"],
    bubble: "Расскажите, что произошло. Разберёмся по шагам.",
    trust: ["Конфиденциально", "На русском и узбекском", "AI + помощь живого юриста"],
    nextTitle: "Юридическая помощь без сложного процесса",
    steps: ["Опишите ситуацию", "Получите анализ и план действий", "Продолжите с AI или живым юристом"],
    alt: "Jurobek — цифровой юридический помощник JURO",
  },
  uz: {
    nav: ["Imkoniyatlar", "Qanday ishlaydi", "Biznes uchun", "Tariflar", "JURO haqida"],
    login: "Kirish", try: "JUROni sinab ko‘rish",
    badge: "AI-yordamchi va jonli yuristlar bitta xizmatda",
    title1: "Cho‘ntagingizdagi yurist.", title2: "Kerakli paytda yordam.",
    body: "Vaziyatingizni yozing, savol bering yoki hujjat yuklang. JURO masalani tushunishga, xavflarni aniqlashga va aniq harakatlar rejasini tuzishga yordam beradi.",
    ask: "Jurobekdan so‘rang:", primary: "Savol berish", secondary: "Qanday ishlashini ko‘rish",
    quickLabel: "JURO sizga quyidagilarda yordam beradi:",
    quick: ["Shartnomani tekshirish", "Hujjat yaratish", "Harakatlar rejasini olish", "Yurist bilan bog‘lanish"],
    questions: ["Ish beruvchi maoshni kechiktiryapti. Nima qilish kerak?", "Shartnomani tekshirib, asosiy xavflarni ko‘rsat.", "Tilxat bo‘yicha qarzni qanday qaytarish mumkin?", "Sotuvchiga talabnoma tuzishga yordam ber.", "Biznesni ro‘yxatdan o‘tkazish uchun nimalar kerak?"],
    bubble: "Nima bo‘lganini ayting. Masalani bosqichma-bosqich ko‘rib chiqamiz.",
    trust: ["Maxfiy", "Rus va o‘zbek tillarida", "AI + jonli yurist yordami"],
    nextTitle: "Murakkab jarayonsiz yuridik yordam",
    steps: ["Vaziyatni tasvirlab bering", "Tahlil va harakatlar rejasini oling", "AI yoki jonli yurist bilan davom eting"],
    alt: "Jurobek — JURO raqamli yuridik yordamchisi",
  },
} as const;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function Typewriter({ items, label }: { items: readonly string[]; label: string }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const full = items[index];
    let delay = deleting ? 21 : 38;
    if (!deleting && text === full) delay = 1800;
    if (deleting && text === "") delay = 400;
    const timer = window.setTimeout(() => {
      if (!deleting && text === full) setDeleting(true);
      else if (deleting && text === "") { setDeleting(false); setIndex((i) => (i + 1) % items.length); }
      else setText(deleting ? full.slice(0, Math.max(0, text.length - 1)) : full.slice(0, text.length + 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [deleting, index, items, reduced, text]);
  const visibleText = reduced ? items[0] : text;
  return <div className={styles.typeBlock}>
    <span className={styles.typeLabel}>{label}</span>
    <a href={JURO_APP_URL} className={styles.typeCard} aria-label={`${label} ${items[index]}`}>
      <span className={styles.miniLogo}>J</span><span className={styles.typeText}>{visibleText}<i aria-hidden="true" /></span><ArrowRight size={18} aria-hidden="true" />
    </a>
  </div>;
}

export function LandingTestPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const figure = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const t = copy[lang];
  const anchors = useMemo(() => ["#how-it-works", "#how-it-works", JURO_APP_URL, JURO_APP_URL, "#how-it-works"], []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [menu]);
  useEffect(() => {
    if (reduced || !window.matchMedia("(pointer:fine) and (min-width: 900px)").matches) return;
    let frame = 0, tx = 0, ty = 0, x = 0, y = 0;
    const draw = () => { x += (tx - x) * .08; y += (ty - y) * .08; figure.current?.style.setProperty("transform", `translate3d(${x}px,${y}px,0)`); frame = requestAnimationFrame(draw); };
    const move = (e: PointerEvent) => { tx = (e.clientX / innerWidth - .5) * 20; ty = (e.clientY / innerHeight - .5) * 12; };
    const reset = () => { tx = 0; ty = 0; };
    frame = requestAnimationFrame(draw); window.addEventListener("pointermove", move); window.addEventListener("blur", reset); document.addEventListener("mouseleave", reset);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("pointermove", move); window.removeEventListener("blur", reset); document.removeEventListener("mouseleave", reset); };
  }, [reduced]);

  const setLanguage = (value: Language) => { setLang(value); document.documentElement.lang = value; };
  return <main className={styles.page}>
    <header className={`${styles.navbar} ${scrolled ? styles.navScrolled : ""}`}>
      <div className={styles.navInner}>
        <Link href="/" aria-label="JURO"><img src="/juro-logo-primary.png" alt="JURO" /></Link>
        <nav className={styles.desktopNav} aria-label="Основная навигация">{t.nav.map((item, i) => <a key={item} href={anchors[i]}>{item}</a>)}</nav>
        <div className={styles.navActions}>
          <div className={styles.languages} aria-label="Til / Язык"><button className={lang === "ru" ? styles.activeLang : ""} onClick={() => setLanguage("ru")}>RU</button><span>/</span><button className={lang === "uz" ? styles.activeLang : ""} onClick={() => setLanguage("uz")}>UZ</button></div>
          <a className={styles.login} href={JURO_APP_URL}>{t.login}</a><a className={styles.navCta} href={JURO_APP_URL}>{t.try}</a>
          <button className={styles.menuButton} aria-expanded={menu} aria-controls="landing-mobile-menu" aria-label={menu ? "Закрыть меню" : "Открыть меню"} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
        </div>
      </div>
      <div id="landing-mobile-menu" className={`${styles.mobileMenu} ${menu ? styles.mobileMenuOpen : ""}`} aria-hidden={!menu}>
        <nav>{t.nav.map((item, i) => <a key={item} href={anchors[i]} onClick={() => setMenu(false)}>{item}</a>)}</nav>
        <div className={styles.mobileBottom}><div className={styles.languages}><button onClick={() => setLanguage("ru")}>RU</button><span>/</span><button onClick={() => setLanguage("uz")}>UZ</button></div><a href={JURO_APP_URL}>{t.login}</a><a className={styles.navCta} href={JURO_APP_URL}>{t.try}</a></div>
      </div>
    </header>

    <section className={styles.hero}>
      <div className={styles.grid}>
        <div className={styles.copy}>
          <div className={`${styles.badge} ${styles.enter}`}><i />{t.badge}</div>
          <h1 className={`${styles.enter} ${styles.delay1}`}>{t.title1}<br/><em>{t.title2}</em></h1>
          <p className={`${styles.lead} ${styles.enter} ${styles.delay2}`}>{t.body}</p>
          <div className={`${styles.enter} ${styles.delay3}`}><Typewriter items={t.questions} label={t.ask} /></div>
          <div className={`${styles.heroActions} ${styles.enter} ${styles.delay4}`}><a className={styles.primary} href={JURO_APP_URL}>{t.primary}<ArrowRight size={18}/></a><a className={styles.secondary} href="#how-it-works">{t.secondary}</a></div>
          <div className={`${styles.quickWrap} ${styles.enter} ${styles.delay4}`}><span>{t.quickLabel}</span><div>{t.quick.map(q => <a href={JURO_APP_URL} key={q}>{q}</a>)}</div></div>
        </div>
        <div className={`${styles.visual} ${styles.enterVisual}`} aria-label={t.alt}>
          <div className={styles.glow} aria-hidden="true" />
          <div className={styles.bubble}><span className={styles.miniLogo}>J</span><p>{t.bubble}</p></div>
          <div ref={figure} className={styles.figure}><img src="/jurobek-avatar.webp" width="900" height="1200" alt={t.alt} /></div>
        </div>
      </div>
      <div className={styles.trust}>{t.trust.map((item, i) => <div key={item}>{i === 0 ? <ShieldCheck/> : i === 1 ? <Languages/> : <UserRound/>}<span>{item}</span></div>)}</div>
    </section>

    <section id="how-it-works" className={styles.how}>
      <span>JURO</span><h2>{t.nextTitle}</h2><div>{t.steps.map((step, i) => <article key={step}><b>0{i + 1}</b><h3>{step}</h3><Check aria-hidden="true" /></article>)}</div>
    </section>
  </main>;
}
