"use client";

import { Save } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type Profile = {
  id: string;
  displayName: string;
  specialties: string[];
  languages: string[];
  status: string;
  marketplaceStatus: "profile_incomplete" | "pending_review" | "public_approved" | "rejected";
  publicApprovedAt: string | null;
  experienceYears: number | null;
  priceDescription: string | null;
  availabilityStatus: "unknown" | "available" | "limited" | "unavailable";
  nextAvailableAt: string | null;
  advocateStatus: "not_declared" | "declared" | "verified";
  firmName: string | null;
  bio: string | null;
  city: string | null;
  region: string | null;
  education: string | null;
  consultationFormats: string[];
  hasPhone: boolean;
  profilePhotoUrl: string | null;
  missingRequiredFields: string[];
};

type Form = {
  displayName: string;
  specialties: string;
  languages: string;
  experienceYears: string;
  priceDescription: string;
  availabilityStatus: Profile["availabilityStatus"];
  nextAvailableAt: string;
  advocateStatus: "not_declared" | "declared";
  firmName: string;
  bio: string;
  city: string;
  region: string;
  education: string;
  consultationFormats: string;
};

const blank: Form = {
  displayName: "", specialties: "", languages: "", experienceYears: "", priceDescription: "",
  availabilityStatus: "unknown", nextAvailableAt: "", advocateStatus: "not_declared", firmName: "",
  bio: "", city: "", region: "", education: "", consultationFormats: "",
};

const toForm = (profile: Profile): Form => ({
  displayName: profile.displayName,
  specialties: profile.specialties.join(", "),
  languages: profile.languages.join(", "),
  experienceYears: profile.experienceYears === null ? "" : String(profile.experienceYears),
  priceDescription: profile.priceDescription ?? "",
  availabilityStatus: profile.availabilityStatus,
  nextAvailableAt: profile.nextAvailableAt ? profile.nextAvailableAt.slice(0, 16) : "",
  advocateStatus: profile.advocateStatus === "verified" ? "declared" : profile.advocateStatus,
  firmName: profile.firmName ?? "",
  bio: profile.bio ?? "",
  city: profile.city ?? "",
  region: profile.region ?? "",
  education: profile.education ?? "",
  consultationFormats: profile.consultationFormats.join(", "),
});

const list = (value: string) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];

