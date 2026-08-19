"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated lawyer data is loaded after hydration */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BriefcaseBusiness, CalendarClock, CheckCircle2, CircleAlert, Clock3, FileText, LoaderCircle, MessageSquareText, Plus, Save, Trash2, UserRound, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";
import { LawyerRequestsClient } from "./LawyerRequestsClient";

type LawyerProfileSummary = { id: string; displayName: string; status: string; marketplaceStatus: string; availabilityStatus: string; nextAvailableAt: string | null; profileRevision: number };
type RequestItem = { id: string; status: string; anonymizedSummary: string; createdAt: string; updatedAt: string; caseId: string | null; caseTitle: string | null; legalArea: string | null; clientName: string | null; hasAccess: number };
type Matter = { id: string; title: string; status: string; legalArea: string | null; updatedAt: string; clientName: string | null; requestId: string };
type Message = { id: string; requestId: string; authorRole: string; body: string; createdAt: string };
type DocumentItem = { id: string; title: string; category: string; status: string; updatedAt: string; caseId: string };
type TaskItem = { id: string; title: string; status: string; dueAt: string | null; caseId: string; updatedAt: string };
type Consultation = { id: string; requestId: string; caseId: string; startsAt: string; endsAt: string; timezone: string; format: string; status: string; internalNote: string | null; resultNote: string | null };
export type LawyerWorkspaceData = { profile: LawyerProfileSummary | null; operational: boolean; requests: RequestItem[]; matters: Matter[]; messages: Message[]; documents: DocumentItem[]; tasks: TaskItem[]; consultations: Consultation[] };

export function useLawyerWorkspace() {
  const [data, setData] = useState<LawyerWorkspaceData | null>(null);
  const [referenceTime, setReferenceTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/platform/lawyer-workspace", { cache: "no-store" });
    const body = await response.json() as LawyerWorkspaceData & { error?: string };
    if (!response.ok) throw new Error(body.error || "LAWYER_WORKSPACE_UNAVAILABLE");
    setData(body);
    setReferenceTime(Date.now());
  }, []);
  useEffect(() => { void load().catch((value) => setError(value instanceof Error ? value.message : String(value))).finally(() => setLoading(false)); }, [load]);
  return { data, loading, error, referenceTime, reload: load };
}

function statusCopy(status: string, ru: boolean) {
  const values: Record<string, [string, string]> = {
    profile_incomplete: ["Заполните профиль", "Profilni to‘ldiring"],
    pending_review: ["Профиль на проверке JURO", "Profil JURO tekshiruvida"],
    changes_requested: ["Нужны исправления", "Tuzatishlar kerak"],
    public_approved: ["Профиль опубликован", "Profil e’lon qilingan"],
    rejected: ["Публикация отклонена", "E’lon rad etildi"],
    suspended: ["Работа приостановлена", "Ish to‘xtatilgan"],
    blocked: ["Доступ заблокирован", "Kirish bloklangan"],
    archived: ["Профиль в архиве", "Profil arxivda"],
  };
  return values[status]?.[ru ? 0 : 1] ?? status;
}

