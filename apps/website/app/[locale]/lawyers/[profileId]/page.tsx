import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicLawyer, publicPhotoUrl } from "../catalog";
import styles from "../lawyers.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; profileId: string }> };
function localeOf(value: string) { return value === "ru" || value === "uz" ? value : null; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, profileId } = await params;
  const locale = localeOf(rawLocale);
  if (!locale) return {};
  const lawyer = await getPublicLawyer(profileId);
  if (!lawyer) return {};
  const pending = lawyer.marketplaceStatus === "pending_review";
  return { title: lawyer.displayName, description: lawyer.bio || lawyer.specialties.join(", "), robots: { index: !pending, follow: true }, alternates: { canonical: `https://juro.uz/${locale}/lawyers/${lawyer.id}` } };
}

export default async function LawyerProfilePage({ params }: Props) {
  const { locale: rawLocale, profileId } = await params;
  const locale = localeOf(rawLocale);
  if (!locale) notFound();
  const lawyer = await getPublicLawyer(profileId);
  if (!lawyer) notFound();
  const ru = locale === "ru";
  const pending = lawyer.marketplaceStatus === "pending_review";
  const photo = publicPhotoUrl(lawyer.profilePhotoUrl);
  return <main className={styles.page} lang={locale}><header className={styles.header}><Link href="/"><img src="/juro-logo-primary.png" alt="JURO" /></Link><nav><Link href={`/${locale}/lawyers`}>{ru ? "Все юристы" : "Barcha yuristlar"}</Link><Link href={`/${locale === "ru" ? "uz" : "ru"}/lawyers/${lawyer.id}`}>{ru ? "O‘zbekcha" : "Русский"}</Link></nav></header><article className={styles.profile}>
    <Link className={styles.back} href={`/${locale}/lawyers`}>← {ru ? "Каталог юристов" : "Yuristlar katalogi"}</Link>
    <div className={styles.profileHead}>{photo ? <img className={styles.profilePhoto} src={photo} alt="" width={144} height={144} /> : <span className={styles.profileInitials} aria-hidden="true">{lawyer.displayName.slice(0, 1)}</span>}<div><span className={pending ? styles.pending : styles.approved}>{pending ? (ru ? "ПРОФИЛЬ НА ПРОВЕРКЕ JURO" : "PROFIL JURO TEKSHIRUVIDA") : (ru ? "ОДОБРЕН JURO" : "JURO TASDIQLAGAN")}</span><h1>{lawyer.displayName}</h1><p>{lawyer.firmName || (ru ? "Независимый специалист" : "Mustaqil mutaxassis")}</p><p className={styles.specialties}>{lawyer.specialties.join(" · ")}</p></div></div>
    {pending && <aside className={styles.reviewNotice}>{ru ? "Профиль уже публичный, но запись станет доступна только после завершения проверки JURO." : "Profil ochiq, biroq so‘rov yuborish faqat JURO tekshiruvi tugagandan keyin mumkin."}</aside>}
    <div className={styles.profileGrid}><section><h2>{ru ? "О специалисте" : "Mutaxassis haqida"}</h2><p>{lawyer.bio || (ru ? "Профессиональная информация уточняется." : "Kasbiy ma’lumot aniqlashtirilmoqda.")}</p>{lawyer.education && <><h2>{ru ? "Образование" : "Ta’lim"}</h2><p>{lawyer.education}</p></>}</section><aside><dl className={styles.detailFacts}><div><dt>{ru ? "Языки" : "Tillar"}</dt><dd>{lawyer.languages.join(", ")}</dd></div>{lawyer.city && <div><dt>{ru ? "Город" : "Shahar"}</dt><dd>{[lawyer.city, lawyer.region].filter(Boolean).join(", ")}</dd></div>}{lawyer.experienceYears !== null && <div><dt>{ru ? "Опыт" : "Tajriba"}</dt><dd>{ru ? `${lawyer.experienceYears} лет` : `${lawyer.experienceYears} yil`}</dd></div>}{lawyer.priceDescription && <div><dt>{ru ? "Стоимость" : "Narx"}</dt><dd>{lawyer.priceDescription}</dd></div>}<div><dt>{ru ? "Формат" : "Format"}</dt><dd>{lawyer.consultationFormats.join(", ") || "—"}</dd></div></dl>{!pending && <a className={styles.profileCta} href={`https://app.juro.uz/${locale}/individual/consultations?lawyer=${encodeURIComponent(lawyer.id)}`}>{ru ? "Оставить заявку" : "So‘rov qoldirish"}</a>}</aside></div>
    <section className={styles.privacy}><h2>{ru ? "Конфиденциальность до передачи дела" : "Ish topshirilishidan oldingi maxfiylik"}</h2><p>{ru ? "Контактные данные не публикуются. Юрист получает ограниченное описание для проверки конфликта интересов; материалы дела передаются только после вашего отдельного подтверждения." : "Kontakt ma’lumotlari ochiq e’lon qilinmaydi. Yurist manfaatlar to‘qnashuvini tekshirish uchun cheklangan tavsif oladi; ish materiallari faqat alohida tasdiqlashingizdan keyin beriladi."}</p></section>
  </article></main>;
}