export function LawyerProfessionalProfile({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/platform/lawyer-profile", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { profile?: Profile | null; error?: string };
        if (response.status === 404) {
          setUnavailable(true);
          return null;
        }
        if (!response.ok) throw new Error(body.error);
        return body.profile ?? null;
      })
      .then((value) => {
        setProfile(value);
        if (value) setForm(toForm(value));
      })
      .catch((value) => setError(value instanceof Error ? value.message : String(value)))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      displayName: form.displayName,
      specialties: list(form.specialties),
      languages: list(form.languages),
      experienceYears: form.experienceYears ? Number(form.experienceYears) : null,
      priceDescription: form.priceDescription || null,
      availabilityStatus: form.availabilityStatus,
      nextAvailableAt: form.nextAvailableAt ? new Date(form.nextAvailableAt).toISOString() : null,
      advocateStatus: form.advocateStatus,
      firmName: form.firmName || null,
      bio: form.bio || null,
      city: form.city || null,
      region: form.region || null,
      education: form.education || null,
      consultationFormats: list(form.consultationFormats),
      locale,
    };
    try {
      const result = await fetch("/api/platform/lawyer-profile", {
        method: profile ? "PATCH" : "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify(payload),
      });
      const body = await result.json() as { profile?: Profile; error?: string };
      if (!result.ok || !body.profile) throw new Error(body.error || "Ошибка");
      setProfile(body.profile);
      setForm(toForm(body.profile));
      setNotice(body.profile.marketplaceStatus === "pending_review"
        ? (ru ? "Профиль отправлен на проверку JURO." : "Profil JURO tekshiruviga yuborildi.")
        : (ru ? "Профиль сохранён. Заполните все обязательные поля, чтобы отправить его на проверку."
          : "Profil saqlandi. Tekshiruvga yuborish uchun barcha majburiy maydonlarni to‘ldiring."));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !profile) return;
    setUploadingPhoto(true);
    setError("");
    setNotice("");
    try {
      const result = await fetch("/api/platform/lawyer-profile/photo", {
        method: "POST",
        headers: { "content-type": file.type, "x-juro-csrf": "1" },
        body: file,
      });
      const body = await result.json() as {
        profilePhotoUrl?: string;
        marketplaceStatus?: Profile["marketplaceStatus"];
        missingRequiredFields?: string[];
        error?: string;
      };
      if (!result.ok || !body.profilePhotoUrl || !body.marketplaceStatus) {
        throw new Error(body.error || "Ошибка");
      }
      setProfile((current) => current ? {
        ...current,
        profilePhotoUrl: body.profilePhotoUrl ?? current.profilePhotoUrl,
        marketplaceStatus: body.marketplaceStatus ?? current.marketplaceStatus,
        missingRequiredFields: body.missingRequiredFields ?? current.missingRequiredFields,
      } : current);
      setNotice(ru
        ? "Фото сохранено в приватном хранилище. Теперь сохраните профиль для проверки обязательных полей."
        : "Rasm xususiy saqlash joyiga saqlandi. Majburiy maydonlarni tekshirish uchun profilni saqlang.");
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setUploadingPhoto(false);
      event.target.value = "";
    }
  }

  if (loading) return <section className="profile-panels" aria-busy="true"><section><p>{ru ? "Загрузка профессионального профиля…" : "Professional profil yuklanmoqda…"}</p></section></section>;
  if (unavailable) return null;

  return <section className="profile-panels lawyer-professional-profile">
    <section>
      <h2>{ru ? "Профессиональный профиль юриста" : "Yuristning professional profili"}</h2>
      <p>{ru
        ? "Телефон хранится в защищённом профиле и не публикуется в каталоге. Запись открывается только после отдельного одобрения JURO."
        : "Telefon himoyalangan profilda saqlanadi va katalogda ko‘rsatilmaydi. So‘rov faqat JURO alohida tasdiqlagandan keyin ochiladi."}</p>
      <p>{ru
        ? "Статус адвоката «подтверждён» нельзя установить самостоятельно: его присваивает только JURO после проверки."
        : "«Tasdiqlangan» advokat maqomini mustaqil belgilab bo‘lmaydi: uni faqat JURO tekshiruvdan keyin beradi."}</p>
      {profile && <p>{ru ? `Статус каталога: ${profile.marketplaceStatus}` : `Katalog holati: ${profile.marketplaceStatus}`}</p>}
      {error && <p className="profile-message error" role="alert">{error}</p>}
      {notice && <p className="profile-message success" role="status">{notice}</p>}
      <form className="profile-form" onSubmit={(event) => void save(event)}>
        <section className="lawyer-profile-photo">
          <label>{ru ? "Фото профиля (JPEG, PNG или WebP до 2 МБ)" : "Profil rasmi (2 MB gacha JPEG, PNG yoki WebP)"}
            {profile?.profilePhotoUrl && <Image src={profile.profilePhotoUrl} alt="" width={72} height={72} unoptimized />}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadPhoto(event)} disabled={!profile || uploadingPhoto} />
            {uploadingPhoto && <span>{ru ? "Загружаем фото…" : "Rasm yuklanmoqda…"}</span>}
          </label>
          <label>{ru ? "Отображаемое имя" : "Ko‘rsatiladigan ism"}<input required maxLength={160} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
          <label>{ru ? "Город" : "Shahar"}<input required maxLength={100} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
          <label>{ru ? "Регион" : "Hudud"}<input required maxLength={100} value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></label>
          <label>{ru ? "Специализации через запятую" : "Mutaxassisliklar, vergul bilan"}<input required value={form.specialties} onChange={(event) => setForm({ ...form, specialties: event.target.value })} /></label>
          <label>{ru ? "Языки через запятую" : "Tillar, vergul bilan"}<input required value={form.languages} onChange={(event) => setForm({ ...form, languages: event.target.value })} /></label>
          <label>{ru ? "Стаж, лет" : "Tajriba, yil"}<input required type="number" min="0" max="99" value={form.experienceYears} onChange={(event) => setForm({ ...form, experienceYears: event.target.value })} /></label>
        </section>
        <section>
          <label>{ru ? "Образование" : "Ta’lim"}<input required maxLength={500} value={form.education} onChange={(event) => setForm({ ...form, education: event.target.value })} /></label>
          <label>{ru ? "Фирма или место работы" : "Firma yoki ish joyi"}<input required maxLength={180} value={form.firmName} onChange={(event) => setForm({ ...form, firmName: event.target.value })} /></label>
          <label>{ru ? "Форматы консультаций через запятую" : "Maslahat formatlari, vergul bilan"}<input required value={form.consultationFormats} onChange={(event) => setForm({ ...form, consultationFormats: event.target.value })} placeholder={ru ? "Чат, телефон, очно" : "Chat, telefon, oflayn"} /></label>
          <label>{ru ? "Доступность" : "Mavjudlik"}<select required value={form.availabilityStatus} onChange={(event) => setForm({ ...form, availabilityStatus: event.target.value as Form["availabilityStatus"] })}><option value="unknown">{ru ? "Выберите доступность" : "Mavjudlikni tanlang"}</option><option value="available">{ru ? "Доступен" : "Mavjud"}</option><option value="limited">{ru ? "Ограниченная" : "Cheklangan"}</option><option value="unavailable">{ru ? "Недоступен" : "Mavjud emas"}</option></select></label>
          <label>{ru ? "Ближайшая доступность" : "Eng yaqin mavjudlik"}<input type="datetime-local" value={form.nextAvailableAt} onChange={(event) => setForm({ ...form, nextAvailableAt: event.target.value })} /></label>
          <label>{ru ? "Статус адвоката" : "Advokat maqomi"}<select value={form.advocateStatus} onChange={(event) => setForm({ ...form, advocateStatus: event.target.value as Form["advocateStatus"] })}><option value="not_declared">{ru ? "Не заявлен" : "Bildirilmagan"}</option><option value="declared">{ru ? "Заявлен, не подтверждён JURO" : "Bildirilgan, JURO tasdiqlamagan"}</option></select></label>
          <label>{ru ? "Описание цены" : "Narx tavsifi"}<input required maxLength={280} value={form.priceDescription} onChange={(event) => setForm({ ...form, priceDescription: event.target.value })} /></label>
          <label>{ru ? "О себе" : "O‘zingiz haqingizda"}<textarea maxLength={2000} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
        </section>
        <button type="submit" disabled={saving || uploadingPhoto || list(form.specialties).length === 0 || list(form.languages).length === 0 || list(form.consultationFormats).length === 0}>
          {!saving && <Save aria-hidden="true" />}{ru ? "Сохранить и проверить профиль" : "Profilni saqlash va tekshirish"}
        </button>
      </form>
    </section>
  </section>;
}