export function LawyerDashboardClient({ locale, userName }: { locale: PlatformLocale; userName: string }) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const { data, loading, error, referenceTime } = useLawyerWorkspace();
  const openRequests = data?.requests.filter((item) => !["completed", "conflict_declined", "access_revoked"].includes(item.status)) ?? [];
  const nextConsultation = data?.consultations.filter((item) => new Date(item.endsAt).getTime() >= referenceTime && item.status !== "cancelled")[0];
  const dueTasks = data?.tasks.filter((item) => item.dueAt && new Date(item.dueAt).getTime() <= referenceTime + 86_400_000) ?? [];
  return <section className="lawyer-workspace lawyer-dashboard" aria-labelledby="lawyer-dashboard-title">
    <header className="lawyer-workspace-hero"><div><span>JURO · {ru ? "кабинет юриста" : "yurist kabineti"}</span><h1 id="lawyer-dashboard-title">{userName ? (ru ? `Добрый день, ${userName}` : `Xayrli kun, ${userName}`) : (ru ? "Рабочий кабинет юриста" : "Yurist ish kabineti")}</h1><p>{ru ? "Заявки, консультации, клиенты и дела — только из подтверждённых записей JURO." : "So‘rovlar, maslahatlar, mijozlar va ishlar — faqat tasdiqlangan JURO yozuvlaridan."}</p></div><BriefcaseBusiness aria-hidden="true" /></header>
    {error && <p className="lawyer-workspace-error" role="alert"><CircleAlert />{error}</p>}
    {loading && !data ? <div className="lawyer-workspace-loading"><LoaderCircle className="spin" />{ru ? "Загружаем кабинет" : "Kabinet yuklanmoqda"}</div> : data && <>
      <section className={`lawyer-status-banner ${data.operational ? "approved" : "pending"}`}><CheckCircle2 /><div><strong>{data.profile ? statusCopy(data.profile.marketplaceStatus, ru) : (ru ? "Профессиональный профиль не создан" : "Professional profil yaratilmagan")}</strong><p>{data.operational ? (ru ? "Новые назначения и доступы к делам отображаются в реальном времени." : "Yangi tayinlovlar va ish ruxsatlari real vaqtda ko‘rinadi.") : (ru ? "До одобрения нельзя принимать новые заявки или видеть материалы клиентов." : "Tasdiqlangunga qadar yangi so‘rovlarni qabul qilish yoki mijoz materiallarini ko‘rish mumkin emas.")}</p></div><Link href={`${base}/profile`}>{ru ? "Открыть профиль" : "Profilni ochish"}</Link></section>
      <div className="lawyer-kpi-grid">
        <article><UsersRound /><span>{ru ? "Активные заявки" : "Faol so‘rovlar"}</span><strong>{openRequests.length}</strong></article>
        <article><UserRound /><span>{ru ? "Клиенты с доступом" : "Ruxsatli mijozlar"}</span><strong>{new Set(data.matters.map((item) => item.clientName).filter(Boolean)).size}</strong></article>
        <article><BriefcaseBusiness /><span>{ru ? "Дела в работе" : "Ishdagi ishlar"}</span><strong>{data.matters.length}</strong></article>
        <article><MessageSquareText /><span>{ru ? "Сообщения" : "Xabarlar"}</span><strong>{data.messages.length}</strong></article>
      </div>
      <div className="lawyer-dashboard-grid">
        <section><header><h2>{ru ? "Требует внимания" : "E’tibor talab qiladi"}</h2><Link href={`${base}/consultations?view=requests`}>{ru ? "Все заявки" : "Barcha so‘rovlar"}</Link></header>{openRequests.slice(0, 4).map((item) => <Link className="lawyer-work-row" href={`${base}/consultations?view=requests#request-${item.id}`} key={item.id}><CircleAlert /><span><strong>{statusCopy(item.status, ru)}</strong><small>{item.anonymizedSummary}</small></span></Link>)}{!openRequests.length && <Empty text={ru ? "Нет заявок, требующих действия." : "Amal talab qiladigan so‘rovlar yo‘q."} />}</section>
        <section><header><h2>{ru ? "Сегодня и далее" : "Bugun va keyin"}</h2><Link href={`${base}/calendar`}>{ru ? "Календарь" : "Kalendar"}</Link></header>{nextConsultation && <div className="lawyer-work-row"><CalendarClock /><span><strong>{ru ? "Следующая консультация" : "Keyingi maslahat"}</strong><small>{formatDate(nextConsultation.startsAt, ru)} · {nextConsultation.format}</small></span></div>}{dueTasks.slice(0, 3).map((item) => <div className="lawyer-work-row" key={item.id}><Clock3 /><span><strong>{item.title}</strong><small>{item.dueAt ? formatDate(item.dueAt, ru) : item.status}</small></span></div>)}{!nextConsultation && !dueTasks.length && <Empty text={ru ? "На ближайшее время событий нет." : "Yaqin vaqt uchun voqealar yo‘q."} />}</section>
      </div>
    </>}
  </section>;
}

