"use client";

import { Check, Send, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

type Profile = {
  id: string;
  displayName: string;
  specialties: string[];
  languages: string[];
  status: string;
  marketplaceStatus:
    | "profile_incomplete"
    | "pending_review"
    | "changes_requested"
    | "public_approved"
    | "rejected"
    | "suspended"
    | "blocked"
    | "archived";
  publicApprovedAt: string | null;
  publicationConsentAt: string | null;
  acceptingNewRequests: boolean;
  experienceYears: number | null;
  priceDescription: string | null;
  consultationDurationMinutes: number;
  additionalServices: string[];
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
  moderationReason: string | null;
  updatedAt: string;
  moderationHistory: Array<{
    profileRevision: number;
    decision: "approved" | "changes_requested" | "rejected";
    reason: string | null;
    createdAt: string;
  }>;
};

type Form = {
  displayName: string;
  specialties: string;
  languages: string;
  experienceYears: string;
  priceDescription: string;
  consultationDurationMinutes: string;
  additionalServices: string;
  availabilityStatus: Profile["availabilityStatus"];
  nextAvailableAt: string;
  advocateStatus: "not_declared" | "declared";
  firmName: string;
  bio: string;
  city: string;
  region: string;
  education: string;
  consultationFormats: string;
  acceptingNewRequests: boolean;
};

type DeletionRequest = {
  id: string;
  status: "requested" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  decisionReason: string | null;
  requestedAt: string;
  reviewedAt: string | null;
};

const blank: Form = {
  displayName: "",
  specialties: "",
  languages: "",
  experienceYears: "",
  priceDescription: "",
  consultationDurationMinutes: "60",
  additionalServices: "",
  availabilityStatus: "unknown",
  nextAvailableAt: "",
  advocateStatus: "not_declared",
  firmName: "",
  bio: "",
  city: "",
  region: "",
  education: "",
  consultationFormats: "",
  acceptingNewRequests: true,
};

const toForm = (profile: Profile): Form => ({
  displayName: profile.displayName,
  specialties: profile.specialties.join(", "),
  languages: profile.languages.join(", "),
  experienceYears:
    profile.experienceYears === null ? "" : String(profile.experienceYears),
  priceDescription: profile.priceDescription ?? "",
  consultationDurationMinutes: String(profile.consultationDurationMinutes),
  additionalServices: profile.additionalServices.join(", "),
  availabilityStatus: profile.availabilityStatus,
  nextAvailableAt: profile.nextAvailableAt
    ? profile.nextAvailableAt.slice(0, 16)
    : "",
  advocateStatus:
    profile.advocateStatus === "verified" ? "declared" : profile.advocateStatus,
  firmName: profile.firmName ?? "",
  bio: profile.bio ?? "",
  city: profile.city ?? "",
  region: profile.region ?? "",
  education: profile.education ?? "",
  consultationFormats: profile.consultationFormats.join(", "),
  acceptingNewRequests: profile.acceptingNewRequests,
});

const list = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

export function LawyerProfessionalProfile({
  locale,
}: {
  locale: PlatformLocale;
}) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [scheduleConfigured, setScheduleConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [publicationConsent, setPublicationConsent] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const editingLocked = profile
    ? ["suspended", "blocked", "archived"].includes(
        profile.marketplaceStatus,
      )
    : false;

  useEffect(() => {
    fetch("/api/platform/lawyer-profile", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          profile?: Profile | null;
          error?: string;
        };
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
      .catch((value) =>
        setError(value instanceof Error ? value.message : String(value)),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/platform/lawyer-schedule", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          rules?: unknown[];
          unavailability?: unknown[];
        };
      })
      .then((value) =>
        setScheduleConfigured(
          Boolean(value?.rules?.length || value?.unavailability?.length),
        ),
      )
      .catch(() => setScheduleConfigured(false));
  }, []);

  useEffect(() => {
    fetch("/api/platform/lawyer-profile/deletion-request", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) return null;
        const body = await response.json() as { deletionRequest?: DeletionRequest | null };
        if (!response.ok) throw new Error("DELETION_REQUEST_UNAVAILABLE");
        return body.deletionRequest ?? null;
      })
      .then(setDeletionRequest)
      .catch(() => undefined);
  }, []);

  const personalStepDone = Boolean(
    form.displayName.trim() &&
      form.city.trim() &&
      form.region.trim() &&
      profile?.profilePhotoUrl,
  );
  const professionalStepDone = Boolean(
    form.specialties.trim() &&
      form.languages.trim() &&
      form.experienceYears &&
      form.education.trim() &&
      form.firmName.trim(),
  );
  const servicesStepDone = Boolean(
    form.consultationFormats.trim() &&
      form.priceDescription.trim() &&
      form.consultationDurationMinutes &&
      form.availabilityStatus !== "unknown",
  );
  const submittedStepDone = Boolean(
    profile &&
      profile.marketplaceStatus !== "profile_incomplete" &&
      profile.marketplaceStatus !== "changes_requested",
  );
  const applicationSteps = [
    { label: ru ? "Личные данные" : "Shaxsiy ma’lumotlar", done: personalStepDone },
    { label: ru ? "Профессия" : "Kasbiy ma’lumot", done: professionalStepDone },
    { label: ru ? "Услуги" : "Xizmatlar", done: servicesStepDone },
    { label: ru ? "Расписание" : "Jadval", done: scheduleConfigured },
    { label: ru ? "Preview" : "Ko‘rib chiqish", done: true },
    { label: ru ? "Отправка" : "Yuborish", done: submittedStepDone },
  ];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intent =
      ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
        ?.value === "submit"
        ? "submit"
        : "draft";
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      displayName: form.displayName,
      specialties: list(form.specialties),
      languages: list(form.languages),
      experienceYears: form.experienceYears
        ? Number(form.experienceYears)
        : null,
      priceDescription: form.priceDescription || null,
      consultationDurationMinutes: Number(form.consultationDurationMinutes),
      additionalServices: list(form.additionalServices),
      availabilityStatus: form.availabilityStatus,
      nextAvailableAt: form.nextAvailableAt
        ? new Date(form.nextAvailableAt).toISOString()
        : null,
      advocateStatus: form.advocateStatus,
      firmName: form.firmName || null,
      bio: form.bio || null,
      city: form.city || null,
      region: form.region || null,
      education: form.education || null,
      consultationFormats: list(form.consultationFormats),
      acceptingNewRequests: form.acceptingNewRequests,
      locale,
    };
    try {
      const result = await fetch("/api/platform/lawyer-profile", {
        method: profile ? "PATCH" : "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify(payload),
      });
      const body = (await result.json()) as {
        profile?: Profile;
        error?: string;
      };
      if (!result.ok || !body.profile) throw new Error(body.error || "Ошибка");
      setProfile({
        ...body.profile,
        moderationHistory:
          body.profile.moderationHistory ?? profile?.moderationHistory ?? [],
      });
      setForm(toForm(body.profile));
      if (intent === "submit") {
        const submission = await fetch("/api/platform/lawyer-profile/submit", {
          method: "POST",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify({ locale, publicationConsent: true }),
        });
        const submissionBody = (await submission.json()) as {
          error?: string;
          marketplaceStatus?: Profile["marketplaceStatus"];
          missingRequiredFields?: string[];
          updatedAt?: string;
        };
        if (!submission.ok) {
          if (submissionBody.missingRequiredFields?.length) {
            setProfile((current) =>
              current
                ? {
                    ...current,
                    missingRequiredFields:
                      submissionBody.missingRequiredFields ?? [],
                  }
                : current,
            );
          }
          throw new Error(submissionBody.error || "Ошибка");
        }
        setProfile((current) =>
          current
            ? {
                ...current,
                marketplaceStatus:
                  submissionBody.marketplaceStatus ?? "public_approved",
                missingRequiredFields: [],
                updatedAt: submissionBody.updatedAt ?? current.updatedAt,
              }
            : current,
        );
        setNotice(
          ru
            ? "Профиль опубликован. Начался 90-дневный тестовый период; отметка проверки JURO не присваивалась."
            : "Profil nashr qilindi. 90 kunlik sinov davri boshlandi; JURO tekshiruv belgisi berilmadi.",
        );
        setPublicationConsent(false);
      } else {
        setNotice(
          ru
            ? "Черновик сохранён. Публичное размещение не выполнялось."
            : "Qoralama saqlandi. Ommaviy joylashtirish bajarilmadi.",
        );
      }
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
      const body = (await result.json()) as {
        profilePhotoUrl?: string;
        marketplaceStatus?: Profile["marketplaceStatus"];
        missingRequiredFields?: string[];
        error?: string;
      };
      if (!result.ok || !body.profilePhotoUrl || !body.marketplaceStatus) {
        throw new Error(body.error || "Ошибка");
      }
      setProfile((current) =>
        current
          ? {
              ...current,
              profilePhotoUrl: body.profilePhotoUrl ?? current.profilePhotoUrl,
              marketplaceStatus:
                body.marketplaceStatus ?? current.marketplaceStatus,
              missingRequiredFields:
                body.missingRequiredFields ?? current.missingRequiredFields,
            }
          : current,
      );
      setNotice(
        ru
          ? "Фото сохранено в приватном хранилище. Теперь сохраните профиль для проверки обязательных полей."
          : "Rasm xususiy saqlash joyiga saqlandi. Majburiy maydonlarni tekshirish uchun profilni saqlang.",
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setUploadingPhoto(false);
      event.target.value = "";
    }
  }

  async function submitDeletionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || deletionReason.trim().length < 3) return;
    setDeletionBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/platform/lawyer-profile/deletion-request", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ locale, reason: deletionReason.trim(), confirmation: true }),
      });
      const body = await response.json() as { deletionRequest?: DeletionRequest; code?: string };
      if (!response.ok || !body.deletionRequest) throw new Error(body.code || "DELETION_REQUEST_UNAVAILABLE");
      setDeletionRequest(body.deletionRequest); setDeletionReason("");
      setNotice(ru ? "Запрос на удаление отправлен администратору." : "O‘chirish so‘rovi administratorga yuborildi.");
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setDeletionBusy(false); }
  }

  async function cancelDeletionRequest() {
    setDeletionBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/platform/lawyer-profile/deletion-request", {
        method: "DELETE", headers: { "x-juro-csrf": "1" },
      });
      const body = await response.json() as { deletionRequest?: DeletionRequest; code?: string };
      if (!response.ok || !body.deletionRequest) throw new Error(body.code || "DELETION_REQUEST_UNAVAILABLE");
      setDeletionRequest(body.deletionRequest);
      setNotice(ru ? "Запрос на удаление отменён." : "O‘chirish so‘rovi bekor qilindi.");
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setDeletionBusy(false); }
  }

  if (loading)
    return (
      <section className="profile-panels" aria-busy="true">
        <section>
          <p>
            {ru
              ? "Загрузка профессионального профиля…"
              : "Professional profil yuklanmoqda…"}
          </p>
        </section>
      </section>
    );
  if (unavailable) return null;

  return (
    <section className="profile-panels lawyer-professional-profile">
      <section>
        <div
          className="lawyer-application-steps"
          aria-label={ru ? "Этапы заявки" : "Ariza bosqichlari"}
        >
          {applicationSteps.map((step, index) => (
            <span
              key={step.label}
              className={step.done ? "done" : ""}
            >
              {step.done ? <Check aria-hidden="true" /> : index + 1}
              <b>{step.label}</b>
            </span>
          ))}
        </div>
        <h2>{ru ? "Заявка юриста" : "Yurist arizasi"}</h2>
        <p>
          {ru
            ? "Телефон хранится в защищённом профиле и не публикуется в каталоге. После заполнения обязательных полей и вашего согласия профиль публикуется автоматически."
            : "Telefon himoyalangan profilda saqlanadi va katalogda ko‘rsatilmaydi. Majburiy maydonlar va rozilikdan keyin profil avtomatik nashr qilinadi."}
        </p>
        <p>
          {ru
            ? "Статус адвоката «подтверждён» нельзя установить самостоятельно: его присваивает только JURO после проверки."
            : "«Tasdiqlangan» advokat maqomini mustaqil belgilab bo‘lmaydi: uni faqat JURO tekshiruvdan keyin beradi."}
        </p>
        {profile && (
          <div className="lawyer-application-status" role="status">
            <strong>{statusLabel(profile.marketplaceStatus, ru)}</strong>
            <span>{statusDescription(profile.marketplaceStatus, ru)}</span>
            <time dateTime={profile.updatedAt}>
              {ru ? "Обновлено " : "Yangilandi "}
              {formatProfileDate(profile.updatedAt, ru)}
            </time>
          </div>
        )}
        {profile?.moderationHistory?.length ? (
          <section className="lawyer-moderation-history" aria-labelledby="lawyer-moderation-history-title">
            <h3 id="lawyer-moderation-history-title">
              {ru ? "История модерации" : "Moderatsiya tarixi"}
            </h3>
            <ol>
              {profile.moderationHistory.map((item) => (
                <li key={`${item.profileRevision}:${item.createdAt}`}>
                  <div>
                    <strong>{moderationDecisionLabel(item.decision, ru)}</strong>
                    <span>{ru ? `Версия ${item.profileRevision}` : `${item.profileRevision}-versiya`}</span>
                  </div>
                  {item.reason && <p>{item.reason}</p>}
                  <time dateTime={item.createdAt}>{formatProfileDate(item.createdAt, ru)}</time>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {profile?.marketplaceStatus === "changes_requested" && (
          <section className="profile-message warning" role="status">
            <strong>
              {ru
                ? "Нужно исправить профиль перед повторной проверкой."
                : "Qayta tekshiruvdan oldin profilni tuzatish kerak."}
            </strong>
            <p>
              {profile.moderationReason ||
                (ru
                  ? "Откройте поля профиля, исправьте замечания и сохраните изменения."
                  : "Profil maydonlarini tekshiring, izohlarni tuzating va o‘zgarishlarni saqlang.")}
            </p>
          </section>
        )}
        {error && (
          <p className="profile-message error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="profile-message success" role="status">
            {notice}
          </p>
        )}
        <form className="profile-form" onSubmit={(event) => void save(event)}>
          <fieldset disabled={editingLocked}>
            <section className="lawyer-profile-photo">
              <label>
                {ru
                  ? "Фото профиля (JPEG, PNG или WebP до 2 МБ)"
                  : "Profil rasmi (2 MB gacha JPEG, PNG yoki WebP)"}
                {profile?.profilePhotoUrl && (
                  <Image
                    src={profile.profilePhotoUrl}
                    alt=""
                    width={72}
                    height={72}
                    unoptimized
                  />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void uploadPhoto(event)}
                  disabled={!profile || uploadingPhoto}
                />
                {uploadingPhoto && (
                  <span>{ru ? "Загружаем фото…" : "Rasm yuklanmoqda…"}</span>
                )}
              </label>
              <label>
                {ru ? "Отображаемое имя" : "Ko‘rsatiladigan ism"}
                <input
                  required
                  maxLength={160}
                  value={form.displayName}
                  onChange={(event) =>
                    setForm({ ...form, displayName: event.target.value })
                  }
                />
              </label>
              <label>
                {ru ? "Город" : "Shahar"}
                <input
                  required
                  maxLength={100}
                  value={form.city}
                  onChange={(event) =>
                    setForm({ ...form, city: event.target.value })
                  }
                />
              </label>
              <label>
                {ru ? "Регион" : "Hudud"}
                <input
                  required
                  maxLength={100}
                  value={form.region}
                  onChange={(event) =>
                    setForm({ ...form, region: event.target.value })
                  }
                />
              </label>
              <label>
                {ru
                  ? "Специализации через запятую"
                  : "Mutaxassisliklar, vergul bilan"}
                <input
                  required
                  value={form.specialties}
                  onChange={(event) =>
                    setForm({ ...form, specialties: event.target.value })
                  }
                />
              </label>
              <label>
                {ru ? "Языки через запятую" : "Tillar, vergul bilan"}
                <input
                  required
                  value={form.languages}
                  onChange={(event) =>
                    setForm({ ...form, languages: event.target.value })
                  }
                />
              </label>
              <label>
                {ru ? "Стаж, лет" : "Tajriba, yil"}
                <input
                  required
                  type="number"
                  min="0"
                  max="99"
                  value={form.experienceYears}
                  onChange={(event) =>
                    setForm({ ...form, experienceYears: event.target.value })
                  }
                />
              </label>
            </section>
            <section>
              <label>
                {ru ? "Образование" : "Ta’lim"}
                <input
                  required
                  maxLength={500}
                  value={form.education}
                  onChange={(event) =>
                    setForm({ ...form, education: event.target.value })
                  }
                />
              </label>
              <label>
                {ru ? "Фирма или место работы" : "Firma yoki ish joyi"}
                <input
                  required
                  maxLength={180}
                  value={form.firmName}
                  onChange={(event) =>
                    setForm({ ...form, firmName: event.target.value })
                  }
                />
              </label>
              <label>
                {ru
                  ? "Форматы консультаций через запятую"
                  : "Maslahat formatlari, vergul bilan"}
                <input
                  required
                  value={form.consultationFormats}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      consultationFormats: event.target.value,
                    })
                  }
                  placeholder={
                    ru ? "Чат, телефон, очно" : "Chat, telefon, oflayn"
                  }
                />
              </label>
              <label>
                {ru ? "Доступность" : "Mavjudlik"}
                <select
                  required
                  value={form.availabilityStatus}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      availabilityStatus: event.target
                        .value as Form["availabilityStatus"],
                    })
                  }
                >
                  <option value="unknown">
                    {ru ? "Выберите доступность" : "Mavjudlikni tanlang"}
                  </option>
                  <option value="available">
                    {ru ? "Доступен" : "Mavjud"}
                  </option>
                  <option value="limited">
                    {ru ? "Ограниченная" : "Cheklangan"}
                  </option>
                  <option value="unavailable">
                    {ru ? "Недоступен" : "Mavjud emas"}
                  </option>
                </select>
              </label>
              <label className="lawyer-accepting-requests">
                <input
                  type="checkbox"
                  checked={form.acceptingNewRequests}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      acceptingNewRequests: event.target.checked,
                    })
                  }
                />
                <span>
                  {ru
                    ? "Принимать новые заявки"
                    : "Yangi so‘rovlarni qabul qilish"}
                </span>
              </label>
              <label>
                {ru ? "Ближайшая доступность" : "Eng yaqin mavjudlik"}
                <input
                  type="datetime-local"
                  value={form.nextAvailableAt}
                  onChange={(event) =>
                    setForm({ ...form, nextAvailableAt: event.target.value })
                  }
                />
              </label>
              <label>
                {ru ? "Статус адвоката" : "Advokat maqomi"}
                <select
                  value={form.advocateStatus}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      advocateStatus: event.target
                        .value as Form["advocateStatus"],
                    })
                  }
                >
                  <option value="not_declared">
                    {ru ? "Не заявлен" : "Bildirilmagan"}
                  </option>
                  <option value="declared">
                    {ru
                      ? "Заявлен, не подтверждён JURO"
                      : "Bildirilgan, JURO tasdiqlamagan"}
                  </option>
                </select>
              </label>
              <label>
                {ru ? "Описание цены" : "Narx tavsifi"}
                <input
                  required
                  maxLength={280}
                  value={form.priceDescription}
                  onChange={(event) =>
                    setForm({ ...form, priceDescription: event.target.value })
                  }
                />
              </label>
              <label>
                {ru ? "Стандартная длительность консультации, минут" : "Maslahatning standart davomiyligi, daqiqa"}
                <input
                  required
                  type="number"
                  min="15"
                  max="480"
                  step="15"
                  value={form.consultationDurationMinutes}
                  onChange={(event) =>
                    setForm({ ...form, consultationDurationMinutes: event.target.value })
                  }
                />
              </label>
              <label>
                {ru ? "Дополнительные услуги через запятую" : "Qo‘shimcha xizmatlar, vergul bilan"}
                <input
                  value={form.additionalServices}
                  onChange={(event) =>
                    setForm({ ...form, additionalServices: event.target.value })
                  }
                  placeholder={ru ? "Письменное заключение, проверка договора" : "Yozma xulosa, shartnomani tekshirish"}
                />
              </label>
              <label>
                {ru ? "О себе" : "O‘zingiz haqingizda"}
                <textarea
                  maxLength={2000}
                  value={form.bio}
                  onChange={(event) =>
                    setForm({ ...form, bio: event.target.value })
                  }
                />
              </label>
            </section>
            <section className="lawyer-profile-preview">
              <div>
                <strong>{ru ? "Шаг 4 · Расписание" : "4-bosqich · Jadval"}</strong>
                <p>{ru ? "Рабочие дни, свободное время, перерывы и временная недоступность настраиваются в календаре. Часовой пояс: Asia/Tashkent." : "Ish kunlari, bo‘sh vaqt, tanaffuslar va vaqtincha bandlik kalendarda sozlanadi. Vaqt mintaqasi: Asia/Tashkent."}</p>
              </div>
              <Link className="btn btn-primary" href={`${base}/calendar`}>{ru ? "Настроить расписание" : "Jadvalni sozlash"}</Link>
            </section>
          </fieldset>
          <section
            className="lawyer-profile-preview"
            aria-labelledby="lawyer-profile-preview-title"
          >
            <header>
              <div>
                <small>{ru ? "Предпросмотр" : "Ko‘rib chiqish"}</small>
                <h3 id="lawyer-profile-preview-title">
                  {ru
                    ? "Предпросмотр публичного профиля"
                    : "Ommaviy profilni ko‘rib chiqish"}
                </h3>
              </div>
              <span>{ru ? "Виден только вам" : "Faqat sizga ko‘rinadi"}</span>
            </header>
            <div className="lawyer-profile-preview-card">
              {profile?.profilePhotoUrl ? (
                <Image
                  src={profile.profilePhotoUrl}
                  alt=""
                  width={88}
                  height={88}
                  unoptimized
                />
              ) : (
                <div className="lawyer-profile-preview-photo" aria-hidden="true">
                  {form.displayName.trim().slice(0, 1).toUpperCase() || "J"}
                </div>
              )}
              <div>
                <h4>{form.displayName.trim() || (ru ? "Имя юриста" : "Yurist ismi")}</h4>
                <p>{[form.city, form.region].filter(Boolean).join(" · ") || "—"}</p>
                <div className="lawyer-profile-preview-tags">
                  {list(form.specialties).map((value) => <span key={value}>{value}</span>)}
                  {list(form.languages).map((value) => <span key={value}>{value}</span>)}
                </div>
              </div>
              <dl>
                <div><dt>{ru ? "Стаж" : "Tajriba"}</dt><dd>{form.experienceYears ? `${form.experienceYears} ${ru ? "лет" : "yil"}` : "—"}</dd></div>
                <div><dt>{ru ? "Образование" : "Ta’lim"}</dt><dd>{form.education || "—"}</dd></div>
                <div><dt>{ru ? "Место работы" : "Ish joyi"}</dt><dd>{form.firmName || "—"}</dd></div>
                <div><dt>{ru ? "Форматы" : "Formatlar"}</dt><dd>{list(form.consultationFormats).join(", ") || "—"}</dd></div>
                <div><dt>{ru ? "Стоимость" : "Narx"}</dt><dd>{form.priceDescription || "—"}</dd></div>
                <div><dt>{ru ? "Длительность" : "Davomiyligi"}</dt><dd>{form.consultationDurationMinutes ? `${form.consultationDurationMinutes} ${ru ? "мин." : "daq."}` : "—"}</dd></div>
                <div><dt>{ru ? "Доступность" : "Mavjudlik"}</dt><dd>{availabilityLabel(form.availabilityStatus, ru)}</dd></div>
              </dl>
              {list(form.additionalServices).length > 0 && <p className="lawyer-profile-preview-bio"><strong>{ru ? "Дополнительные услуги: " : "Qo‘shimcha xizmatlar: "}</strong>{list(form.additionalServices).join(" · ")}</p>}
              {form.bio && <p className="lawyer-profile-preview-bio">{form.bio}</p>}
            </div>
          </section>
          {profile?.missingRequiredFields.length ? (
            <p className="lawyer-required-fields" role="status">
              {ru
                ? "До отправки заполните: "
                : "Yuborishdan oldin to‘ldiring: "}
              {profile.missingRequiredFields
                .map((field) => requiredFieldLabel(field, ru))
                .join(", ")}
            </p>
          ) : null}
          {profile?.marketplaceStatus !== "public_approved" && !editingLocked ? (
            <label className="lawyer-publication-consent">
              <input
                type="checkbox"
                checked={publicationConsent}
                onChange={(event) => setPublicationConsent(event.target.checked)}
              />
              <span>
                {ru
                  ? "Согласен на публичное размещение указанных данных и понимаю, что это не означает проверку или рекомендацию со стороны JURO."
                  : "Ko‘rsatilgan ma’lumotlarni ommaviy joylashtirishga roziman va bu JURO tekshiruvi yoki tavsiyasi emasligini tushunaman."}
              </span>
            </label>
          ) : null}
          <div className="lawyer-application-actions">
            <button
              type="submit"
              name="intent"
              value="draft"
              formNoValidate
              disabled={saving || uploadingPhoto}
            >
              {!saving && <Save aria-hidden="true" />}
              {ru ? "Сохранить черновик" : "Qoralamani saqlash"}
            </button>
            <button
              type="submit"
              name="intent"
              value="submit"
              disabled={
                saving ||
                uploadingPhoto ||
                !publicationConsent ||
                profile?.marketplaceStatus === "public_approved"
              }
            >
              {!saving && <Send aria-hidden="true" />}
              {ru ? "Согласиться и опубликовать" : "Rozilik berish va nashr qilish"}
            </button>
          </div>
        </form>
      </section>
      {profile && <section className="lawyer-profile-deletion" aria-labelledby="lawyer-profile-deletion-title">
        <header><Trash2 aria-hidden="true" /><div><h2 id="lawyer-profile-deletion-title">{ru ? "Удаление профессионального профиля" : "Professional profilni o‘chirish"}</h2><p>{ru ? "Профиль не удаляется мгновенно: администратор проверит запрос и подтвердит либо отклонит его. До решения профиль работает в текущем статусе." : "Profil darhol o‘chirilmaydi: administrator so‘rovni tekshiradi va tasdiqlaydi yoki rad etadi. Qarorgacha profil joriy holatda ishlaydi."}</p></div></header>
        {deletionRequest?.status === "requested" ? <div className="lawyer-deletion-status"><strong>{ru ? "Запрос ожидает решения администратора" : "So‘rov administrator qarorini kutmoqda"}</strong><p>{deletionRequest.reason || "—"}</p><time dateTime={deletionRequest.requestedAt}>{formatProfileDate(deletionRequest.requestedAt, ru)}</time><button type="button" disabled={deletionBusy} onClick={() => void cancelDeletionRequest()}><X aria-hidden="true" />{ru ? "Отменить запрос" : "So‘rovni bekor qilish"}</button></div> : <form onSubmit={(event) => void submitDeletionRequest(event)}><label>{ru ? "Причина" : "Sabab"}<textarea required minLength={3} maxLength={1000} value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} /></label>{deletionRequest && <p className={`lawyer-deletion-previous ${deletionRequest.status}`}>{deletionRequest.status === "approved" ? (ru ? "Предыдущий запрос подтверждён; профиль архивирован." : "Oldingi so‘rov tasdiqlandi; profil arxivlandi.") : deletionRequest.status === "rejected" ? `${ru ? "Предыдущий запрос отклонён" : "Oldingi so‘rov rad etildi"}: ${deletionRequest.decisionReason || "—"}` : (ru ? "Предыдущий запрос отменён." : "Oldingi so‘rov bekor qilindi.")}</p>}<button type="submit" disabled={deletionBusy || deletionReason.trim().length < 3}><Trash2 aria-hidden="true" />{ru ? "Отправить запрос администратору" : "Administratorga so‘rov yuborish"}</button></form>}
      </section>}
    </section>
  );
}

