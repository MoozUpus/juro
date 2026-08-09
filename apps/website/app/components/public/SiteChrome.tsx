"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import brandStyles from "./brand-lockup.module.css";
import styles from "./site-chrome.module.css";

type Locale = "ru" | "uz";

const copy = {
  ru: {
    nav: "Главная навигация",
    product: "Продукт",
    people: "Для кого",
    trust: "Доверие",
    resources: "Ресурсы",
    lawyers: "Юристы",
    video: "Видео",
    legal: "Документы",
    signIn: "Войти",
    start: "Начать с JURO",
    open: "Открыть меню",
    close: "Закрыть меню",
    skip: "К основному содержанию",
    productLabel: "Продукт",
    companyLabel: "JURO",
    legalLabel: "Правовая информация",
    description: "Юридическая ситуация превращается в проверяемый план, документ и следующий шаг.",
    ai: "AI-юрист",
    document: "Проверка документа",
    plan: "План действий",
    business: "Для бизнеса",
    knowledge: "База знаний",
    privacy: "Конфиденциальность",
    terms: "Условия использования",
    data: "Персональные данные",
    aiRules: "Правила AI",
    contact: "Связаться",
    note: "AI помогает подготовить работу, но не заменяет обязательную профессиональную помощь.",
  },
  uz: {
    nav: "Asosiy navigatsiya",
    product: "Mahsulot",
    people: "Kim uchun",
    trust: "Ishonch",
    resources: "Resurslar",
    lawyers: "Yuristlar",
    video: "Video",
    legal: "Hujjatlar",
    signIn: "Kirish",
    start: "JURO bilan boshlash",
    open: "Menyuni ochish",
    close: "Menyuni yopish",
    skip: "Asosiy mazmunga o‘tish",
    productLabel: "Mahsulot",
    companyLabel: "JURO",
    legalLabel: "Huquqiy ma’lumot",
    description: "Yuridik vaziyat tekshiriladigan reja, hujjat va keyingi qadamga aylanadi.",
    ai: "AI-yurist",
    document: "Hujjatni tekshirish",
    plan: "Harakatlar rejasi",
    business: "Biznes uchun",
    knowledge: "Bilimlar bazasi",
    privacy: "Maxfiylik",
    terms: "Foydalanish shartlari",
    data: "Shaxsiy ma’lumotlar",
    aiRules: "AI qoidalari",
    contact: "Bog‘lanish",
    note: "AI ishni tayyorlashga yordam beradi, ammo majburiy professional yordamni almashtirmaydi.",
  },
} as const;

