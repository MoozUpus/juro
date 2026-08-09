import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { experience } from "../../../content/experience";
import type { Language } from "../../../content/types";
import { SiteFooter, SiteHeader } from "../../components/public/SiteChrome";
import { legalConfig } from "../../legal-config";
import styles from "./trust.module.css";

type Props = { params: Promise<{ locale: string }> };

function parseLocale(value: string): Language | null {
  return value === "ru" || value === "uz" ? value : null;
}

export function generateStaticParams() {
  return [{ locale: "ru" }, { locale: "uz" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) return {};
  const ru = locale === "ru";
  const title = ru ? "Trust Center — безопасность и данные JURO" : "Trust Center — JURO xavfsizligi va ma’lumotlari";
  const description = ru
    ? "Проверяемая информация о доступе, документах, хранении, удалении, AI-провайдерах и политиках JURO."
    : "JUROdagi kirish, hujjatlar, saqlash, o‘chirish, AI-provayderlar va siyosatlar haqida tekshiriladigan ma’lumot.";
  return {
    title,
    description,
    alternates: {
      canonical: `https://juro.uz/${locale}/trust`,
      languages: {
        ru: "https://juro.uz/ru/trust",
        uz: "https://juro.uz/uz/trust",
        "x-default": "https://juro.uz/ru/trust",
      },
    },
    openGraph: {
      title,
      description,
      url: `https://juro.uz/${locale}/trust`,
      type: "website",
      siteName: "JURO",
      images: ["/juro-og.png"],
    },
  };
}

export default async function TrustPage({ params }: Props) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  const ru = locale === "ru";
  const summary = experience[locale].trust;

  const sections = ru ? [
    {
      title: "Документы и рабочие данные",
      body: "Личные дела и документы относятся к приватным рабочим объектам и не входят в публичные страницы или sitemap. Реальные файлы не принимаются на публичном лендинге: работа с ними начинается после перехода в защищённый аккаунт.",
      state: "Подтверждено структурой публичного сайта",
    },
    {
      title: "Доступ сотрудников и участников",
      body: "Пользователь управляет приглашениями и выбирает материалы для передачи. Доступ к приватным объектам должен проверяться на сервере по сессии, роли и правам участника. Конкретный внутренний перечень сотрудников с административным доступом требует отдельной публикации оператором.",
      state: "Механика подтверждена; внутренний перечень уточняется",
    },
    {
      title: "Хранение и удаление",
      body: "Срок зависит от типа данных, состояния аккаунта и обязательных требований. Пользователь может инициировать запрос через доступный в приложении канал. До утверждения таблицы сроков JURO не заявляет единый универсальный период хранения.",
      state: "Процесс описан; точные сроки уточняются",
    },
    {
      title: "Временные ссылки",
      body: "Приватные файлы не должны публиковаться по постоянным открытым адресам. Временные ссылки и их срок действия применяются там, где это реализовано в продукте; архивирование отдельно сохранённого подписанного PDF делает активную ссылку недействительной.",
      state: "Подтверждено продуктовым процессом",
    },
    {
      title: "AI-провайдеры и subprocessors",
      body: "Финальный перечень production-провайдеров, регионов обработки и subprocessors будет опубликован после утверждения архитектуры и договорных условий. До этого JURO не делает неподтверждённых заявлений о локализации данных или использовании документов для обучения моделей.",
      state: "Уточняется до production-запуска",
    },
    {
      title: "Шифрование, журналирование и стандарты",
      body: "JURO не заявляет сертификаты, конкретные алгоритмы шифрования или соответствие стандартам без технического подтверждения. Проверенные сведения будут добавляться с датой последней проверки.",
      state: "Не заявляется без подтверждения",
    },
  ] : [
    {
      title: "Hujjatlar va ish ma’lumotlari",
      body: "Shaxsiy ishlar va hujjatlar yopiq ish obyektlariga kiradi va ommaviy sahifa yoki sitemapga qo‘shilmaydi. Ommaviy landing haqiqiy fayllarni qabul qilmaydi: ular bilan ishlash himoyalangan akkauntga o‘tgach boshlanadi.",
      state: "Ommaviy sayt tuzilmasi bilan tasdiqlangan",
    },
    {
      title: "Xodim va ishtirokchilar kirishi",
      body: "Foydalanuvchi takliflarni boshqaradi va uzatiladigan materiallarni tanlaydi. Yopiq obyektlarga kirish serverda sessiya, rol va ishtirokchi huquqlari bo‘yicha tekshirilishi kerak. Ma’muriy kirishga ega xodimlarning ichki ro‘yxati operator tomonidan alohida e’lon qilinishi kerak.",
      state: "Mexanizm tasdiqlangan; ichki ro‘yxat aniqlashtirilmoqda",
    },
    {
      title: "Saqlash va o‘chirish",
      body: "Muddat ma’lumot turi, akkaunt holati va majburiy talablarga bog‘liq. Foydalanuvchi ilovadagi mavjud kanal orqali so‘rov boshlashi mumkin. Muddatlar jadvali tasdiqlanmaguncha JURO yagona umumiy saqlash muddatini e’lon qilmaydi.",
      state: "Jarayon bayon qilingan; aniq muddatlar aniqlashtirilmoqda",
    },
    {
      title: "Vaqtinchalik havolalar",
      body: "Yopiq fayllar doimiy ochiq manzillarda e’lon qilinmasligi kerak. Vaqtinchalik havola va uning muddati mahsulotda amalga oshirilgan joylarda qo‘llanadi; alohida saqlangan imzolangan PDF arxivlanganda faol havola bekor bo‘ladi.",
      state: "Mahsulot jarayoni bilan tasdiqlangan",
    },
    {
      title: "AI-provayderlar va subprocessors",
      body: "Production provayderlari, qayta ishlash hududlari va subprocessorsning yakuniy ro‘yxati arxitektura va shartnoma shartlari tasdiqlangach e’lon qilinadi. Ungacha JURO ma’lumotlar lokalizatsiyasi yoki hujjatlarning modelni o‘qitishda ishlatilishi haqida tasdiqlanmagan bayonot bermaydi.",
      state: "Production ishga tushishidan oldin aniqlashtirilmoqda",
    },
    {
      title: "Shifrlash, jurnallash va standartlar",
      body: "JURO texnik tasdiqsiz sertifikatlar, shifrlash algoritmlari yoki standartlarga muvofiqlikni e’lon qilmaydi. Tekshirilgan ma’lumot so‘nggi tekshiruv sanasi bilan qo‘shiladi.",
      state: "Tasdiqsiz e’lon qilinmaydi",
    },
  ];

  return (
    <div className={styles.page} lang={locale}>
      <SiteHeader languageHref={`/${locale === "ru" ? "uz" : "ru"}/trust`} locale={locale} />
      <main id="main-content">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.breadcrumbs}><Link href={`/${locale}`}>JURO</Link><span>/</span><span>Trust Center</span></div>
            <span className={styles.eyebrow}>TRUST CENTER</span>
            <h1>{ru ? "Безопасность, данные и прозрачность" : "Xavfsizlik, ma’lumotlar va shaffoflik"}</h1>
            <p>{summary.body}</p>
            <small>{summary.checked}</small>
          </div>
          <aside className={styles.heroIndex} aria-label={ru ? "Карта контроля данных" : "Ma’lumotlar nazorati xaritasi"}>
            <span>{ru ? "МАРШРУТ ДАННЫХ" : "MA’LUMOTLAR YO‘LI"}</span>
            <ol>
              <li><b>01</b><strong>{ru ? "Публичный сайт" : "Ommaviy sayt"}</strong><small>{ru ? "без загрузки файлов" : "fayl yuklanmaydi"}</small></li>
              <li><b>02</b><strong>{ru ? "Защищённый аккаунт" : "Himoyalangan akkaunt"}</strong><small>{ru ? "сессия и права" : "sessiya va huquqlar"}</small></li>
              <li><b>03</b><strong>{ru ? "Передача юристу" : "Yuristga topshirish"}</strong><small>{ru ? "только с подтверждением" : "faqat tasdiq bilan"}</small></li>
            </ol>
          </aside>
        </section>

        <section className={styles.summary}>
          {summary.items.map((item) => (
            <article key={item.title}>
              <span>{item.state}</span>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </section>

        <section className={styles.architecture} aria-labelledby="trust-flow-title">
          <header>
            <span>{ru ? "КАК ДВИЖУТСЯ ДАННЫЕ" : "MA’LUMOTLAR QANDAY HARAKATLANADI"}</span>
            <h2 id="trust-flow-title">{ru ? "Контроль остаётся у пользователя на каждом переходе" : "Har bir o‘tishda nazorat foydalanuvchida qoladi"}</h2>
            <p>{ru ? "Публичная страница ничего не загружает. Работа с вопросом или документом начинается в защищённом аккаунте, а передача специалисту требует отдельного действия." : "Ommaviy sahifa hech narsa yuklamaydi. Savol yoki hujjat bilan ishlash himoyalangan akkauntda boshlanadi, mutaxassisga topshirish esa alohida harakat talab qiladi."}</p>
          </header>
          <ol>
            <li><span>01</span><strong>{ru ? "Публичный сайт" : "Ommaviy sayt"}</strong><p>{ru ? "Знакомство без реальных файлов и персональных данных." : "Haqiqiy fayl va shaxsiy ma’lumotsiz tanishish."}</p></li>
            <li><span>02</span><strong>{ru ? "Защищённый аккаунт" : "Himoyalangan akkaunt"}</strong><p>{ru ? "Сессия, роль и права определяют доступ." : "Sessiya, rol va huquqlar kirishni belgilaydi."}</p></li>
            <li><span>03</span><strong>{ru ? "Рабочий объект" : "Ish obyekti"}</strong><p>{ru ? "Вопрос, дело и документ остаются приватными." : "Savol, ish va hujjat yopiq qoladi."}</p></li>
            <li><span>04</span><strong>{ru ? "Передача юристу" : "Yuristga topshirish"}</strong><p>{ru ? "Только выбранный контекст и отдельное подтверждение." : "Faqat tanlangan kontekst va alohida tasdiq."}</p></li>
          </ol>
        </section>

        <section className={styles.details}>
          <header>
            <span>{ru ? "ПОДРОБНО" : "BATAFSIL"}</span>
            <h2>{ru ? "Что подтверждено, а что ещё уточняется" : "Nima tasdiqlangan, nima hali aniqlashtirilmoqda"}</h2>
          </header>
          <div>
            {sections.map((section) => (
              <article key={section.title}>
                <span>{section.state}</span>
                <h3>{section.title}</h3>
                <p>{section.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.policies}>
          <h2>{ru ? "Политики и правила" : "Siyosat va qoidalar"}</h2>
          <div>
            <Link href={`/${locale}/terms`}>{ru ? "Условия использования" : "Foydalanish shartlari"}</Link>
            <Link href={`/${locale}/privacy-policy`}>{ru ? "Политика конфиденциальности" : "Maxfiylik siyosati"}</Link>
            <Link href={`/${locale}/personal-data-processing`}>{ru ? "Обработка персональных данных" : "Shaxsiy ma’lumotlarni qayta ishlash"}</Link>
            <Link href={`/${locale}/cookies`}>Cookies</Link>
            <Link href={`/${locale}/ai-rules`}>{ru ? "Правила использования AI" : "AIdan foydalanish qoidalari"}</Link>
          </div>
        </section>

        <section className={styles.contact}>
          <h2>{ru ? "Вопрос по безопасности или данным?" : "Xavfsizlik yoki ma’lumotlar bo‘yicha savol bormi?"}</h2>
          <p>{ru ? "По вопросам конфиденциальности и обработки данных используйте опубликованный контакт JURO." : "Maxfiylik va ma’lumotlarni qayta ishlash bo‘yicha JUROning e’lon qilingan kontaktidan foydalaning."}</p>
          <a href={`mailto:${legalConfig.contacts.privacyEmail}`}>{ru ? "Написать по вопросам данных" : "Ma’lumotlar bo‘yicha yozish"}</a>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
