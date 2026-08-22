"use client";

import Image from "next/image";
import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Locale = "ru" | "uz";
type ProfileStatus =
  | "profile_incomplete"
  | "pending_review"
  | "changes_requested"
  | "public_approved"
  | "rejected"
  | "suspended"
  | "blocked"
  | "archived";
type Profile = {
  id: string;
  displayName: string;
  specialtiesJson: string;
  languagesJson: string;
  status: string;
  marketplaceStatus: ProfileStatus;
  profileRevision: number;
  experienceYears: number | null;
  priceDescription: string | null;
  consultationDurationMinutes: number;
  additionalServicesJson: string;
  availabilityStatus: string;
  nextAvailableAt: string | null;
  advocateStatus: string;
  firmName: string | null;
  bio: string | null;
  city: string | null;
  region: string | null;
  education: string | null;
  consultationFormatsJson: string;
  hasProfilePhoto: number;
  profilePhotoUrl?: string | null;
  juroApprovalStatus: "approved" | "not_approved";
  topLawyerStatus: "featured" | "not_featured";
  topLawyerCriteria: string | null;
  publicApprovedAt?: string | null;
  accountName?: string;
  email?: string | null;
  phone?: string | null;
  updatedAt: string;
};
type HistoryItem = {
  profileRevision: number;
  decision: string;
  reason: string | null;
  createdAt: string;
};
type LifecycleItem = {
  action: string;
  reason: string;
  fromMarketplaceStatus: string;
  toMarketplaceStatus: string;
  createdAt: string;
};
type Schedule = {
  rules: Array<{ weekday: number; startsAt: string; endsAt: string; timezone: string; status: string }>;
  unavailability: Array<{ startsAt: string; endsAt: string; reason: string | null }>;
};
type LawyerTrial = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  postExpiryMode: "stay_published" | "limit_new_requests" | "hide_profile";
  reminder30SentAt: string | null;
  reminder7SentAt: string | null;
  reminder1SentAt: string | null;
  reminderExpiredSentAt: string | null;
};
type DeletionRequest = {
  id: string;
  lawyerProfileId: string;
  status: "requested" | "approved" | "rejected";
  reason: string | null;
  decisionReason: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  displayName: string;
  marketplaceStatus: ProfileStatus;
  email: string | null;
};

const statusLabels: Record<ProfileStatus, [string, string]> = {
  profile_incomplete: ["Не завершён", "Tugallanmagan"],
  pending_review: ["Ожидает проверки", "Tekshiruv kutilmoqda"],
  changes_requested: ["Нужны исправления", "Tuzatish kerak"],
  public_approved: ["Опубликован", "Nashr etilgan"],
  rejected: ["Отклонён", "Rad etilgan"],
  suspended: ["Приостановлен", "To‘xtatilgan"],
  blocked: ["Заблокирован", "Bloklangan"],
  archived: ["В архиве", "Arxivda"],
};
const weekdays: Record<number, [string, string]> = {
  1: ["Пн", "Du"], 2: ["Вт", "Se"], 3: ["Ср", "Ch"], 4: ["Чт", "Pa"],
  5: ["Пт", "Ju"], 6: ["Сб", "Sh"], 7: ["Вс", "Ya"],
};

function asList(value: string | undefined): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function json<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new Error(payload.error || payload.code || `HTTP ${response.status}`);
  return payload;
}