export function LawyerHubClient({ locale }: { locale: PlatformLocale }) {
  const view = useSearchParams().get("view") ?? "requests";
  if (view === "requests") return <LawyerRequestsClient locale={locale} />;
  if (view === "schedule") return <LawyerScheduleClient locale={locale} />;
  return <LawyerRecordsClient locale={locale} view={view} />;
}

function LawyerRecordsClient({ locale, view }: { locale: PlatformLocale; view: string }) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const { data, loading, error } = useLawyerWorkspace();
  const definitions: Record<string, { title: string; description: string; icon: typeof UserRound }> = {
    clients: { title: ru ? "Клиенты" : "Mijozlar", description: ru ? "Только клиенты, которые явно предоставили доступ к делу." : "Faqat ishga aniq ruxsat bergan mijozlar.", icon: UsersRound },
    matters: { title: ru ? "Дела" : "Ishlar", description: ru ? "Дела в пределах действующих разрешений клиента." : "Mijozning amaldagi ruxsatlari doirasidagi ishlar.", icon: BriefcaseBusiness },
    messages: { title: ru ? "Сообщения" : "Xabarlar", description: ru ? "Переписка по подтверждённым заявкам." : "Tasdiqlangan so‘rovlar bo‘yicha yozishmalar.", icon: MessageSquareText },
    documents: { title: ru ? "Документы клиентов" : "Mijoz hujjatlari", description: ru ? "Документы только из дел с активным доступом." : "Faqat faol ruxsatli ishlardagi hujjatlar.", icon: FileText },
    tasks: { title: ru ? "Задачи" : "Vazifalar", description: ru ? "Сроки и задачи по доступным делам." : "Ruxsatli ishlar bo‘yicha muddat va vazifalar.", icon: CheckCircle2 },
  };
  const definition = definitions[view] ?? definitions.matters;
  const Icon = definition.icon;
  const clients = useMemo(() => Array.from(new Map((data?.matters ?? []).filter((item) => item.clientName).map((item) => [item.clientName, item])).values()), [data?.matters]);
  return <section className="lawyer-workspace lawyer-records"><header className="lawyer-records-header"><Icon /><div><small>JURO · {ru ? "кабинет юриста" : "yurist kabineti"}</small><h1>{definition.title}</h1><p>{definition.description}</p></div></header>{error && <p className="lawyer-workspace-error" role="alert">{error}</p>}{loading && !data ? <div className="lawyer-workspace-loading"><LoaderCircle className="spin" /></div> : <div className="lawyer-record-list">
    {view === "clients" && clients.map((item) => <article key={item.clientName}><UserRound /><div><strong>{item.clientName}</strong><small>{item.legalArea || (ru ? "Область не указана" : "Yo‘nalish ko‘rsatilmagan")}</small></div><span>{(data?.matters ?? []).filter((matter) => matter.clientName === item.clientName).length} {ru ? "дел" : "ish"}</span></article>)}
    {view === "matters" && data?.matters.map((item) => <article key={item.id}><BriefcaseBusiness /><div><strong>{item.title}</strong><small>{item.clientName || "—"} · {item.legalArea || item.status}</small></div><span>{item.status}</span></article>)}
    {view === "messages" && data?.messages.map((item) => <Link href={`${base}/consultations?view=requests#request-${item.requestId}`} key={item.id}><MessageSquareText /><div><strong>{item.authorRole === "lawyer" ? (ru ? "Вы" : "Siz") : (ru ? "Клиент" : "Mijoz")}</strong><small>{item.body}</small></div><time>{formatDate(item.createdAt, ru)}</time></Link>)}
    {view === "documents" && data?.documents.map((item) => <article key={item.id}><FileText /><div><strong>{item.title}</strong><small>{item.category} · {item.status}</small></div><time>{formatDate(item.updatedAt, ru)}</time></article>)}
    {view === "tasks" && data?.tasks.map((item) => <article key={item.id}><CheckCircle2 /><div><strong>{item.title}</strong><small>{item.status}</small></div><time>{item.dueAt ? formatDate(item.dueAt, ru) : "—"}</time></article>)}
    {data && ((view === "clients" && !clients.length) || (view === "matters" && !data.matters.length) || (view === "messages" && !data.messages.length) || (view === "documents" && !data.documents.length) || (view === "tasks" && !data.tasks.length)) && <Empty text={ru ? "Реальных записей пока нет." : "Hozircha haqiqiy yozuvlar yo‘q."} />}
  </div>}</section>;
}

