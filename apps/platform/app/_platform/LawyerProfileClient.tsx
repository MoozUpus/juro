"use client";

import { useEffect, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type Lawyer = {
  displayName: string; specialties: string[]; languages: string[]; experienceYears: number | null;
  priceDescription: string | null; availabilityStatus: string; nextAvailableAt: string | null;
  advocateStatus: string; firmName: string | null; bio: string | null;
  marketplaceStatus: "pending_review" | "public_approved"; canReceiveRequests: boolean;
  rating: { reviewCount: number; overallAverage: number | null };
  reviews: Array<{ id: string; overallRating: number; body: string | null; createdAt: string; reply: { body: string; createdAt: string | null } | null }>;
};

const availability: Record<string, [string, string]> = {
  available: ["Доступен", "Mavjud"], limited: ["Ограниченная доступность", "Cheklangan mavjudlik"],
  unavailable: ["Недоступен", "Mavjud emas"], unknown: ["Доступность не указана", "Mavjudlik ko‘rsatilmagan"],
};

export function LawyerProfileClient({ locale, lawyerId }: { locale: PlatformLocale; lawyerId: string }) {
  const ru = locale === "ru";
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
  return <section className="platform-module"><header><div><small>JURO</small><h1>{lawyer.displayName}</h1>{pending && <p className="lawyer-pending-review" role="status">{ru ? "Профиль на проверке JURO · запись пока недоступна" : "Profil JURO tekshiruvida · hozircha so‘rov yuborib bo‘lmaydi"}</p>}<p>{lawyer.specialties.join(", ")}</p><p>{lawyer.languages.join(" · ")}</p>{lawyer.firmName && <p>{lawyer.firmName}</p>}{lawyer.experienceYears !== null && <p>{ru ? `${lawyer.experienceYears} лет опыта` : `${lawyer.experienceYears} yil tajriba`}</p>}<p>{availability[lawyer.availabilityStatus]?.[ru ? 0 : 1]}</p>{lawyer.nextAvailableAt && <p>{ru ? "Ближайшая доступность: " : "Eng yaqin mavjudlik: "}<time dateTime={lawyer.nextAvailableAt}>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(lawyer.nextAvailableAt))}</time></p>}{lawyer.priceDescription && <p>{ru ? "Стоимость: " : "Narx: "}{lawyer.priceDescription}</p>}{lawyer.advocateStatus === "verified" && <p>{ru ? "Статус адвоката подтверждён JURO." : "Advokat maqomi JURO tomonidan tasdiqlangan."}</p>}{lawyer.advocateStatus === "declared" && <p>{ru ? "Статус адвоката заявлен специалистом и не подтверждён JURO." : "Advokat maqomi mutaxassis tomonidan bildirilgan, JURO tomonidan tasdiqlanmagan."}</p>}{lawyer.bio && <p>{lawyer.bio}</p>}<p>{lawyer.rating.reviewCount ? `${lawyer.rating.overallAverage?.toFixed(1)}/5 · ${lawyer.rating.reviewCount}` : (ru ? "Пока нет одобренных отзывов" : "Hozircha tasdiqlangan fikrlar yo‘q")}</p></div></header><div>{lawyer.reviews.map((review) => <article key={review.id}><strong>{review.overallRating}/5</strong>{review.body && <p>{review.body}</p>}<time dateTime={review.createdAt}>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(review.createdAt))}</time>{review.reply && <aside className="lawyer-review-reply" aria-label={ru ? "Ответ юриста" : "Yurist javobi"}><strong>{ru ? "Ответ юриста" : "Yurist javobi"}</strong><p>{review.reply.body}</p>{review.reply.createdAt && <time dateTime={review.reply.createdAt}>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(review.reply.createdAt))}</time>}</aside>}</article>)}</div></section>;
}