export function LawyerProfileModerationInbox({ locale, reviewerName }: { locale: Locale; reviewerName: string }) {
  const ru = locale === "ru";
  const [status, setStatus] = useState<ProfileStatus>("pending_review");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [moderationHistory, setModerationHistory] = useState<HistoryItem[]>([]);
  const [lifecycleHistory, setLifecycleHistory] = useState<LifecycleItem[]>([]);
  const [schedule, setSchedule] = useState<Schedule>({ rules: [], unavailability: [] });
  const [trial, setTrial] = useState<LawyerTrial | null>(null);
  const [trialAction, setTrialAction] = useState<"extend" | "set_mode">("extend");
  const [trialDays, setTrialDays] = useState(30);
  const [trialMode, setTrialMode] = useState<LawyerTrial["postExpiryMode"]>("stay_published");
  const [trialReason, setTrialReason] = useState("");
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [selectedDeletion, setSelectedDeletion] = useState<DeletionRequest | null>(null);
  const [deletionDecision, setDeletionDecision] = useState<"approved" | "rejected">("approved");
  const [deletionReason, setDeletionReason] = useState("");
  const [decision, setDecision] = useState<"approved" | "changes_requested" | "rejected">("approved");
  const [lifecycleAction, setLifecycleAction] = useState<"suspend" | "archive" | "restore">("suspend");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [payload, deletionPayload] = await Promise.all([
        json<{ profiles: Profile[] }>(await fetch(`/api/platform/admin/lawyer-profiles?status=${encodeURIComponent(status)}`, { cache: "no-store" })),
        json<{ requests: DeletionRequest[] }>(await fetch("/api/platform/admin/lawyer-profile-deletion-requests?status=requested", { cache: "no-store" })),
      ]);
      setProfiles(payload.profiles); setDeletionRequests(deletionPayload.requests); setSelected(null); setSelectedDeletion(null); setAnnouncement("");
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  }, [status]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function open(profile: Profile) {
    setBusy(true); setError(""); setAnnouncement(""); setReason("");
    try {
      const payload = await json<{ profile: Profile; moderationHistory: HistoryItem[]; lifecycleHistory: LifecycleItem[]; schedule: Schedule; trial: LawyerTrial | null }>(
        await fetch(`/api/platform/admin/lawyer-profiles/${encodeURIComponent(profile.id)}`, { cache: "no-store" }),
      );
      setSelected(payload.profile);
      setModerationHistory(payload.moderationHistory);
      setLifecycleHistory(payload.lifecycleHistory);
      setSchedule(payload.schedule);
      setTrial(payload.trial);
      setTrialMode(payload.trial?.postExpiryMode ?? "stay_published");
      setTrialAction("extend"); setTrialDays(30); setTrialReason("");
      setDecision("approved");
      setLifecycleAction(payload.profile.marketplaceStatus === "public_approved" ? "suspend" : "restore");
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  }

  async function submitModeration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !reason.trim()) return;
    setBusy(true); setError("");
    try {
      await json(await fetch(`/api/platform/admin/lawyer-profiles/${encodeURIComponent(selected.id)}`, {
        method: "PATCH", headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ decision, reason: reason.trim(), locale }),
      }));
      setAnnouncement(ru ? "Решение сохранено в защищённом журнале." : "Qaror himoyalangan jurnalga saqlandi.");
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  }

  async function submitLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !reason.trim()) return;
    setBusy(true); setError("");
    try {
      await json(await fetch(`/api/platform/admin/lawyer-profiles/${encodeURIComponent(selected.id)}/lifecycle`, {
        method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ action: lifecycleAction, reason: reason.trim(), locale }),
      }));
      setAnnouncement(ru ? "Lifecycle профиля обновлён и записан в audit log." : "Profil lifecycle holati audit jurnaliga yozildi.");
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  }

  async function submitDeletionDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDeletion || deletionReason.trim().length < 3) return;
    setBusy(true); setError("");
    try {
      await json(await fetch(`/api/platform/admin/lawyer-profile-deletion-requests/${encodeURIComponent(selectedDeletion.id)}`, {
        method: "PATCH", headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ decision: deletionDecision, reason: deletionReason.trim(), locale }),
      }));
      setAnnouncement(deletionDecision === "approved" ? (ru ? "Удаление подтверждено; профиль архивирован с audit evidence." : "O‘chirish tasdiqlandi; profil audit dalili bilan arxivlandi.") : (ru ? "Запрос на удаление отклонён." : "O‘chirish so‘rovi rad etildi."));
      setDeletionReason(""); setSelectedDeletion(null); await load();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  }

  async function submitTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !trial || trialReason.trim().length < 3) return;
    setBusy(true); setError("");
    try {
      const payload = await json<{ endsAt: string; postExpiryMode: LawyerTrial["postExpiryMode"] }>(await fetch(
        `/api/platform/admin/lawyer-profiles/${encodeURIComponent(selected.id)}/trial`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify(trialAction === "extend"
            ? { action: "extend", days: trialDays, reason: trialReason.trim() }
            : { action: "set_mode", mode: trialMode, reason: trialReason.trim() }),
        },
      ));
      setTrial({ ...trial, endsAt: payload.endsAt, postExpiryMode: payload.postExpiryMode, status: trialAction === "extend" ? "extended" : trial.status });
      setTrialReason("");
      setAnnouncement(trialAction === "extend"
        ? (ru ? "Пробный период продлён; изменение записано в audit log." : "Sinov muddati uzaytirildi; o‘zgarish audit jurnaliga yozildi.")
        : (ru ? "Правило после trial сохранено в audit log." : "Sinovdan keyingi qoida audit jurnaliga yozildi."));
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  }

  const date = (value: string) => new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value));
  return <div className="staff-console">
    <a className="staff-skip" href="#staff-main">{ru ? "К очереди" : "Navbatga o‘tish"}</a>
    <header className="staff-topbar"><div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>LEGAL OPERATIONS</small></span></div><div className="staff-session"><span>{ru ? "Защищённый контур · свежая 2FA" : "Himoyalangan kontur · yangi 2FA"}</span><b>{reviewerName}</b></div><a href={`/${locale}/admin/billing`}>{ru ? "Тарифы" : "Tariflar"}</a><a href={`/${ru ? "uz" : "ru"}/admin/lawyer-profiles`} hrefLang={ru ? "uz" : "ru"}>{ru ? "UZ" : "RU"}</a></header>
    <main id="staff-main" className="staff-main">
      <section className="staff-heading"><div><span>JURO · PROFILE SAFETY</span><h1>{ru ? "Профили юристов" : "Yurist profillari"}</h1><p>{ru ? "Публикация по согласию юриста, расписание, trial, контролируемое удаление и неизменяемая история решений." : "Yurist roziligi bilan nashr, jadval, sinov muddati, boshqariladigan o‘chirish va o‘zgarmas qarorlar tarixi."}</p></div><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw aria-hidden="true"/>{ru ? "Обновить" : "Yangilash"}</button></section>
      <div className="staff-filters"><label>{ru ? "Статус" : "Holat"}<select value={status} onChange={(event) => setStatus(event.target.value as ProfileStatus)}>{(Object.keys(statusLabels) as ProfileStatus[]).map((value) => <option key={value} value={value}>{statusLabels[value][ru ? 0 : 1]}</option>)}</select></label></div>
      {error && <p className="staff-error" role="alert">{error}<button type="button" onClick={() => void load()}>{ru ? "Обновить" : "Yangilash"}</button></p>}
      {announcement && <p role="status" className="staff-verified"><Check aria-hidden="true"/>{announcement}</p>}
      {!busy && profiles.length === 0 && <section className="staff-empty"><ShieldCheck aria-hidden="true"/><h2>{ru ? "Профилей с выбранным статусом нет" : "Tanlangan holatdagi profil yo‘q"}</h2></section>}
      <section className="staff-queue" aria-busy={busy}>{profiles.map((profile) => <article className="staff-table-row" key={profile.id}><div className="staff-source"><span>{ru ? "Профиль" : "Profil"} · v{profile.profileRevision}</span><b>{profile.displayName}</b><small>{date(profile.updatedAt)}</small></div><div><b>{asList(profile.specialtiesJson).join(", ")}</b><p>{asList(profile.languagesJson).join(", ")}</p><p>{profile.firmName || "—"} · {profile.experienceYears ?? "—"}</p><p>{ru ? "Доступность" : "Mavjudlik"}: {profile.availabilityStatus}; {ru ? "адвокат" : "advokat"}: {profile.advocateStatus}</p></div><div className={`staff-status status-${profile.marketplaceStatus}`}>{statusLabels[profile.marketplaceStatus][ru ? 0 : 1]}</div><div className="staff-row-actions"><button type="button" onClick={() => void open(profile)} disabled={busy}>{ru ? "Открыть" : "Ochish"}</button></div></article>)}</section>

      <section className="staff-lawyer-deletion-queue" aria-labelledby="staff-deletion-queue-title"><header><div><small>JURO · CONTROLLED DELETION</small><h2 id="staff-deletion-queue-title">{ru ? "Запросы на удаление профиля" : "Profilni o‘chirish so‘rovlari"}</h2><p>{ru ? "Подтверждение архивирует публичный профиль, но сохраняет неизменяемую историю и audit log." : "Tasdiqlash ochiq profilni arxivlaydi, ammo o‘zgarmas tarix va audit jurnalini saqlaydi."}</p></div></header>{deletionRequests.length ? <div className="staff-queue">{deletionRequests.map((item) => <article className="staff-table-row" key={item.id}><div className="staff-source"><span>{ru ? "Удаление" : "O‘chirish"}</span><b>{item.displayName}</b><small>{date(item.requestedAt)}</small></div><div><b>{item.email || "—"}</b><p>{item.reason || "—"}</p></div><div className={`staff-status status-${item.marketplaceStatus}`}>{statusLabels[item.marketplaceStatus][ru ? 0 : 1]}</div><div className="staff-row-actions"><button type="button" onClick={() => { setSelectedDeletion(item); setDeletionDecision("approved"); setDeletionReason(""); }}>{ru ? "Рассмотреть" : "Ko‘rib chiqish"}</button></div></article>)}</div> : <p>{ru ? "Открытых запросов нет." : "Ochiq so‘rovlar yo‘q."}</p>}{selectedDeletion && <form className="staff-decision" onSubmit={(event) => void submitDeletionDecision(event)}><h2>{selectedDeletion.displayName}</h2><p>{selectedDeletion.reason || "—"}</p><label>{ru ? "Решение" : "Qaror"}<select value={deletionDecision} onChange={(event) => setDeletionDecision(event.target.value as typeof deletionDecision)}><option value="approved">{ru ? "Подтвердить и архивировать" : "Tasdiqlash va arxivlash"}</option><option value="rejected">{ru ? "Отклонить" : "Rad etish"}</option></select></label><label>{ru ? "Основание решения" : "Qaror asosi"}<textarea required minLength={3} maxLength={2000} value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} /></label><div><button className={deletionDecision === "approved" ? "staff-approve" : "staff-reject"} disabled={busy || deletionReason.trim().length < 3}><Check aria-hidden="true" />{ru ? "Сохранить решение" : "Qarorni saqlash"}</button><button type="button" onClick={() => setSelectedDeletion(null)}><X aria-hidden="true" />{ru ? "Отмена" : "Bekor qilish"}</button></div></form>}</section>

      {selected && <section className="staff-lawyer-review" aria-labelledby="staff-lawyer-review-title">
        <header><div><small>JURO · REVIEW VIEW</small><h2 id="staff-lawyer-review-title">{selected.displayName}</h2><p>{statusLabels[selected.marketplaceStatus][ru ? 0 : 1]} · v{selected.profileRevision} · {date(selected.updatedAt)}</p></div><button type="button" onClick={() => setSelected(null)}><X aria-hidden="true"/>{ru ? "Закрыть" : "Yopish"}</button></header>
        <div className="staff-lawyer-preview">
          {selected.profilePhotoUrl ? <Image src={selected.profilePhotoUrl} alt="" width={104} height={104} unoptimized /> : <div className="staff-lawyer-photo-placeholder" aria-label={ru ? "Фото не предоставлено" : "Rasm taqdim etilmagan"}>{selected.displayName.slice(0, 1)}</div>}
          <div><h3>{selected.displayName}</h3><p>{[selected.city, selected.region].filter(Boolean).join(" · ")}</p><p>{selected.bio || "—"}</p></div>
          <dl><div><dt>Email</dt><dd>{selected.email || "—"}</dd></div><div><dt>{ru ? "Телефон" : "Telefon"}</dt><dd>{selected.phone || "—"}</dd></div><div><dt>{ru ? "Специализации" : "Mutaxassislik"}</dt><dd>{asList(selected.specialtiesJson).join(", ") || "—"}</dd></div><div><dt>{ru ? "Языки" : "Tillar"}</dt><dd>{asList(selected.languagesJson).join(", ") || "—"}</dd></div><div><dt>{ru ? "Образование" : "Ta’lim"}</dt><dd>{selected.education || "—"}</dd></div><div><dt>{ru ? "Фирма" : "Firma"}</dt><dd>{selected.firmName || "—"}</dd></div><div><dt>{ru ? "Форматы" : "Formatlar"}</dt><dd>{asList(selected.consultationFormatsJson).join(", ") || "—"}</dd></div><div><dt>{ru ? "Стоимость" : "Narx"}</dt><dd>{selected.priceDescription || "—"}</dd></div><div><dt>{ru ? "Длительность" : "Davomiyligi"}</dt><dd>{selected.consultationDurationMinutes} {ru ? "мин." : "daq."}</dd></div><div><dt>{ru ? "Дополнительные услуги" : "Qo‘shimcha xizmatlar"}</dt><dd>{asList(selected.additionalServicesJson).join(", ") || "—"}</dd></div></dl>
        </div>
        <section className="staff-lawyer-evidence"><h3>{ru ? "Подтверждающие материалы" : "Tasdiqlovchi materiallar"}</h3><p>{selected.hasProfilePhoto ? (ru ? "Фото загружено в приватное R2 и прошло обязательную malware-проверку; reviewer-preview показан выше." : "Rasm xususiy R2 ga yuklangan va malware tekshiruvidan o‘tgan; reviewer-preview yuqorida.") : (ru ? "Фото не предоставлено. Иные подтверждающие документы текущими правилами профиля не требуются." : "Rasm taqdim etilmagan. Boshqa hujjatlar joriy profil qoidalarida talab etilmaydi.")}</p></section>
        <section className="staff-lawyer-schedule"><h3>{ru ? "Расписание" : "Jadval"}</h3><p>{schedule.rules.length ? schedule.rules.map((rule) => `${weekdays[rule.weekday]?.[ru ? 0 : 1]} ${rule.startsAt}–${rule.endsAt} (${rule.timezone})`).join(" · ") : (ru ? "Рабочие интервалы не настроены." : "Ish vaqti sozlanmagan.")}</p>{schedule.unavailability.map((period) => <p key={`${period.startsAt}:${period.endsAt}`}>{date(period.startsAt)} — {date(period.endsAt)}{period.reason ? ` · ${period.reason}` : ""}</p>)}</section>
        {trial && <form className="staff-decision staff-trial-control" onSubmit={(event) => void submitTrial(event)}><h2>{ru ? "90-дневный trial" : "90 kunlik sinov"}</h2><p>{ru ? `Начало: ${date(trial.startsAt)} · окончание: ${date(trial.endsAt)} · статус: ${trial.status}` : `Boshlanishi: ${date(trial.startsAt)} · tugashi: ${date(trial.endsAt)} · holat: ${trial.status}`}</p><label>{ru ? "Действие" : "Amal"}<select value={trialAction} onChange={(event) => setTrialAction(event.target.value as typeof trialAction)}><option value="extend">{ru ? "Продлить trial" : "Sinovni uzaytirish"}</option><option value="set_mode">{ru ? "Правило после окончания" : "Tugagandan keyingi qoida"}</option></select></label>{trialAction === "extend" ? <label>{ru ? "Дней продления" : "Uzaytirish kunlari"}<input type="number" min={1} max={365} value={trialDays} onChange={(event) => setTrialDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))} /></label> : <label>{ru ? "После окончания" : "Tugagandan keyin"}<select value={trialMode} onChange={(event) => setTrialMode(event.target.value as typeof trialMode)}><option value="stay_published">{ru ? "Оставить опубликованным" : "Nashrda qoldirish"}</option><option value="limit_new_requests">{ru ? "Запретить новые заявки" : "Yangi so‘rovlarni cheklash"}</option><option value="hide_profile">{ru ? "Скрыть из каталога" : "Katalogdan yashirish"}</option></select></label>}<label>{ru ? "Основание" : "Asos"}<textarea required minLength={3} maxLength={2000} value={trialReason} onChange={(event) => setTrialReason(event.target.value)} /></label><button disabled={busy || trialReason.trim().length < 3}><Check aria-hidden="true"/>{ru ? "Сохранить с audit" : "Audit bilan saqlash"}</button></form>}
        <section className="staff-lawyer-history"><h3>{ru ? "История модерации" : "Moderatsiya tarixi"}</h3>{moderationHistory.length ? <ol>{moderationHistory.map((item) => <li key={`${item.profileRevision}:${item.createdAt}`}><strong>{item.decision} · v{item.profileRevision}</strong><span>{item.reason || "—"}</span><time dateTime={item.createdAt}>{date(item.createdAt)}</time></li>)}</ol> : <p>{ru ? "Решений ещё нет." : "Hali qaror yo‘q."}</p>}<h3>{ru ? "Lifecycle и публикация" : "Lifecycle va nashr"}</h3>{lifecycleHistory.length ? <ol>{lifecycleHistory.map((item) => <li key={`${item.action}:${item.createdAt}`}><strong>{item.action}: {item.fromMarketplaceStatus} → {item.toMarketplaceStatus}</strong><span>{item.reason}</span><time dateTime={item.createdAt}>{date(item.createdAt)}</time></li>)}</ol> : <p>{ru ? "Lifecycle-переходов ещё нет." : "Lifecycle o‘tishlari yo‘q."}</p>}</section>
        {selected.marketplaceStatus === "pending_review" ? <form className="staff-decision" onSubmit={(event) => void submitModeration(event)}><h2>{ru ? "Решение" : "Qaror"}</h2><label>{ru ? "Решение" : "Qaror"}<select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><option value="approved">{ru ? "Одобрить и опубликовать" : "Tasdiqlash va nashr"}</option><option value="changes_requested">{ru ? "Запросить исправления" : "Tuzatish so‘rash"}</option><option value="rejected">{ru ? "Отклонить" : "Rad etish"}</option></select></label><label>{ru ? "Комментарий и основание" : "Izoh va asos"}<textarea required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)}/></label><button className={decision === "approved" ? "staff-approve" : decision === "rejected" ? "staff-reject" : undefined} disabled={busy || !reason.trim()}><Check aria-hidden="true"/>{ru ? "Сохранить решение" : "Qarorni saqlash"}</button></form> : ["public_approved", "suspended", "blocked", "archived"].includes(selected.marketplaceStatus) ? <form className="staff-decision" onSubmit={(event) => void submitLifecycle(event)}><h2>{ru ? "Управление публикацией" : "Nashrni boshqarish"}</h2><label>{ru ? "Действие" : "Amal"}<select value={lifecycleAction} onChange={(event) => setLifecycleAction(event.target.value as typeof lifecycleAction)}>{selected.marketplaceStatus === "public_approved" ? <><option value="suspend">{ru ? "Приостановить" : "To‘xtatish"}</option><option value="archive">{ru ? "Архивировать" : "Arxivlash"}</option></> : <option value="restore">{ru ? "Восстановить и вернуть на проверку" : "Tiklash va tekshiruvga qaytarish"}</option>}</select></label><label>{ru ? "Комментарий и основание" : "Izoh va asos"}<textarea required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)}/></label><button disabled={busy || !reason.trim()}><Check aria-hidden="true"/>{ru ? "Применить" : "Qo‘llash"}</button></form> : null}
      </section>}
    </main>
  </div>;
}
