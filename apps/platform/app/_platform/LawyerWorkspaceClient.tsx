"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated lawyer data is loaded after hydration */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BriefcaseBusiness, CalendarClock, CheckCircle2, CircleAlert, Clock3, ExternalLink, FileText, LoaderCircle, MessageSquareText, Plus, Save, Send, Trash2, UserRound, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";
import { LawyerRequestsClient } from "./LawyerRequestsClient";
import { LawyerProfessionalTools } from "./LawyerProfessionalTools";

type LawyerProfileSummary = { id: string; displayName: string; status: string; marketplaceStatus: string; availabilityStatus: string; nextAvailableAt: string | null; profileRevision: number };
type RequestItem = { id: string; status: string; anonymizedSummary: string; createdAt: string; updatedAt: string; caseId: string | null; caseTitle: string | null; legalArea: string | null; clientName: string | null; hasAccess: number };
type Matter = { id: string; title: string; description: string | null; status: string; legalArea: string | null; nextDeadlineAt: string | null; updatedAt: string; clientName: string | null; requestId: string };
type Message = { id: string; requestId: string; authorRole: string; body: string; readAt: string | null; createdAt: string; documentId: string | null; documentTitle: string | null; attachmentStatus: string | null };
type DocumentItem = { id: string; title: string; category: string; status: string; updatedAt: string; caseId: string; requestId: string };
type OwnDocumentItem = { id: string; title: string; category: string; status: string; updatedAt: string };
type TaskItem = { id: string; title: string; description: string | null; legalBasis: string | null; status: string; dueAt: string | null; caseId: string; updatedAt: string; requestId: string; isEditable: number };
type TaskComment = { id: string; taskId: string; body: string; createdAt: string; authorName: string | null };
type CaseEvent = { id: string; caseId: string; eventType: string; createdAt: string };
type Consultation = { id: string; requestId: string; caseId: string; startsAt: string; endsAt: string; timezone: string; format: string; status: string; internalNote: string | null; resultNote: string | null };
type LawyerTrial = { id: string; startsAt: string; endsAt: string; status: "active" | "extended" | "converted" | "disabled"; effectiveStatus: "active" | "expired" | "converted" | "disabled"; daysRemaining: number; postExpiryMode: "stay_published" | "limit_new_requests" | "hide_profile" };
export type LawyerWorkspaceData = { profile: LawyerProfileSummary | null; trial: LawyerTrial | null; operational: boolean; unreadMessageCount: number; requests: RequestItem[]; matters: Matter[]; messages: Message[]; documents: DocumentItem[]; ownDocuments: OwnDocumentItem[]; tasks: TaskItem[]; taskComments: TaskComment[]; consultations: Consultation[]; caseEvents: CaseEvent[] };

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
      {data.trial && <section className={`lawyer-trial-banner ${data.trial.effectiveStatus}`} aria-label={ru ? "Пробный период" : "Sinov muddati"}><Clock3 /><div><strong>{data.trial.effectiveStatus === "active" ? (ru ? `Пробный период: ${data.trial.daysRemaining} дн.` : `Sinov muddati: ${data.trial.daysRemaining} kun`) : data.trial.effectiveStatus === "converted" ? (ru ? "Пробный период завершён — тариф подключён" : "Sinov muddati tugadi — tarif ulandi") : (ru ? "Пробный период завершён" : "Sinov muddati tugadi")}</strong><p>{ru ? `90 дней с даты публикации · до ${formatDate(data.trial.endsAt, true)}` : `E’lon qilingan kundan boshlab 90 kun · ${formatDate(data.trial.endsAt, false)} gacha`}</p></div></section>}
      <section className={`lawyer-status-banner ${data.operational ? "approved" : "pending"}`}><CheckCircle2 /><div><strong>{data.profile ? statusCopy(data.profile.marketplaceStatus, ru) : (ru ? "Профессиональный профиль не создан" : "Professional profil yaratilmagan")}</strong><p>{data.operational ? (ru ? "Новые назначения и доступы к делам отображаются в реальном времени." : "Yangi tayinlovlar va ish ruxsatlari real vaqtda ko‘rinadi.") : (ru ? "До публикации нельзя принимать новые заявки или видеть материалы клиентов." : "Nashr etilgunga qadar yangi so‘rovlarni qabul qilish yoki mijoz materiallarini ko‘rish mumkin emas.")}</p></div><Link href={`${base}/profile`}>{ru ? "Открыть профиль" : "Profilni ochish"}</Link></section>
      <div className="lawyer-kpi-grid">
        <article><UsersRound /><span>{ru ? "Активные заявки" : "Faol so‘rovlar"}</span><strong>{openRequests.length}</strong></article>
        <article><UserRound /><span>{ru ? "Клиенты с доступом" : "Ruxsatli mijozlar"}</span><strong>{new Set(data.matters.map((item) => item.clientName).filter(Boolean)).size}</strong></article>
        <article><BriefcaseBusiness /><span>{ru ? "Дела в работе" : "Ishdagi ishlar"}</span><strong>{data.matters.length}</strong></article>
        <article><MessageSquareText /><span>{ru ? "Непрочитанные" : "O‘qilmagan"}</span><strong>{data.unreadMessageCount}</strong></article>
      </div>
      <div className="lawyer-dashboard-grid">
        <section><header><h2>{ru ? "Требует внимания" : "E’tibor talab qiladi"}</h2><Link href={`${base}/consultations?view=requests`}>{ru ? "Все заявки" : "Barcha so‘rovlar"}</Link></header>{openRequests.slice(0, 4).map((item) => <Link className="lawyer-work-row" href={`${base}/consultations?view=requests#request-${item.id}`} key={item.id}><CircleAlert /><span><strong>{statusCopy(item.status, ru)}</strong><small>{item.anonymizedSummary}</small></span></Link>)}{!openRequests.length && <Empty text={ru ? "Нет заявок, требующих действия." : "Amal talab qiladigan so‘rovlar yo‘q."} />}</section>
        <section><header><h2>{ru ? "Сегодня и далее" : "Bugun va keyin"}</h2><Link href={`${base}/calendar`}>{ru ? "Календарь" : "Kalendar"}</Link></header>{nextConsultation && <div className="lawyer-work-row"><CalendarClock /><span><strong>{ru ? "Следующая консультация" : "Keyingi maslahat"}</strong><small>{formatDate(nextConsultation.startsAt, ru)} · {nextConsultation.format}</small></span></div>}{dueTasks.slice(0, 3).map((item) => <div className="lawyer-work-row" key={item.id}><Clock3 /><span><strong>{item.title}</strong><small>{item.dueAt ? formatDate(item.dueAt, ru) : item.status}</small></span></div>)}{!nextConsultation && !dueTasks.length && <Empty text={ru ? "На ближайшее время событий нет." : "Yaqin vaqt uchun voqealar yo‘q."} />}</section>
      </div>
      <LawyerProfessionalTools locale={locale} matters={data.matters} />
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
  const { data, loading, error, referenceTime, reload } = useLawyerWorkspace();
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
  if (view === "tasks") return <LawyerTaskRecords locale={locale} data={data} loading={loading} error={error} referenceTime={referenceTime} reload={reload} />;
  return <section className="lawyer-workspace lawyer-records"><header className="lawyer-records-header"><Icon /><div><small>JURO · {ru ? "кабинет юриста" : "yurist kabineti"}</small><h1>{definition.title}</h1><p>{definition.description}</p></div></header>{error && <p className="lawyer-workspace-error" role="alert">{error}</p>}{loading && !data ? <div className="lawyer-workspace-loading"><LoaderCircle className="spin" /></div> : <div className="lawyer-record-list">
    {view === "clients" && clients.map((item) => <article key={item.clientName}><UserRound /><div><strong>{item.clientName}</strong><small>{item.legalArea || (ru ? "Область не указана" : "Yo‘nalish ko‘rsatilmagan")}</small></div><span>{(data?.matters ?? []).filter((matter) => matter.clientName === item.clientName).length} {ru ? "дел" : "ish"}</span></article>)}
    {view === "matters" && data?.matters.map((item) => { const messages = data.messages.filter((message) => message.requestId === item.requestId); const documents = data.documents.filter((document) => document.caseId === item.id); const tasks = data.tasks.filter((task) => task.caseId === item.id); const consultations = data.consultations.filter((consultation) => consultation.caseId === item.id); const events = data.caseEvents.filter((event) => event.caseId === item.id).slice(0, 8); return <details className="lawyer-matter-card" key={item.id}><summary><BriefcaseBusiness /><span><strong>{item.title}</strong><small>{item.clientName || "—"} · {item.legalArea || item.status}</small></span><em>{item.status}</em></summary><div className="lawyer-matter-details"><p>{item.description || (ru ? "Описание дела не заполнено." : "Ish tavsifi kiritilmagan.")}</p><dl><div><dt>{ru ? "Консультации" : "Maslahatlar"}</dt><dd>{consultations.length}</dd></div><div><dt>{ru ? "Сообщения" : "Xabarlar"}</dt><dd>{messages.length}</dd></div><div><dt>{ru ? "Документы" : "Hujjatlar"}</dt><dd>{documents.length}</dd></div><div><dt>{ru ? "Задачи" : "Vazifalar"}</dt><dd>{tasks.length}</dd></div></dl>{item.nextDeadlineAt && <p><strong>{ru ? "Ближайший срок: " : "Yaqin muddat: "}</strong>{formatDate(item.nextDeadlineAt, ru)}</p>}<section><h2>{ru ? "Последние события" : "So‘nggi voqealar"}</h2>{events.length ? <ol>{events.map((event) => <li key={event.id}><span>{caseEventLabel(event.eventType, ru)}</span><time>{formatDate(event.createdAt, ru)}</time></li>)}</ol> : <p>{ru ? "Событий пока нет." : "Voqealar hozircha yo‘q."}</p>}</section><nav aria-label={ru ? "Следующие действия по делу" : "Ish bo‘yicha keyingi harakatlar"}><Link href={`${base}/consultations?view=requests#request-${item.requestId}`}>{ru ? "Открыть заявку и сообщения" : "So‘rov va xabarlarni ochish"}</Link><Link href={`${base}/consultations?view=tasks`}>{ru ? "Управлять задачами" : "Vazifalarni boshqarish"}</Link></nav></div></details>; })}
    {view === "messages" && data?.messages.map((item) => <Link href={`${base}/consultations?view=requests#request-${item.requestId}`} key={item.id}><MessageSquareText /><div><strong>{item.authorRole === "lawyer" ? (ru ? "Вы" : "Siz") : (ru ? "Клиент" : "Mijoz")}</strong><small>{item.body || item.documentTitle || (ru ? "Документ" : "Hujjat")}{item.authorRole === "lawyer" ? ` · ${item.readAt ? (ru ? "прочитано" : "o‘qilgan") : (ru ? "отправлено" : "yuborilgan")}` : ""}</small></div><time>{formatDate(item.createdAt, ru)}</time></Link>)}
    {view === "documents" && <Link href={`${base}/document-builder`}><Plus /><div><strong>{ru ? "Создать проект документа" : "Hujjat loyihasini yaratish"}</strong><small>{ru ? "Открыть существующий JURO Builder" : "Mavjud JURO Builder-ni ochish"}</small></div></Link>}
    {view === "documents" && data?.ownDocuments.map((item) => <Link href={`${base}/documents/${encodeURIComponent(item.id)}`} key={`own-${item.id}`}><FileText /><div><strong>{item.title}</strong><small>{ru ? "Ваш проект" : "Sizning loyihangiz"} · {item.status}</small></div><time>{formatDate(item.updatedAt, ru)}</time></Link>)}
    {view === "documents" && data?.documents.map((item) => <Link href={`${base}/documents/${encodeURIComponent(item.id)}`} key={item.id}><FileText /><div><strong>{item.title}</strong><small>{item.category} · {item.status}</small></div><time>{formatDate(item.updatedAt, ru)}</time></Link>)}
    {data && ((view === "clients" && !clients.length) || (view === "matters" && !data.matters.length) || (view === "messages" && !data.messages.length) || (view === "documents" && !data.documents.length && !data.ownDocuments.length)) && <Empty text={ru ? "Реальных записей пока нет." : "Hozircha haqiqiy yozuvlar yo‘q."} />}
  </div>}</section>;
}