export function SiteHeader({ locale, tone = "light", languageHref }: { locale: Locale; tone?: "light" | "dark"; languageHref?: string }) {
  const t = copy[locale];
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const otherLocale = locale === "ru" ? "uz" : "ru";
  const localeHref = languageHref ?? `/${otherLocale}`;

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 18);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    document.body.style.overflow = "hidden";
    const focusable = panel
      ? Array.from(panel.querySelectorAll<HTMLElement>("a[href],button:not([disabled])"))
      : [];
    focusable[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  const nav = [
    [t.product, `/${locale}#product`],
    [t.people, `/${locale}#audiences`],
    [t.trust, `/${locale}/trust`],
    [t.resources, `/${locale}#resources`],
  ] as const;

  return (
    <header className={styles.header} data-scrolled={scrolled || undefined} data-tone={tone}>
      <a className={styles.skipLink} href="#main-content">{t.skip}</a>
      <div className={styles.headerInner}>
        <Link aria-label="JURO" className={`${styles.logo} ${brandStyles.logo}`} href={`/${locale}`}>
          <span className={brandStyles.markFrame}><Image alt="" className={brandStyles.mark} height={313} priority src={tone === "dark" && !scrolled ? "/juro-logo-light.avif" : "/juro-logo-primary.avif"} unoptimized width={320} /></span>
          <span className={brandStyles.wordmark}>JURO</span>
        </Link>
        <nav aria-label={t.nav} className={styles.desktopNav}>
          {nav.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        </nav>
        <div className={styles.actions}>
          <Link aria-label={locale === "ru" ? "O‘zbekcha" : "Русский"} className={styles.language} href={localeHref}>{otherLocale.toUpperCase()}</Link>
          <a className={styles.login} href={`https://app.juro.uz/${locale}/auth/login`}>{t.signIn}</a>
          <a className={styles.primary} href={`https://app.juro.uz/register?lang=${locale}&accountType=individual`}>{t.start}<ArrowRight aria-hidden="true" size={17} /></a>
          <button aria-controls={panelId} aria-expanded={open} aria-label={t.open} className={styles.menuButton} onClick={() => setOpen(true)} ref={triggerRef} type="button"><Menu aria-hidden="true" size={22} /></button>
        </div>
      </div>
      {open ? (
        <div className={styles.mobileLayer}>
          <button aria-label={t.close} className={styles.scrim} onClick={() => setOpen(false)} type="button" />
          <div aria-label={t.nav} aria-modal="true" className={styles.mobilePanel} id={panelId} ref={panelRef} role="dialog">
            <div className={styles.mobileTop}>
              <div className={brandStyles.mobileBrand}>
                <span className={brandStyles.mobileMarkFrame}><Image alt="" className={brandStyles.mobileMark} height={313} src="/juro-logo-primary.avif" unoptimized width={320} /></span>
                <span>JURO</span>
              </div>
              <button aria-label={t.close} className={styles.closeButton} onClick={() => setOpen(false)} type="button"><X aria-hidden="true" size={22} /></button>
            </div>
            <nav>
              {nav.map(([label, href], index) => <Link href={href} key={href} onClick={() => setOpen(false)}><span>0{index + 1}</span>{label}<ArrowRight aria-hidden="true" size={18} /></Link>)}
              <Link href={`/${locale}/lawyers`} onClick={() => setOpen(false)}><span>05</span>{t.lawyers}<ArrowRight aria-hidden="true" size={18} /></Link>
              <Link href={`/${locale}/video`} onClick={() => setOpen(false)}><span>06</span>{t.video}<ArrowRight aria-hidden="true" size={18} /></Link>
              <Link href={`/${locale}/legal`} onClick={() => setOpen(false)}><span>07</span>{t.legal}<ArrowRight aria-hidden="true" size={18} /></Link>
            </nav>
            <div className={styles.mobileActions}>
              <Link href={localeHref} onClick={() => setOpen(false)}>{locale === "ru" ? "O‘zbekcha" : "Русский"}</Link>
              <a href={`https://app.juro.uz/register?lang=${locale}&accountType=individual`}>{t.start}<ArrowRight aria-hidden="true" size={17} /></a>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const year = new Date().getFullYear();
  const productLinks = [
    [t.ai, `https://app.juro.uz/${locale}/individual/ai-lawyer/new`],
    [t.document, `https://app.juro.uz/${locale}/individual/document-analysis`],
    [t.plan, `https://app.juro.uz/${locale}/individual/cases`],
    [t.lawyers, `/${locale}/lawyers`],
  ] as const;
  return (
    <footer className={styles.footer}>
      <div className={styles.footerTop}>
        <div className={styles.footerBrand}>
          <Link aria-label="JURO" className={brandStyles.footerLogo} href={`/${locale}`}>
            <span className={brandStyles.footerMarkFrame}><Image alt="" className={brandStyles.footerMark} height={313} src="/juro-logo-light.avif" unoptimized width={320} /></span>
            <span>JURO</span>
          </Link>
          <p>{t.description}</p>
        </div>
        <div className={styles.footerColumn}><strong>{t.productLabel}</strong>{productLinks.map(([label, href]) => href.startsWith("/") ? <Link href={href} key={href}>{label}</Link> : <a href={href} key={href}>{label}</a>)}</div>
        <div className={styles.footerColumn}><strong>{t.companyLabel}</strong><Link href={`/${locale}/trust`}>Trust Center</Link><Link href={`/${locale}/video`}>{t.video}</Link><Link href={`/${locale}/knowledge/contract-review-preparation`}>{t.knowledge}</Link><a href="mailto:muzaffarbekmurodoff@gmail.com">{t.contact}</a></div>
        <div className={styles.footerColumn}><strong>{t.legalLabel}</strong><Link href={`/${locale}/legal`}>{t.legal}</Link><Link href={`/${locale}/privacy-policy`}>{t.privacy}</Link><Link href={`/${locale}/terms`}>{t.terms}</Link><Link href={`/${locale}/personal-data-processing`}>{t.data}</Link><Link href={`/${locale}/ai-rules`}>{t.aiRules}</Link></div>
      </div>
      <div className={styles.footerBottom}><span>© {year} JURO</span><p>{t.note}</p><Link href={`/${locale === "ru" ? "uz" : "ru"}`}>{locale === "ru" ? "O‘zbekcha" : "Русский"}</Link></div>
    </footer>
  );
}
