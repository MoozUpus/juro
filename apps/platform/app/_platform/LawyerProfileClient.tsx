"use client";

import Link from "next/link";
import Image from "next/image";
import { CalendarClock, Crown, ShieldCheck, Star, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

type Lawyer = {
  displayName: string; specialties: string[]; languages: string[]; experienceYears: number | null;
  priceDescription: string | null; availabilityStatus: string; nextAvailableAt: string | null;
  advocateStatus: string; firmName: string | null; bio: string | null;
  marketplaceStatus: "pending_review" | "public_approved"; canReceiveRequests: boolean;
  profilePhotoUrl: string | null; city: string | null; region: string | null; education: string | null; consultationFormats: string[];
  juroApproved: boolean; topLawyer: boolean; topLawyerCriteria: string | null;
  rating: { reviewCount: number; overallAverage: number | null };
  reviews: Array<{ id: string; overallRating: number; body: string | null; createdAt: string; reply: { body: string; createdAt: string | null } | null }>;
};

const availability: Record<string, [string, string]> = {
  available: ["Доступен", "Mavjud"], limited: ["Ограниченная доступность", "Cheklangan mavjudlik"],
  unavailable: ["Недоступен", "Mavjud emas"], unknown: ["Доступность не указана", "Mavjudlik ko‘rsatilmagan"],
};

export function LawyerProfileClient({ locale, lawyerId }: { locale: PlatformLocale; lawyerId: string }) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const [lawyer, setLawyer] = useState<Lawyer | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/platform/lawyers/${encodeURIComponent(lawyerId)}`, { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ lawyer: Lawyer }>; })
      .then((value) => setLawyer(value.lawyer)).catch(() => setFailed(true));
  }, [lawyerId]);
  if (failed) return <section className="platform-module"><h1>{ru ? "Юрист недоступен" : "Yurist mavjud emas"}</h1></section>;
  if (!lawyer) return <section className="platform-module" aria-busy="true"><p>{ru ? "Загрузка…" : "Yuklanmoqda…"}</p></section>;
  const pending = !lawyer.canReceiveRequests;
  const date = (value: string) => new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value));
  return <section className={`platform-module lawyer-public-profile${lawyer.juroApproved ? " is-juro-approved" : ""}${lawyer.topLawyer ? " is-top-lawyer" : ""}`}>
    <header className="lawyer-public-profile-hero">
      <div className="lawyer-public-photo">{lawyer.profilePhotoUrl ? <Image src={lawyer.profilePhotoUrl} alt={`Фото: ${lawyer.displayName}`} width={144} height={144} unoptimized /> : <UserRound aria-hidden="true" />}</div>
      <div className="lawyer-public-identity"><small>JURO · MARKETPLACE</small><h1>{lawyer.displayName}</h1><p>{lawyer.firmName || (ru ? "Независимый специалист" : "Mustaqil mutaxassis")}</p><div className="lawyer-trust-badges">{lawyer.juroApproved && <span className="lawyer-juro-approved"><ShieldCheck aria-hidden="true" />{ru ? "Одобрен JURO" : "JURO tomonidan ma’qullangan"}</span>}{lawyer.topLawyer && <span className="lawyer-top"><Crown aria-hidden="true" />{ru ? "Top Lawyer" : "Top yurist"}</span>}{lawyer.advocateStatus === "verified" && <span className="lawyer-verified"><ShieldCheck aria-hidden="true" />{ru ? "Статус адвоката подтверждён" : "Advokat maqomi tasdiqlangan"}</span>}</div>{pending && <p className="lawyer-pending-review" role="status">{ru ? "Профиль на проверке JURO · запись пока недоступна" : "Profil JURO tekshiruvida · hozircha so‘rov yuborib bo‘lmaydi"}</p>}</div>
      <aside className="lawyer-public-booking"><strong>{lawyer.priceDescription || (ru ? "Стоимость уточняется" : "Narx aniqlashtirilmoqda")}</strong><span>{availability[lawyer.availabilityStatus]?.[ru ? 0 : 1]}</span>{pending ? <span aria-disabled="true">{ru ? "Запись после проверки" : "Tekshiruvdan keyin"}</span> : <Link className="primary" href={`${base}/consultations?lawyer=${encodeURIComponent(lawyerId)}`}><CalendarClock aria-hidden="true" />{ru ? "Выбрать для заявки" : "So‘rov uchun tanlash"}</Link>}</aside>
    </header>
    <div className="lawyer-public-profile-grid"><section><h2>{ru ? "О специалисте" : "Mutaxassis haqida"}</h2>{lawyer.bio ? <p>{lawyer.bio}</p> : <p>{ru ? "Описание пока не добавлено." : "Tavsif hali qo‘shilmagan."}</p>}{lawyer.topLawyer && <p className="lawyer-top-criteria"><strong>{ru ? "Критерии Top Lawyer: " : "Top yurist mezonlari: "}</strong>{lawyer.topLawyerCriteria || (ru ? "статус присваивается отдельным решением JURO по опубликованным проверенным критериям." : "maqom JUROning alohida qarori bilan e’lon qilingan tekshirilgan mezonlar asosida beriladi.")}</p>}</section><section><h2>{ru ? "Профиль" : "Profil"}</h2><dl><div><dt>{ru ? "Специализации" : "Mutaxassisliklar"}</dt><dd>{lawyer.specialties.join(", ") || "—"}</dd></div><div><dt>{ru ? "Языки" : "Tillar"}</dt><dd>{lawyer.languages.join(" · ") || "—"}</dd></div>{lawyer.experienceYears !== null && <div><dt>{ru ? "Опыт" : "Tajriba"}</dt><dd>{ru ? `${lawyer.experienceYears} лет` : `${lawyer.experienceYears} yil`}</dd></div>}{lawyer.city && <div><dt>{ru ? "Город" : "Shahar"}</dt><dd>{[lawyer.city, lawyer.region].filter(Boolean).join(", ")}</dd></div>}{lawyer.education && <div><dt>{ru ? "Образование" : "Ta’lim"}</dt><dd>{lawyer.education}</dd></div>}{lawyer.consultationFormats.length > 0 && <div><dt>{ru ? "Формат" : "Format"}</dt><dd>{lawyer.consultationFormats.join(", ")}</dd></div>}{lawyer.nextAvailableAt && <div><dt>{ru ? "Ближайший слот" : "Eng yaqin vaqt"}</dt><dd><time dateTime={lawyer.nextAvailableAt}>{date(lawyer.nextAvailableAt)}</time></dd></div>}</dl></section></div>
    <section className="lawyer-public-reviews"><h2><Star aria-hidden="true" />{ru ? "Отзывы" : "Fikrlar"}</h2><p>{lawyer.rating.reviewCount ? `${lawyer.rating.overallAverage?.toFixed(1)}/5 · ${lawyer.rating.reviewCount}` : (ru ? "Пока нет одобренных отзывов" : "Hozircha tasdiqlangan fikrlar yo‘q")}</p>{lawyer.reviews.map((review) => <article key={review.id}><strong>{review.overallRating}/5</strong>{review.body && <p>{review.body}</p>}<time dateTime={review.createdAt}>{date(review.createdAt)}</time>{review.reply && <aside className="lawyer-review-reply" aria-label={ru ? "Ответ юриста" : "Yurist javobi"}><strong>{ru ? "Ответ юриста" : "Yurist javobi"}</strong><p>{review.reply.body}</p>{review.reply.createdAt && <time dateTime={review.reply.createdAt}>{date(review.reply.createdAt)}</time>}</aside>}</article>)}</section>
  </section>;
}