function LawyerTaskRecords({ locale, data, loading, error, referenceTime, reload }: { locale: PlatformLocale; data: LawyerWorkspaceData | null; loading: boolean; error: string; referenceTime: number; reload: () => Promise<void> }) {
  const ru = locale === "ru";
  const requestedCaseId = useSearchParams().get("caseId") ?? "";
  const [caseFilter, setCaseFilter] = useState(requestedCaseId);
  const [statusFilter, setStatusFilter] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [taskDueDates, setTaskDueDates] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedMatter = data?.matters.find((matter) => matter.id === caseFilter) ?? data?.matters[0] ?? null;
  const visible = (data?.tasks ?? []).filter((task) => (!caseFilter || task.caseId === caseFilter) && (!statusFilter || (statusFilter === "overdue" ? Boolean(task.dueAt && Date.parse(task.dueAt) < referenceTime && !["completed", "cancelled"].includes(task.status)) : task.status === statusFilter)));

  async function mutate(payload: Record<string, unknown>, actionId: string) {
    setBusyId(actionId); setLocalError(""); setNotice("");
    try {
      const response = await fetch("/api/platform/lawyer-tasks", { method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ locale, ...payload }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "LAWYER_TASK_ACTION_FAILED");
      await reload();
      setNotice(ru ? "Задачи дела обновлены." : "Ish vazifalari yangilandi.");
    } finally { setBusyId(""); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedMatter) return;
    try { await mutate({ action: "create", requestId: selectedMatter.requestId, title, description: description.trim() || undefined, dueAt: dueAt ? new Date(dueAt).toISOString() : undefined }, "new"); setTitle(""); setDescription(""); setDueAt(""); }
    catch (value) { setLocalError(value instanceof Error ? value.message : String(value)); }
  }

  return <section className="lawyer-workspace lawyer-records lawyer-task-workspace"><header className="lawyer-records-header"><CheckCircle2 /><div><small>JURO · {ru ? "задачи" : "vazifalar"}</small><h1>{ru ? "Задачи по делам" : "Ish vazifalari"}</h1><p>{ru ? "Создавайте задачи только в делах с действующим разрешением клиента; изменения и комментарии фиксируются в аудите." : "Faqat mijozning amaldagi ruxsati bor ishlarda vazifa yarating; o‘zgarish va izohlar auditda qayd etiladi."}</p></div></header>{(error || localError) && <p className="lawyer-workspace-error" role="alert">{error || localError}</p>}{notice && <p className="lawyer-workspace-notice" role="status">{notice}</p>}{loading && !data ? <div className="lawyer-workspace-loading"><LoaderCircle className="spin" /></div> : <>
    <form className="lawyer-task-create" onSubmit={(event) => void create(event)}><header><Plus /><div><h2>{ru ? "Новая задача" : "Yangi vazifa"}</h2><p>{ru ? "Задача будет связана с выбранным клиентом и делом." : "Vazifa tanlangan mijoz va ish bilan bog‘lanadi."}</p></div></header><label>{ru ? "Дело" : "Ish"}<select value={selectedMatter?.id || ""} onChange={(event) => setCaseFilter(event.target.value)} disabled={!data?.matters.length}>{data?.matters.map((matter) => <option value={matter.id} key={matter.id}>{matter.clientName ? `${matter.clientName} · ` : ""}{matter.title}</option>)}</select></label><label>{ru ? "Название" : "Nomi"}<input required minLength={2} maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>{ru ? "Описание" : "Tavsif"}<textarea maxLength={2_000} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>{ru ? "Срок" : "Muddat"}<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label><button disabled={!selectedMatter || busyId === "new" || title.trim().length < 2}>{busyId === "new" ? <LoaderCircle className="spin" /> : <Plus />}{ru ? "Создать задачу" : "Vazifa yaratish"}</button></form>
    <div className="lawyer-task-filters"><label>{ru ? "Фильтр по делу" : "Ish filtri"}<select value={caseFilter} onChange={(event) => setCaseFilter(event.target.value)}><option value="">{ru ? "Все разрешённые дела" : "Barcha ruxsatli ishlar"}</option>{data?.matters.map((matter) => <option value={matter.id} key={matter.id}>{matter.title}</option>)}</select></label><label>{ru ? "Статус" : "Holat"}<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{ru ? "Все" : "Barchasi"}</option><option value="planned">{ru ? "Запланировано" : "Rejalashtirilgan"}</option><option value="in_progress">{ru ? "В работе" : "Jarayonda"}</option><option value="waiting_information">{ru ? "Ожидает информации" : "Ma’lumot kutilmoqda"}</option><option value="completed">{ru ? "Завершено" : "Yakunlangan"}</option><option value="overdue">{ru ? "Просрочено" : "Muddati o‘tgan"}</option></select></label></div>
    <div className="lawyer-task-list">{visible.map((task) => { const matter = data?.matters.find((item) => item.id === task.caseId); const taskComments = data?.taskComments.filter((comment) => comment.taskId === task.id) ?? []; const overdue = Boolean(task.dueAt && Date.parse(task.dueAt) < referenceTime && !["completed", "cancelled"].includes(task.status)); const editableDueAt = taskDueDates[task.id] ?? (task.dueAt ? toLocalDateTime(task.dueAt) : ""); const sourceHref = officialLexTaskHref(task.legalBasis); return <article key={task.id} data-overdue={overdue ? "true" : "false"}><header><CheckCircle2 /><div><strong>{task.title}</strong><small>{matter?.clientName || "—"} · {matter?.title || task.caseId}</small></div><span>{overdue ? (ru ? "Просрочено" : "Muddati o‘tgan") : taskStatusLabel(task.status, ru)}</span></header>{task.description && <p>{task.description}</p>}{sourceHref && <a className="lawyer-task-source" href={sourceHref} target="_blank" rel="noopener noreferrer"><ExternalLink />{ru ? "Официальный источник Lex.uz" : "Lex.uz rasmiy manbasi"}</a>}<div className="lawyer-task-meta">{task.isEditable ? <label>{ru ? "Срок" : "Muddat"}<input type="datetime-local" value={editableDueAt} disabled={busyId === `due-${task.id}` || ["completed", "cancelled"].includes(task.status)} onChange={(event) => setTaskDueDates((current) => ({ ...current, [task.id]: event.target.value }))} onBlur={(event) => { const nextDueAt = event.target.value; const currentDueAt = task.dueAt ? toLocalDateTime(task.dueAt) : ""; if (nextDueAt === currentDueAt) return; void mutate({ action: "update", requestId: task.requestId, taskId: task.id, status: task.status, dueAt: nextDueAt ? new Date(nextDueAt).toISOString() : null }, `due-${task.id}`).catch((value) => setLocalError(value instanceof Error ? value.message : String(value))); }} /></label> : task.dueAt && <time>{formatDate(task.dueAt, ru)}</time>}{task.isEditable ? <select aria-label={ru ? "Статус задачи" : "Vazifa holati"} value={task.status} disabled={busyId === task.id || ["completed", "cancelled"].includes(task.status)} onChange={(event) => void mutate({ action: "update", requestId: task.requestId, taskId: task.id, status: event.target.value }, task.id).catch((value) => setLocalError(value instanceof Error ? value.message : String(value)))}>{task.status === "overdue" && <option value="overdue" disabled>{ru ? "Просрочено" : "Muddati o‘tgan"}</option>}<option value="planned">{ru ? "Запланировано" : "Rejalashtirilgan"}</option><option value="in_progress">{ru ? "В работе" : "Jarayonda"}</option><option value="waiting_information">{ru ? "Ожидает информации" : "Ma’lumot kutilmoqda"}</option><option value="waiting_counterparty">{ru ? "Ожидает другую сторону" : "Qarshi tomon kutilmoqda"}</option><option value="completed">{ru ? "Завершено" : "Yakunlangan"}</option><option value="cancelled">{ru ? "Отменено" : "Bekor qilingan"}</option></select> : <small>{ru ? "Задача плана клиента доступна только для комментария." : "Mijoz rejasidagi vazifa faqat izoh uchun ochiq."}</small>}</div>{taskComments.length > 0 && <ol className="lawyer-task-comments">{taskComments.map((comment) => <li key={comment.id}><MessageSquareText /><div><strong>{comment.authorName || (ru ? "Юрист" : "Yurist")}</strong><p>{comment.body}</p><time>{formatDate(comment.createdAt, ru)}</time></div></li>)}</ol>}<form className="lawyer-task-comment" onSubmit={(event) => { event.preventDefault(); const body = comments[task.id]?.trim(); if (!body) return; void mutate({ action: "comment", requestId: task.requestId, taskId: task.id, body }, `comment-${task.id}`).then(() => setComments((current) => ({ ...current, [task.id]: "" }))).catch((value) => setLocalError(value instanceof Error ? value.message : String(value))); }}><label className="sr-only" htmlFor={`task-comment-${task.id}`}>{ru ? "Комментарий к задаче" : "Vazifa izohi"}</label><textarea id={`task-comment-${task.id}`} maxLength={2_000} value={comments[task.id] || ""} onChange={(event) => setComments((current) => ({ ...current, [task.id]: event.target.value }))} placeholder={ru ? "Добавить комментарий…" : "Izoh qo‘shish…"} /><button aria-label={ru ? "Отправить комментарий" : "Izohni yuborish"} disabled={!comments[task.id]?.trim() || busyId === `comment-${task.id}`} >{busyId === `comment-${task.id}` ? <LoaderCircle className="spin" /> : <Send />}</button></form></article>; })}{data && !visible.length && <Empty text={ru ? "Задач по выбранным фильтрам нет." : "Tanlangan filtrlar bo‘yicha vazifa yo‘q."} />}</div>
  </>}</section>;
}

