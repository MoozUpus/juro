import Link from "next/link";
import type { PublicLawyer } from "./catalog";
import { publicPhotoUrl } from "./catalog";
import styles from "./lawyers.module.css";

export function LawyerCard({ lawyer, locale }: { lawyer: PublicLawyer; locale: "ru" | "uz" }) {
  const ru = locale === "ru";
  const pending = lawyer.marketplaceStatus === "pending_review";
  const profileHref = `/${locale}/lawyers/${encodeURIComponent(lawyer.id)}`;
  const consultationHref = `https://app.juro.uz/${locale}/individual/consultations?lawyer=${encodeURIComponent(lawyer.id)}`;
  const photo = publicPhotoUrl(lawyer.profilePhotoUrl);
  return <article className={styles.card} data-pending={pending || undefined}>
    <div className={styles.cardHead}>
      {photo ? <img className={styles.photo} src={photo} alt="" width={64} height={64} /> : <span className={styles.initials} aria-hidden="true">{lawyer.displayName.slice(0, 1)}</span>}
      <div><h2>{lawyer.displayName}</h2><p>{lawyer.firmName || (ru ? "Независимый специалист" : "Mustaqil mutaxassis")}</p></div>
    </div>
    <div className={styles.badges}>
      {pending ? <span className={styles.pending}>{ru ? "Профиль проверяется JURO" : "Profil JURO tomonidan tekshirilmoqda"}</span> : <span className={styles.approved}>{ru ? "Одобрен JURO" : "JURO tasdiqlagan"}</span>}
      {lawyer.advocateStatus === "verified" && <span className={styles.advocate}>{ru ? "Статус адвоката подтверждён" : "Advokat maqomi tasdiqlangan"}</span>}
    </div>
    <p className={styles.specialties}>{lawyer.specialties.join(" · ")}</p>
    <dl className={styles.facts}>
      {lawyer.city && <div><dt>{ru ? "Город" : "Shahar"}</dt><dd>{[lawyer.city, lawyer.region].filter(Boolean).join(", ")}</dd></div>}
      {lawyer.experienceYears !== null && <div><dt>{ru ? "Опыт" : "Tajriba"}</dt><dd>{ru ? `${lawyer.experienceYears} лет` : `${lawyer.experienceYears} yil`}</dd></div>}
      <div><dt>{ru ? "Языки" : "Tillar"}</dt><dd>{lawyer.languages.join(", ")}</dd></div>
      {lawyer.priceDescription && <div><dt>{ru ? "Стоимость" : "Narx"}</dt><dd>{lawyer.priceDescription}</dd></div>}
    </dl>
    {lawyer.rating.reviewCount > 0 && lawyer.rating.overallAverage !== null ? <p className={styles.rating}>★ {lawyer.rating.overallAverage.toFixed(1)} / 5 · {lawyer.rating.reviewCount}</p> : <p className={styles.noRating}>{ru ? "Рейтинг появится после 3 одобренных отзывов" : "Reyting 3 ta tasdiqlangan fikrdan keyin ko‘rinadi"}</p>}
    <div className={styles.actions}><Link href={profileHref}>{ru ? "Профиль" : "Profil"}</Link>{pending ? <span aria-disabled="true">{ru ? "Запись после проверки" : "Tekshiruvdan keyin"}</span> : <a className={styles.primary} href={consultationHref}>{ru ? "Оставить заявку" : "So‘rov qoldirish"}</a>}</div>
  </article>;
}