function statusLabel(status: Profile["marketplaceStatus"], ru: boolean) {
  const labels: Record<Profile["marketplaceStatus"], [string, string]> = {
    profile_incomplete: ["Черновик", "Qoralama"],
    pending_review: ["На проверке JURO", "JURO tekshiruvida"],
    changes_requested: ["Нужны изменения", "O‘zgartirish kerak"],
    public_approved: ["Профиль опубликован", "Profil nashr etilgan"],
    rejected: ["Заявка отклонена", "Ariza rad etilgan"],
    suspended: ["Профиль приостановлен", "Profil to‘xtatilgan"],
    blocked: ["Профиль заблокирован", "Profil bloklangan"],
    archived: ["Профиль в архиве", "Profil arxivda"],
  };
  return labels[status][ru ? 0 : 1];
}

function statusDescription(status: Profile["marketplaceStatus"], ru: boolean) {
  const descriptions: Record<Profile["marketplaceStatus"], [string, string]> = {
    profile_incomplete: [
      "Данные сохраняются как черновик и не видны в каталоге.",
      "Ma’lumotlar qoralama sifatida saqlanadi va katalogda ko‘rinmaydi.",
    ],
    pending_review: [
      "Старый статус проверки: подтвердите публикацию по новым тестовым правилам.",
      "Eski tekshiruv holati: yangi sinov qoidalari bo‘yicha nashrni tasdiqlang.",
    ],
    changes_requested: [
      "Исправьте замечания и отправьте заявку повторно.",
      "Izohlarni tuzating va arizani qayta yuboring.",
    ],
    public_approved: [
      "Публичная карточка доступна клиентам.",
      "Ommaviy karta mijozlarga ochiq.",
    ],
    rejected: [
      "Причина решения отображается ниже, если она доступна.",
      "Qaror sababi mavjud bo‘lsa, quyida ko‘rsatiladi.",
    ],
    suspended: [
      "Публичная карточка и новые заявки временно недоступны.",
      "Ommaviy karta va yangi so‘rovlar vaqtincha mavjud emas.",
    ],
    blocked: [
      "Доступ к профессиональным действиям заблокирован решением JURO.",
      "Professional amallarga kirish JURO qarori bilan bloklangan.",
    ],
    archived: [
      "Профиль снят с публикации и помещён в архив.",
      "Profil nashrdan olib tashlangan va arxivga joylangan.",
    ],
  };
  return descriptions[status][ru ? 0 : 1];
}