function officialLexTaskHref(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && (url.hostname === "lex.uz" || url.hostname === "www.lex.uz")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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
function taskStatusLabel(status: string, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    planned: ["Запланировано", "Rejalashtirilgan"],
    in_progress: ["В работе", "Jarayonda"],
    waiting_information: ["Ожидает информации", "Ma’lumot kutilmoqda"],
    waiting_counterparty: ["Ожидает другую сторону", "Qarshi tomon kutilmoqda"],
    completed: ["Завершено", "Yakunlangan"],
    cancelled: ["Отменено", "Bekor qilingan"],
  };
  return labels[status]?.[ru ? 0 : 1] || (ru ? "Статус задачи" : "Vazifa holati");
}
function caseEventLabel(eventType: string, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    case_created: ["Дело создано", "Ish yaratildi"],
    action_plan_created: ["Создан план действий", "Harakatlar rejasi yaratildi"],
    tasks_created: ["Задачи добавлены из плана", "Rejadan vazifalar qo‘shildi"],
    lawyer_access_granted: ["Юристу предоставлен доступ", "Yuristga ruxsat berildi"],
    lawyer_access_revoked: ["Доступ юриста отозван", "Yurist ruxsati bekor qilindi"],
    lawyer_task_created: ["Юрист добавил задачу", "Yurist vazifa qo‘shdi"],
    lawyer_task_updated: ["Юрист обновил задачу", "Yurist vazifani yangiladi"],
    lawyer_task_comment_added: ["Юрист добавил комментарий", "Yurist izoh qo‘shdi"],
    lawyer_document_requested: ["Юрист запросил документ", "Yurist hujjat so‘radi"],
    lawyer_document_provided: ["Клиент предоставил документ", "Mijoz hujjat taqdim etdi"],
    lawyer_document_request_cancelled: ["Запрос документа отменён", "Hujjat so‘rovi bekor qilindi"],
    lawyer_request_message_sent: ["Отправлено сообщение по делу", "Ish bo‘yicha xabar yuborildi"],
    lawyer_consultation_proposed: ["Предложено время консультации", "Maslahat vaqti taklif qilindi"],
    lawyer_consultation_confirmed: ["Консультация подтверждена", "Maslahat tasdiqlandi"],
    lawyer_consultation_in_progress: ["Консультация началась", "Maslahat boshlandi"],
    lawyer_consultation_completed: ["Консультация завершена", "Maslahat yakunlandi"],
    lawyer_consultation_cancelled: ["Консультация отменена", "Maslahat bekor qilindi"],
  };
  return labels[eventType]?.[ru ? 0 : 1] || (ru ? "Обновление дела" : "Ish yangilanishi");
}
function formatDate(value: string, ru: boolean) { return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value)); }
function toLocalDateTime(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function nextLocalHour() { const date = new Date(Date.now() + 60 * 60_000); date.setMinutes(0, 0, 0); return toLocalDateTime(date.toISOString()); }
