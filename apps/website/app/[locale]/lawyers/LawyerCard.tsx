import Link from "next/link";
import type { PublicLawyer } from "./catalog";
import type { PublicLanguage } from "../../../content/types";
import { publicPhotoUrl } from "./catalog";
import { LawyerAvatar } from "./LawyerAvatar";
import styles from "./lawyers.module.css";

export function LawyerCard({ lawyer, locale }: { lawyer: PublicLawyer; locale: PublicLanguage }) {
  const ru = locale === "ru";
  const en = locale === "en";
  const t = en ? { independent: "Independent professional", pending: "Profile details are being completed", newProfile: "New profile", advocate: "Advocate status verified", city: "City", experience: "Experience", languages: "Languages", price: "Price", noRating: "A rating appears after 3 approved reviews", profile: "Profile", appointment: "Requests after completion", request: "Request a consultation", years: "years" } : ru ? { independent: "Независимый специалист", pending: "Профиль дополняется", newProfile: "Новый профиль", advocate: "Статус адвоката подтверждён", city: "Город", experience: "Опыт", languages: "Языки", price: "Стоимость", noRating: "Рейтинг появится после 3 одобренных отзывов", profile: "Профиль", appointment: "Заявки после заполнения", request: "Оставить заявку", years: "лет" } : { independent: "Mustaqil mutaxassis", pending: "Profil ma’lumotlari to‘ldirilmoqda", newProfile: "Yangi profil", advocate: "Advokat maqomi tasdiqlangan", city: "Shahar", experience: "Tajriba", languages: "Tillar", price: "Narx", noRating: "Reyting 3 ta tasdiqlangan fikrdan keyin ko‘rinadi", profile: "Profil", appointment: "To‘ldirilgandan keyin", request: "So‘rov qoldirish", years: "yil" };
  const pending = lawyer.marketplaceStatus === "pending_review";
  const profileHref = `/${locale}/lawyers/${encodeURIComponent(lawyer.id)}`;
  const consultationHref = `https://app.juro.uz/${locale === "en" ? "ru" : locale}/individual/consultations?lawyer=${encodeURIComponent(lawyer.id)}`;
  const photo = publicPhotoUrl(lawyer.profilePhotoUrl);
  return <article className={styles.card} data-pending={pending || undefined}>
    <div className={styles.cardHead}>
      <LawyerAvatar className={styles.photo} fallbackClassName={styles.initials} initials={lawyer.displayName.slice(0, 1)} size={64} src={photo} />
      <div><h2>{lawyer.displayName}</h2><p>{lawyer.firmName || t.independent}</p></div>
    </div>
    <div className={styles.badges}>
      <span className={styles.pending}>{pending ? t.pending : t.newProfile}</span>
      {lawyer.advocateStatus === "verified" && <span className={styles.advocate}>{t.advocate}</span>}
    </div>
    <p className={styles.specialties}>{lawyer.specialties.join(" · ")}</p>
    <dl className={styles.facts}>
      {lawyer.city && <div><dt>{t.city}</dt><dd>{[lawyer.city, lawyer.region].filter(Boolean).join(", ")}</dd></div>}
      {lawyer.experienceYears !== null && <div><dt>{t.experience}</dt><dd>{`${lawyer.experienceYears} ${t.years}`}</dd></div>}
      <div><dt>{t.languages}</dt><dd>{lawyer.languages.join(", ")}</dd></div>
      {lawyer.priceDescription && <div><dt>{t.price}</dt><dd>{lawyer.priceDescription}</dd></div>}
    </dl>
    {lawyer.rating.reviewCount > 0 && lawyer.rating.overallAverage !== null ? <p className={styles.rating}>★ {lawyer.rating.overallAverage.toFixed(1)} / 5 · {lawyer.rating.reviewCount}</p> : <p className={styles.noRating}>{t.noRating}</p>}
    <div className={styles.actions}><Link href={profileHref}>{t.profile}</Link>{pending ? <span aria-disabled="true">{t.appointment}</span> : <a className={styles.primary} href={consultationHref}>{t.request}</a>}</div>
  </article>;
}