function availabilityLabel(status: Form["availabilityStatus"], ru: boolean) {
  const labels: Record<Form["availabilityStatus"], [string, string]> = {
    unknown: ["Не указана", "Ko‘rsatilmagan"],
    available: ["Доступен", "Mavjud"],
    limited: ["Ограниченная", "Cheklangan"],
    unavailable: ["Недоступен", "Mavjud emas"],
  };
  return labels[status][ru ? 0 : 1];
}

function moderationDecisionLabel(
  decision: Profile["moderationHistory"][number]["decision"],
  ru: boolean,
) {
  const labels = {
    approved: ["Одобрена и опубликована", "Tasdiqlandi va nashr qilindi"],
    changes_requested: ["Запрошены изменения", "O‘zgartirishlar so‘raldi"],
    rejected: ["Отклонена", "Rad etildi"],
  } satisfies Record<typeof decision, [string, string]>;
  return labels[decision][ru ? 0 : 1];
}

function formatProfileDate(value: string, ru: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tashkent",
  }).format(date);
}

function requiredFieldLabel(field: string, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    displayName: ["имя", "ism"],
    specialties: ["специализации", "mutaxassisliklar"],
    languages: ["языки", "tillar"],
    experienceYears: ["стаж", "tajriba"],
    education: ["образование", "ta’lim"],
    firmName: ["место работы", "ish joyi"],
    city: ["город", "shahar"],
    region: ["регион", "hudud"],
    priceDescription: ["стоимость", "narx"],
    consultationFormats: ["форматы консультаций", "konsultatsiya formatlari"],
    profilePhoto: ["фото", "rasm"],
    phone: ["телефон в основном профиле", "asosiy profildagi telefon"],
    availabilityStatus: ["доступность", "mavjudlik"],
  };
  return labels[field]?.[ru ? 0 : 1] || field;
}
