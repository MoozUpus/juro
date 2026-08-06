"use client";

import Link from "next/link";
import Image from "next/image";
import { CircleAlert, LoaderCircle, Scale, ShieldCheck, Star, UserRoundCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { platformBasePath, type AccountType, type PlatformLocale } from "../../lib/platform/routing";

type Lawyer = {
  id: string;
  displayName: string;
  specialties: string[];
  languages: string[];
  experienceYears: number | null;
  priceDescription: string | null;
  availabilityStatus: "unknown" | "available" | "limited" | "unavailable";
  nextAvailableAt: string | null;
  advocateStatus: "not_declared" | "declared" | "verified";
  firmName: string | null;
  bio: string | null;
  marketplaceStatus: "public_approved";
  canReceiveRequests: true;
  city: string | null;
  region: string | null;
  education: string | null;
  consultationFormats: string[];
  profilePhotoUrl: string | null;
  rating: { reviewCount: number; overallAverage: number | null };
};

const availability: Record<Lawyer["availabilityStatus"], [string, string]> = {
  available: ["Доступен", "Mavjud"],
  limited: ["Ограниченная доступность", "Cheklangan mavjudlik"],
  unavailable: ["Недоступен", "Mavjud emas"],
  unknown: ["Доступность не указана", "Mavjudlik ko‘rsatilmagan"],
};

export function LawyerDirectoryClient({ locale, accountType, workspaceId }: { locale: PlatformLocale; accountType: AccountType; workspaceId?: string }) {
  const ru = locale === "ru";
  const base = platformBasePath(locale, accountType, workspaceId);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [minimumRating, setMinimumRating] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/platform/lawyers", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { lawyers?: Lawyer[]; error?: string };
        if (!response.ok) throw new Error(body.error || "LAWYER_DIRECTORY_UNAVAILABLE");
        if (active) setLawyers(body.lawyers ?? []);
      })
      .catch((value) => active && setError(value instanceof Error ? value.message : String(value)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const specialties = useMemo(() => [...new Set(lawyers.flatMap((lawyer) => lawyer.specialties))].sort((a, b) => a.localeCompare(b)), [lawyers]);
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return lawyers.filter((lawyer) => {
      const searchable = [lawyer.displayName, lawyer.firmName, lawyer.bio, ...lawyer.specialties, ...lawyer.languages]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      return (!normalized || searchable.includes(normalized))
        && (!specialty || lawyer.specialties.includes(specialty))
        && (!availabilityFilter || lawyer.availabilityStatus === availabilityFilter)
        && (!minimumRating || (lawyer.rating.overallAverage ?? 0) >= Number(minimumRating));
    });
  }, [availabilityFilter, lawyers, minimumRating, query, specialty]);
  function card(lawyer: Lawyer) {
    return <article key={lawyer.id} className="lawyer-directory-card">
      <div className="lawyer-directory-card-head"><div className="lawyer-directory-identity">{lawyer.profilePhotoUrl && <Image src={lawyer.profilePhotoUrl} alt="" width={48} height={48} unoptimized />}<div><h2>{lawyer.displayName}</h2><p>{lawyer.firmName || (ru ? "Независимый специалист" : "Mustaqil mutaxassis")}</p></div></div>{lawyer.advocateStatus === "verified" && <span className="lawyer-verified"><ShieldCheck aria-hidden="true" />{ru ? "Проверено JURO" : "JURO tasdiqlagan"}</span>}</div>
      <p className="lawyer-directory-specialties">{lawyer.specialties.join(" · ") || (ru ? "Специализация уточняется" : "Mutaxassislik aniqlashtirilmoqda")}</p>
      <dl><div><dt>{ru ? "Языки" : "Tillar"}</dt><dd>{lawyer.languages.join(", ") || "—"}</dd></div>{lawyer.city && <div><dt>{ru ? "Город" : "Shahar"}</dt><dd>{[lawyer.city, lawyer.region].filter(Boolean).join(", ")}</dd></div>}<div><dt>{ru ? "Доступность" : "Mavjudlik"}</dt><dd>{availability[lawyer.availabilityStatus][ru ? 0 : 1]}</dd></div>{lawyer.experienceYears !== null && <div><dt>{ru ? "Опыт" : "Tajriba"}</dt><dd>{ru ? `${lawyer.experienceYears} лет` : `${lawyer.experienceYears} yil`}</dd></div>}{lawyer.priceDescription && <div><dt>{ru ? "Цена" : "Narx"}</dt><dd>{lawyer.priceDescription}</dd></div>}</dl>
      <p className="lawyer-rating"><Star aria-hidden="true" />{lawyer.rating.reviewCount && lawyer.rating.overallAverage !== null ? `${lawyer.rating.overallAverage.toFixed(1)}/5 · ${lawyer.rating.reviewCount}` : (ru ? "Нет одобренных отзывов" : "Tasdiqlangan fikrlar yo‘q")}</p>
      <div className="lawyer-directory-actions"><Link href={`${base}/lawyers/${encodeURIComponent(lawyer.id)}`}>{ru ? "Профиль" : "Profil"}</Link><Link className="primary" href={`${base}/consultations?lawyer=${encodeURIComponent(lawyer.id)}`}>{ru ? "Выбрать для заявки" : "So‘rov uchun tanlash"}</Link></div>
    </article>;
  }

  return <section className="lawyer-directory" aria-labelledby="lawyer-directory-heading">
    <header className="lawyer-directory-hero">
      <Scale aria-hidden="true" />
      <div><span>JURO · MARKETPLACE</span><h1 id="lawyer-directory-heading">{ru ? "Юристы и адвокаты" : "Yuristlar va advokatlar"}</h1><p>{ru ? "Для заявки доступны только профили, отдельно одобренные JURO. Передача материалов дела всегда требует вашего подтверждения." : "So‘rov uchun faqat JURO alohida tasdiqlagan profillar mavjud. Ish materiallarini topshirish doimo sizning tasdig‘ingizni talab qiladi."}</p></div>
    </header>

    <form className="lawyer-directory-controls" onSubmit={(event) => event.preventDefault()} aria-label={ru ? "Фильтры каталога" : "Katalog filtrlari"}>
      <label><span>{ru ? "Поиск" : "Qidiruv"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={160} placeholder={ru ? "Имя, специализация, фирма" : "Ism, mutaxassislik, firma"} /></label>
      <label><span>{ru ? "Специализация" : "Mutaxassislik"}</span><select value={specialty} onChange={(event) => setSpecialty(event.target.value)}><option value="">{ru ? "Все направления" : "Barcha yo‘nalishlar"}</option>{specialties.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label><span>{ru ? "Доступность" : "Mavjudlik"}</span><select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}><option value="">{ru ? "Любая" : "Istalgan"}</option><option value="available">{availability.available[ru ? 0 : 1]}</option><option value="limited">{availability.limited[ru ? 0 : 1]}</option></select></label>
      <label><span>{ru ? "Рейтинг" : "Reyting"}</span><select value={minimumRating} onChange={(event) => setMinimumRating(event.target.value)}><option value="">{ru ? "Любой" : "Istalgan"}</option><option value="4">4.0+</option><option value="4.5">4.5+</option></select></label>
    </form>

    {loading && <p className="lawyer-directory-state" aria-busy="true"><LoaderCircle className="spin" aria-hidden="true" />{ru ? "Загружаем одобренные профили…" : "Tasdiqlangan profillar yuklanmoqda…"}</p>}
    {error && <p className="lawyer-directory-state error" role="alert"><CircleAlert aria-hidden="true" />{ru ? "Каталог временно недоступен. Попробуйте обновить страницу." : "Katalog vaqtincha mavjud emas. Sahifani yangilang."}</p>}
    {!loading && !error && <p className="lawyer-directory-count" role="status">{ru ? `Найдено специалистов: ${results.length}` : `Topilgan mutaxassislar: ${results.length}`}</p>}
    {!loading && !error && results.length === 0 && <section className="lawyer-directory-empty"><UserRoundCheck aria-hidden="true" /><h2>{ru ? "Пока нет подходящих профилей" : "Hozircha mos profillar yo‘q"}</h2><p>{ru ? "Измените фильтры или создайте заявку — JURO сможет подобрать специалиста после проверки конфликта интересов." : "Filtrlarni o‘zgartiring yoki so‘rov yarating — JURO manfaatlar to‘qnashuvini tekshirgandan keyin mutaxassis tanlay oladi."}</p><Link href={`${base}/consultations`} className="lawyer-directory-link">{ru ? "Создать заявку" : "So‘rov yaratish"}</Link></section>}
    <div className="lawyer-directory-grid">{results.map(card)}</div>
  </section>;
}