type ScheduleRule = { id?: string; weekday: number; startsAt: string; endsAt: string; status: "active" | "paused" };
type UnavailabilityPeriod = { id?: string; startsAt: string; endsAt: string; reason: string | null };
const weekdays = [[1, "Понедельник", "Dushanba"], [2, "Вторник", "Seshanba"], [3, "Среда", "Chorshanba"], [4, "Четверг", "Payshanba"], [5, "Пятница", "Juma"], [6, "Суббота", "Shanba"], [7, "Воскресенье", "Yakshanba"]] as const;

export function LawyerScheduleClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [unavailability, setUnavailability] = useState<UnavailabilityPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    fetch("/api/platform/lawyer-schedule", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as {
          rules?: ScheduleRule[];
          unavailability?: UnavailabilityPeriod[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || "SCHEDULE_UNAVAILABLE");
        setRules(body.rules ?? []);
        setUnavailability((body.unavailability ?? []).map((period) => ({
          ...period,
          startsAt: toLocalDateTime(period.startsAt),
          endsAt: toLocalDateTime(period.endsAt),
        })));
      })
      .catch((value) => setError(value instanceof Error ? value.message : String(value)))
      .finally(() => setLoading(false));
  }, []);
  function toggle(weekday: number, checked: boolean) { setRules((current) => checked ? [...current, { weekday, startsAt: "09:00", endsAt: "18:00", status: "active" }] : current.filter((item) => item.weekday !== weekday)); }
  function change(weekday: number, field: "startsAt" | "endsAt", value: string) { setRules((current) => current.map((item) => item.weekday === weekday ? { ...item, [field]: value } : item)); }
  function addUnavailability() {
    const startsAt = nextLocalHour();
    const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60_000);
    setUnavailability((current) => [...current, {
      startsAt,
      endsAt: toLocalDateTime(endsAt.toISOString()),
      reason: "",
    }]);
  }
  function changeUnavailability(index: number, field: "startsAt" | "endsAt" | "reason", value: string) {
    setUnavailability((current) => current.map((period, periodIndex) => periodIndex === index ? { ...period, [field]: value } : period));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/platform/lawyer-schedule", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({
          rules: rules.map(({ weekday, startsAt, endsAt, status }) => ({ weekday, startsAt, endsAt, status })),
          unavailability: unavailability.map(({ startsAt, endsAt, reason }) => ({
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            reason: reason?.trim() || undefined,
          })),
          locale,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "SCHEDULE_SAVE_FAILED");
      setNotice(ru ? "Рабочие часы и недоступность сохранены." : "Ish vaqti va band davrlar saqlandi.");
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setSaving(false);
    }
  }
  return <section className="lawyer-workspace lawyer-schedule">
    <header className="lawyer-records-header"><CalendarClock /><div><small>JURO · {ru ? "доступность" : "mavjudlik"}</small><h1>{ru ? "Расписание консультаций" : "Maslahat jadvali"}</h1><p>{ru ? "Укажите реальные рабочие часы, перерывы и периоды недоступности. Запись клиента не создаётся без отдельного подтверждения." : "Haqiqiy ish vaqtini, tanaffus va band davrlarni ko‘rsating. Mijoz yozuvi alohida tasdiqsiz yaratilmaydi."}</p></div></header>
    {error && <p className="lawyer-workspace-error" role="alert">{error}</p>}
    {notice && <p className="lawyer-workspace-notice" role="status">{notice}</p>}
    {loading ? <div className="lawyer-workspace-loading"><LoaderCircle className="spin" /></div> : <form onSubmit={(event) => void save(event)}>
      <section className="lawyer-schedule-section" aria-labelledby="lawyer-working-hours"><header><div><h2 id="lawyer-working-hours">{ru ? "Рабочие часы" : "Ish vaqti"}</h2><p>{ru ? "Повторяющиеся интервалы по дням недели." : "Hafta kunlari bo‘yicha takroriy vaqtlar."}</p></div></header>{weekdays.map(([weekday, ruLabel, uzLabel]) => { const rule = rules.find((item) => item.weekday === weekday); return <div className="lawyer-schedule-row" key={weekday}><label><input type="checkbox" checked={Boolean(rule)} onChange={(event) => toggle(weekday, event.target.checked)} />{ru ? ruLabel : uzLabel}</label><input type="time" disabled={!rule} value={rule?.startsAt ?? "09:00"} onChange={(event) => change(weekday, "startsAt", event.target.value)} aria-label={`${ru ? ruLabel : uzLabel}: ${ru ? "начало" : "boshlanish"}`} /><span>—</span><input type="time" disabled={!rule} value={rule?.endsAt ?? "18:00"} onChange={(event) => change(weekday, "endsAt", event.target.value)} aria-label={`${ru ? ruLabel : uzLabel}: ${ru ? "окончание" : "tugash"}`} /></div>})}</section>
      <section className="lawyer-schedule-section lawyer-unavailability" aria-labelledby="lawyer-unavailability"><header><div><h2 id="lawyer-unavailability">{ru ? "Перерывы и недоступность" : "Tanaffus va band vaqt"}</h2><p>{ru ? "Разовые интервалы исключаются из доступного времени." : "Bir martalik oraliqlar bo‘sh vaqtdan chiqariladi."}</p></div><button type="button" onClick={addUnavailability}><Plus />{ru ? "Добавить" : "Qo‘shish"}</button></header>{unavailability.map((period, index) => <div className="lawyer-unavailability-row" key={period.id || index}><label>{ru ? "Начало" : "Boshlanishi"}<input type="datetime-local" required value={period.startsAt} onChange={(event) => changeUnavailability(index, "startsAt", event.target.value)} /></label><label>{ru ? "Окончание" : "Tugashi"}<input type="datetime-local" required value={period.endsAt} onChange={(event) => changeUnavailability(index, "endsAt", event.target.value)} /></label><label>{ru ? "Причина (необязательно)" : "Sabab (ixtiyoriy)"}<input maxLength={500} value={period.reason || ""} onChange={(event) => changeUnavailability(index, "reason", event.target.value)} /></label><button className="lawyer-remove-period" type="button" aria-label={ru ? "Удалить период" : "Davrni o‘chirish"} onClick={() => setUnavailability((current) => current.filter((_, periodIndex) => periodIndex !== index))}><Trash2 /></button></div>)}{!unavailability.length && <p className="lawyer-unavailability-empty">{ru ? "Периоды недоступности не добавлены." : "Band davrlar qo‘shilmagan."}</p>}</section>
      <button className="lawyer-schedule-save" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />}{ru ? "Сохранить расписание" : "Jadvalni saqlash"}</button>
    </form>}
  </section>;
}

function Empty({ text }: { text: string }) { return <div className="lawyer-record-empty"><CheckCircle2 /><p>{text}</p></div>; }
function formatDate(value: string, ru: boolean) { return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value)); }
function toLocalDateTime(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function nextLocalHour() { const date = new Date(Date.now() + 60 * 60_000); date.setMinutes(0, 0, 0); return toLocalDateTime(date.toISOString()); }
