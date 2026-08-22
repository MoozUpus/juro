"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FilePenLine,
  FileSearch2,
  FileText,
  ExternalLink,
  History,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  RotateCcw,
  Scale,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CASE_SECTIONS,
  type CaseSection,
  type PlatformLocale,
} from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

type Step = { id: string; title: string; status: string; dueAt?: string | null };
type CaseRecord = { id: string; title: string; description?: string | null; legalArea: string; status: string; nextDeadlineAt?: string | null; archivedAt?: string | null; completedAt?: string | null; lifecycleRevision?: number; progressPercent?: number; steps?: Step[] };
type TaskComment = { id: string; taskId: string; body: string; createdAt: string; authorName?: string | null };
type Task = { id: string; title: string; description?: string | null; status: string; dueAt?: string | null; safeDueAt?: string | null; legalBasis?: string | null; comments?: TaskComment[] };
type CaseDocument = { id: string; title: string; status: string; language: string; planStepId?: string | null; updatedAt: string };
type CaseActivity = { eventType: string; createdAt: string; metadata: Record<string, unknown> };
type CaseConversation = { id: string; title: string; status: string; locale: string; updatedAt: string };
type CaseComparison = { id: string; status: string; stage: string; overallRisk?: string | null; errorCode?: string | null; updatedAt: string };
type CaseAnalysis = { id: string; status: string; errorCode?: string | null; fileName: string; mimeType: string; updatedAt: string };
type CaseSource = { id: string; actTitle: string; actIdentifier?: string | null; officialUrl: string; status: string; locale: string; lastCheckedAt: string };
type CaseBookmark = { bookmarkId: string; sourceId: string; versionId: string; comment?: string | null; revision: number; createdAt: string; updatedAt: string; actTitle: string; actIdentifier?: string | null; officialUrl: string; locale: string; lastCheckedAt: string; isCurrentVersion: boolean };
type CaseParticipant = { userId: string; role: string; status: string; joinedAt: string; displayName: string; currentUser: boolean };
type CaseLawyerRequest = { id: string; status: string; updatedAt: string; lawyerName?: string | null; activeGrantId?: string | null; grantedAt?: string | null; expiresAt?: string | null };
type CaseWorkspaceData = {
  documents?: CaseDocument[];
  activity?: CaseActivity[];
  conversations?: CaseConversation[];
  comparisons?: CaseComparison[];
  analyses?: CaseAnalysis[];
  sources?: CaseSource[];
  bookmarks?: CaseBookmark[];
  participants?: CaseParticipant[];
  lawyerRequests?: CaseLawyerRequest[];
  error?: string;
};

const sectionIcons: Record<CaseSection, typeof FileText> = {
  overview: FilePenLine,
  chat: MessageSquareText,
  documents: FileText,
  analyses: FileSearch2,
  plan: ListChecks,
  calendar: CalendarDays,
  sources: BookOpenCheck,
  participants: UsersRound,
  lawyer: Scale,
  activity: History,
  access: LockKeyhole,
};

function date(value: string | null | undefined, locale: PlatformLocale) {
  if (!value) return locale === "ru" ? "Не назначен" : "Belgilanmagan";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) return locale === "ru" ? "Не назначен" : "Belgilanmagan";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(parsed);
}

export function CaseWorkspaceClient({
  locale,
  caseId,
  section = "overview",
}: {
  locale: PlatformLocale;
  caseId: string;
  section?: CaseSection;
}) {
  const ru = locale === "ru";
  const router = useRouter();
  const base = usePlatformBasePath();
  const caseBase = `${base}/cases/${encodeURIComponent(caseId)}`;
  const [item, setItem] = useState<CaseRecord | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workspaceData, setWorkspaceData] = useState<CaseWorkspaceData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState("");
  const lifecycleKeys = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/platform/cases?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" }).then(async (response) => { const body = await response.json() as { cases?: CaseRecord[]; error?: string }; if (!response.ok) throw new Error(body.error || "CASE_UNAVAILABLE"); return body.cases?.[0] ?? null; }),
      fetch(`/api/platform/cases/${encodeURIComponent(caseId)}/tasks`, { cache: "no-store" }).then(async (response) => { const body = await response.json() as { tasks?: Task[]; error?: string }; if (!response.ok) throw new Error(body.error || "TASKS_UNAVAILABLE"); return body.tasks ?? []; }),
      fetch(`/api/platform/cases/${encodeURIComponent(caseId)}/workspace`, { cache: "no-store" }).then(async (response) => { const body = await response.json() as CaseWorkspaceData; if (!response.ok) throw new Error(body.error || "CASE_WORKSPACE_UNAVAILABLE"); return body; }),
    ]).then(([record, caseTasks, data]) => {
      if (!cancelled) {
        setItem(record);
        setTasks(caseTasks);
        setWorkspaceData(data);
      }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [caseId]);

  if (loading) return <div className="case-workspace-loading" aria-live="polite"><LoaderCircle />{ru ? "Загружаем дело…" : "Ish yuklanmoqda…"}</div>;
  if (error || !item) return <section className="case-workspace-empty"><CircleAlert /><h1>{ru ? "Дело недоступно" : "Ish mavjud emas"}</h1><p>{ru ? "Оно не найдено в текущем пространстве или доступ к нему изменён." : "U joriy makonda topilmadi yoki unga kirish o‘zgardi."}</p><Link href={`${base}/cases`}>{ru ? "К списку дел" : "Ishlar ro‘yxatiga"}</Link></section>;

  const complete = item.steps?.filter((step) => step.status === "completed").length ?? 0;

  async function changeLifecycle(action: "complete" | "reopen" | "archive") {
    const unresolvedTasks = tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length;
    const unresolvedSteps = (item?.steps ?? []).filter((step) => !["completed", "cancelled"].includes(step.status)).length;
    if (action === "complete" && (unresolvedTasks || unresolvedSteps)) {
      const accepted = window.confirm(ru
        ? `Останутся незавершёнными: задач — ${unresolvedTasks}, шагов плана — ${unresolvedSteps}. Завершить дело?`
        : `Yakunlanmaganlari qoladi: vazifalar — ${unresolvedTasks}, reja qadamlari — ${unresolvedSteps}. Ish yakunlansinmi?`);
      if (!accepted) return;
    }
    const idempotencyKey = lifecycleKeys.current.get(action) ?? `case-${action}-${crypto.randomUUID()}`;
    lifecycleKeys.current.set(action, idempotencyKey);
    setLifecycleBusy(action);
    setLifecycleError("");
    try {
      const response = await fetch(`/api/platform/cases/${encodeURIComponent(caseId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, "x-juro-csrf": "1" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json() as { status?: string; archivedAt?: string | null; completedAt?: string | null; lifecycleRevision?: number; error?: string; code?: string };
      if (!response.ok) throw new Error(body.code || body.error || "CASE_LIFECYCLE_FAILED");
      lifecycleKeys.current.delete(action);
      if (action === "archive") {
        router.replace(`${base}/archive`);
        return;
      }
      setItem((current) => current ? { ...current, status: body.status ?? current.status, archivedAt: body.archivedAt ?? null, completedAt: body.completedAt ?? null, lifecycleRevision: body.lifecycleRevision ?? current.lifecycleRevision } : current);
    } catch (cause) {
      setLifecycleError(localizedLifecycleError(cause instanceof Error ? cause.message : String(cause), ru));
    } finally {
      setLifecycleBusy("");
    }
  }

  return <section className="case-workspace" aria-labelledby="case-title">
    <header><div><p>JURO · {ru ? "Дело" : "Ish"}</p><h1 id="case-title">{item.title}</h1><span>{item.legalArea} · {statusLabel(item.status, ru)}</span>{item.description && <p className="case-workspace-description">{item.description}</p>}</div><div className="case-workspace-actions"><Link href={`${caseBase}/plan`}><ListChecks />{ru ? "План действий" : "Harakatlar rejasi"}</Link><Link href={`${caseBase}/calendar`}><CalendarDays />{ru ? "Сроки" : "Muddatlar"}</Link>{item.status === "completed" ? <><button type="button" disabled={Boolean(lifecycleBusy)} onClick={() => void changeLifecycle("reopen")}><RotateCcw />{ru ? "Вернуть в работу" : "Ishga qaytarish"}</button><button type="button" disabled={Boolean(lifecycleBusy)} onClick={() => void changeLifecycle("archive")}><Archive />{ru ? "В архив" : "Arxivga"}</button></> : <button type="button" disabled={Boolean(lifecycleBusy)} onClick={() => void changeLifecycle("complete")}><CheckCircle2 />{ru ? "Завершить дело" : "Ishni yakunlash"}</button>}</div></header>
    {lifecycleError && <p className="case-lifecycle-error" role="alert"><CircleAlert />{lifecycleError}</p>}
    <div className="case-workspace-summary"><article><small>{ru ? "Прогресс плана" : "Reja jarayoni"}</small><strong>{item.progressPercent ?? 0}%</strong><span>{complete}/{item.steps?.length ?? 0} {ru ? "шагов завершено" : "qadam yakunlandi"}</span></article><article><small>{ru ? "Ближайший срок" : "Eng yaqin muddat"}</small><strong>{date(item.nextDeadlineAt, locale)}</strong><span>{ru ? "из активного плана" : "faol rejadan"}</span></article><article><small>{ru ? "Подтверждённые задачи" : "Tasdiqlangan vazifalar"}</small><strong>{tasks.length}</strong><span>{ru ? "реальные записи дела" : "ishning haqiqiy yozuvlari"}</span></article></div>
    <nav className="case-workspace-tabs" aria-label={ru ? "Разделы дела" : "Ish bo‘limlari"}>{CASE_SECTIONS.map((name) => {
      const Icon = sectionIcons[name];
      const href = name === "overview" ? caseBase : `${caseBase}/${name}`;
      return <Link key={name} href={href} aria-current={section === name ? "page" : undefined}><Icon aria-hidden="true" />{sectionLabel(name, ru)}</Link>;
    })}</nav>
    <CaseSectionPanel section={section} locale={locale} base={base} item={item} tasks={tasks} data={workspaceData} />
  </section>;
}

function CaseSectionPanel({ section, locale, base, item, tasks, data }: { section: CaseSection; locale: PlatformLocale; base: string; item: CaseRecord; tasks: Task[]; data: CaseWorkspaceData }) {
  const ru = locale === "ru";
  if (section === "overview") return <div className="case-workspace-grid"><PlanSteps item={item} locale={locale} base={base} /><TaskList tasks={tasks} locale={locale} /></div>;
  if (section === "plan") return <section className="case-workspace-tab-panel"><PanelHeading icon={ListChecks} title={ru ? "План и задачи" : "Reja va vazifalar"} action={<Link href={`${base}/action-plan/${encodeURIComponent(item.id)}`}>{ru ? "Редактировать план" : "Rejani tahrirlash"}<ArrowUpRight /></Link>} /><div className="case-workspace-grid case-workspace-grid-inset"><PlanSteps item={item} locale={locale} base={base} embedded /><TaskList tasks={tasks} locale={locale} embedded /></div></section>;
  if (section === "calendar") return <SimpleList icon={CalendarDays} title={ru ? "Сроки этого дела" : "Ushbu ish muddatlari"} empty={ru ? "В подтверждённых задачах пока нет сроков." : "Tasdiqlangan vazifalarda hozircha muddat yo‘q."} items={tasks.filter((task) => task.dueAt).map((task) => ({ id: task.id, title: task.title, meta: `${date(task.dueAt, locale)} · ${statusLabel(task.status, ru)}`, trailing: task.safeDueAt ? (ru ? `Безопасная дата: ${date(task.safeDueAt, locale)}` : `Xavfsiz sana: ${date(task.safeDueAt, locale)}`) : undefined }))} action={<Link href={`${base}/calendar?caseId=${encodeURIComponent(item.id)}`}>{ru ? "Открыть календарь" : "Kalendarni ochish"}<ArrowUpRight /></Link>} />;
  if (section === "documents") return <SimpleList icon={FileText} title={ru ? "Документы дела" : "Ish hujjatlari"} empty={ru ? "В дело ещё не привязаны документы." : "Ishga hali hujjatlar biriktirilmagan."} items={(data.documents ?? []).map((document) => ({ id: document.id, title: document.title, meta: `${statusLabel(document.status, ru)} · ${document.language}`, href: `${base}/documents/${encodeURIComponent(document.id)}` }))} action={<Link href={`${base}/document-builder?caseId=${encodeURIComponent(item.id)}`}>{ru ? "Создать документ" : "Hujjat yaratish"}<ArrowUpRight /></Link>} />;
  if (section === "chat") return <SimpleList icon={MessageSquareText} title={ru ? "Диалоги по делу" : "Ish suhbatlari"} empty={ru ? "К делу ещё не привязан AI-диалог." : "Ishga hali AI suhbati biriktirilmagan."} items={(data.conversations ?? []).map((conversation) => ({ id: conversation.id, title: conversation.title, meta: `${statusLabel(conversation.status, ru)} · ${date(conversation.updatedAt, locale)}`, href: `${base}/ai-lawyer/chat/${encodeURIComponent(conversation.id)}` }))} action={<Link href={`${base}/ai-lawyer/new?caseId=${encodeURIComponent(item.id)}`}>{ru ? "Задать вопрос по делу" : "Ish bo‘yicha savol berish"}<ArrowUpRight /></Link>} />;
  if (section === "analyses") return <SimpleList icon={FileSearch2} title={ru ? "Анализы и сравнения" : "Tahlil va taqqoslashlar"} empty={ru ? "К делу ещё не привязаны анализы или сравнения документов." : "Ishga hali hujjat tahlili yoki taqqoslash biriktirilmagan."} items={[
    ...(data.analyses ?? []).map((analysis) => ({ id: `analysis:${analysis.id}`, title: analysis.fileName, meta: `${statusLabel(analysis.status, ru)} · ${date(analysis.updatedAt, locale)}`, href: `${base}/document-review?analysisId=${encodeURIComponent(analysis.id)}&caseId=${encodeURIComponent(item.id)}` })),
    ...(data.comparisons ?? []).map((comparison) => ({ id: `comparison:${comparison.id}`, title: ru ? "Сравнение версий документа" : "Hujjat nusxalarini taqqoslash", meta: `${statusLabel(comparison.status, ru)}${comparison.overallRisk ? ` · ${riskLabel(comparison.overallRisk, ru)}` : ""} · ${date(comparison.updatedAt, locale)}`, href: `${base}/documents/comparisons/${encodeURIComponent(comparison.id)}` })),
  ]} action={<Link href={`${base}/document-review?caseId=${encodeURIComponent(item.id)}`}>{ru ? "Анализировать документ" : "Hujjatni tahlil qilish"}<ArrowUpRight /></Link>} />;
  if (section === "sources") return <CaseSourcesPanel locale={locale} sources={data.sources ?? []} initialBookmarks={data.bookmarks ?? []} />;
  if (section === "participants") return <SimpleList icon={UsersRound} title={ru ? "Участники пространства" : "Makon ishtirokchilari"} empty={ru ? "Активных участников нет." : "Faol ishtirokchilar yo‘q."} note={ru ? "Сейчас доступ к делу наследуется от активного workspace. Отдельные временные права юриста показаны в разделе «Доступ»." : "Hozir ishga kirish faol workspace orqali meros bo‘ladi. Yuristning alohida vaqtinchalik huquqlari «Ruxsat» bo‘limida ko‘rsatiladi."} items={(data.participants ?? []).map((participant) => ({ id: participant.userId, title: participant.currentUser ? `${participant.displayName} · ${ru ? "вы" : "siz"}` : participant.displayName, meta: `${roleLabel(participant.role, ru)} · ${date(participant.joinedAt, locale)}` }))} />;
  if (section === "lawyer") return <SimpleList icon={Scale} title={ru ? "Живой юрист" : "Jonli yurist"} empty={ru ? "По этому делу ещё нет заявки юристу." : "Bu ish bo‘yicha yuristga so‘rov yo‘q."} items={(data.lawyerRequests ?? []).map((request) => ({ id: request.id, title: request.lawyerName || (ru ? "Назначение юриста ожидается" : "Yurist tayinlanishi kutilmoqda"), meta: `${statusLabel(request.status, ru)} · ${date(request.updatedAt, locale)}`, trailing: request.activeGrantId ? (ru ? "Доступ активен" : "Ruxsat faol") : undefined }))} action={<Link href={`${base}/lawyers?caseId=${encodeURIComponent(item.id)}`}>{ru ? "Выбрать юриста" : "Yurist tanlash"}<ArrowUpRight /></Link>} />;
  if (section === "access") return <section className="case-workspace-tab-panel"><PanelHeading icon={ShieldCheck} title={ru ? "Доступ к делу" : "Ishga ruxsat"} /><p className="case-workspace-note">{ru ? "Базовый доступ имеют активные участники текущего workspace. Временный доступ юриста выдаётся только после отдельного подтверждения и может быть отозван." : "Asosiy ruxsat joriy workspace faol ishtirokchilariga beriladi. Yuristga vaqtinchalik ruxsat faqat alohida tasdiqdan keyin beriladi va bekor qilinishi mumkin."}</p><div className="case-access-grid"><SimpleListContent items={(data.participants ?? []).map((participant) => ({ id: participant.userId, title: participant.currentUser ? `${participant.displayName} · ${ru ? "вы" : "siz"}` : participant.displayName, meta: `${roleLabel(participant.role, ru)} · ${ru ? "доступ через workspace" : "workspace orqali ruxsat"}` }))} empty={ru ? "Активных участников нет." : "Faol ishtirokchilar yo‘q."} /><SimpleListContent items={(data.lawyerRequests ?? []).filter((request) => request.activeGrantId).map((request) => ({ id: request.id, title: request.lawyerName || (ru ? "Назначенный юрист" : "Tayinlangan yurist"), meta: `${ru ? "Предоставлен" : "Berilgan"}: ${date(request.grantedAt, locale)}`, trailing: request.expiresAt ? `${ru ? "до" : "gacha"} ${date(request.expiresAt, locale)}` : (ru ? "до отзыва" : "bekor qilinguncha") }))} empty={ru ? "Активного доступа юриста нет." : "Yuristning faol ruxsati yo‘q."} /></div></section>;
  return <SimpleList icon={History} title={ru ? "Активность дела" : "Ish faolligi"} empty={ru ? "Событий пока нет." : "Hozircha hodisalar yo‘q."} items={(data.activity ?? []).map((event, index) => ({ id: `${event.createdAt}-${index}`, title: activityLabel(event.eventType, ru), meta: date(event.createdAt, locale) }))} />;
}

function PanelHeading({ icon: Icon, title, action }: { icon: typeof FileText; title: string; action?: ReactNode }) {
  return <div className="case-workspace-section-head"><div><Icon aria-hidden="true" /><h2>{title}</h2></div>{action}</div>;
}

type SimpleItem = { id: string; title: string; meta: string; trailing?: string; href?: string; externalHref?: string };

function SimpleList({ icon, title, empty, items, action, note }: { icon: typeof FileText; title: string; empty: string; items: SimpleItem[]; action?: ReactNode; note?: string }) {
  return <section className="case-workspace-tab-panel"><PanelHeading icon={icon} title={title} action={action} />{note && <p className="case-workspace-note">{note}</p>}<SimpleListContent items={items} empty={empty} /></section>;
}

function SimpleListContent({ items, empty }: { items: SimpleItem[]; empty: string }) {
  if (!items.length) return <p className="case-workspace-muted">{empty}</p>;
  return <ul className="case-workspace-records">{items.map((entry) => <li key={entry.id}><div><strong>{entry.title}</strong><span>{entry.meta}</span>{entry.trailing && <em>{entry.trailing}</em>}</div>{entry.href ? <Link href={entry.href}><ArrowUpRight /><span className="sr-only">{entry.title}</span></Link> : entry.externalHref ? <a href={entry.externalHref} target="_blank" rel="noreferrer"><ArrowUpRight /><span className="sr-only">{entry.title}</span></a> : null}</li>)}</ul>;
}

function CaseSourcesPanel({ locale, sources, initialBookmarks }: { locale: PlatformLocale; sources: CaseSource[]; initialBookmarks: CaseBookmark[] }) {
  const ru = locale === "ru";
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [busyId, setBusyId] = useState("");
  const [status, setStatus] = useState("");

  async function removeBookmark(bookmark: CaseBookmark) {
    setBusyId(bookmark.bookmarkId);
    setStatus("");
    try {
      const response = await fetch(`/api/platform/legal-bookmarks/${encodeURIComponent(bookmark.bookmarkId)}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `legal-bookmark-archive-${crypto.randomUUID()}`,
          "x-juro-csrf": "1",
        },
        body: JSON.stringify({ revision: bookmark.revision }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Закладка не удалена." : "Xatcho‘p olib tashlanmadi."));
      setBookmarks((current) => current.filter((item) => item.bookmarkId !== bookmark.bookmarkId));
      setStatus(ru ? "Закладка удалена из дела." : "Xatcho‘p ishdan olib tashlandi.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId("");
    }
  }

  return <section className="case-workspace-tab-panel case-sources-panel">
    <PanelHeading icon={BookOpenCheck} title={ru ? "Источники дела" : "Ish manbalari"} />
    <p className="case-workspace-note">{ru
      ? "Сохранённые нормы закреплены за проверенной версией. JURO не заменяет их новой редакцией без вашего ведома."
      : "Saqlangan normalar tekshirilgan versiyaga biriktiriladi. JURO ularni siz bilmasdan yangi tahrir bilan almashtirmaydi."}</p>
    <output className="case-bookmark-status" aria-live="polite">{status}</output>
    {bookmarks.length > 0 && <div className="case-bookmark-group"><h3>{ru ? "Мои закладки" : "Mening xatcho‘plarim"}</h3><ul className="case-bookmark-list">{bookmarks.map((bookmark) => <li key={bookmark.bookmarkId}>
      <div>
        <strong>{bookmark.actTitle}</strong>
        <span>{bookmark.actIdentifier || (ru ? "Официальный источник" : "Rasmiy manba")} · {bookmark.isCurrentVersion ? (ru ? "текущая версия" : "joriy versiya") : (ru ? "сохранённая историческая версия" : "saqlangan tarixiy versiya")}</span>
        {bookmark.comment && <p>{bookmark.comment}</p>}
      </div>
      <div className="case-bookmark-actions">
        {safeOfficialUrl(bookmark.officialUrl) && <a href={bookmark.officialUrl} target="_blank" rel="noreferrer"><ArrowUpRight /><span className="sr-only">{ru ? "Открыть официальный источник" : "Rasmiy manbani ochish"}</span></a>}
        <button type="button" disabled={busyId === bookmark.bookmarkId} aria-label={ru ? `Удалить закладку «${bookmark.actTitle}»` : `«${bookmark.actTitle}» xatcho‘pini olib tashlash`} onClick={() => void removeBookmark(bookmark)}><Trash2 /></button>
      </div>
    </li>)}</ul></div>}
    <div className="case-bookmark-group"><h3>{ru ? "Источники из AI-диалогов дела" : "Ishdagi AI suhbatlari manbalari"}</h3><SimpleListContent items={sources.map((source) => ({ id: source.id, title: source.actTitle, meta: `${source.actIdentifier || (ru ? "Официальный источник" : "Rasmiy manba")} · ${date(source.lastCheckedAt, locale)}`, externalHref: safeOfficialUrl(source.officialUrl) ? source.officialUrl : undefined }))} empty={ru ? "Подтверждённых источников в диалогах этого дела пока нет." : "Bu ish suhbatlarida hozircha tasdiqlangan manba yo‘q."} /></div>
  </section>;
}

function PlanSteps({ item, locale, base, embedded = false }: { item: CaseRecord; locale: PlatformLocale; base: string; embedded?: boolean }) {
  const ru = locale === "ru";
  return <section className={embedded ? "case-workspace-embedded" : undefined}><PanelHeading icon={FilePenLine} title={ru ? "Следующие шаги" : "Keyingi qadamlar"} action={!embedded ? <Link href={`${base}/action-plan/${encodeURIComponent(item.id)}`}>{ru ? "Открыть план" : "Rejani ochish"}</Link> : undefined} />{item.steps?.length ? <ol className="case-workspace-steps">{item.steps.map((step) => <li key={step.id}><CheckCircle2 className={step.status === "completed" ? "done" : undefined} /><div><strong>{step.title}</strong><span>{date(step.dueAt, locale)} · {statusLabel(step.status, ru)}</span></div></li>)}</ol> : <p className="case-workspace-muted">{ru ? "В плане пока нет шагов." : "Rejada hozircha qadam yo‘q."}</p>}</section>;
}

function TaskList({ tasks, locale, embedded = false }: { tasks: Task[]; locale: PlatformLocale; embedded?: boolean }) {
  const ru = locale === "ru";
  return <section className={embedded ? "case-workspace-embedded" : undefined}><PanelHeading icon={ListChecks} title={ru ? "Задачи" : "Vazifalar"} />{tasks.length ? <ul className="case-workspace-tasks">{tasks.map((task) => { const sourceHref = officialLexHref(task.legalBasis); return <li key={task.id}><div className="case-workspace-task-copy"><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}{sourceHref && <a className="case-workspace-task-source" href={sourceHref} target="_blank" rel="noopener noreferrer"><ExternalLink />{ru ? "Официальный источник Lex.uz" : "Lex.uz rasmiy manbasi"}</a>}<span>{date(task.dueAt, locale)}</span>{Boolean(task.comments?.length) && <ol className="case-workspace-task-comments" aria-label={ru ? "Комментарии юриста" : "Yurist izohlari"}>{task.comments?.map((comment) => <li key={comment.id}><MessageSquareText aria-hidden="true" /><div><strong>{comment.authorName || (ru ? "Юрист" : "Yurist")}</strong><p>{comment.body}</p><time>{date(comment.createdAt, locale)}</time></div></li>)}</ol>}</div><b>{statusLabel(task.status, ru)}</b></li>; })}</ul> : <p className="case-workspace-muted">{ru ? "Подтвердите план, чтобы создать задачи и напоминания." : "Vazifalar va eslatmalar yaratish uchun rejani tasdiqlang."}</p>}</section>;
}

function officialLexHref(value?: string | null) {
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

function sectionLabel(section: CaseSection, ru: boolean) {
  const labels: Record<CaseSection, [string, string]> = {
    overview: ["Обзор", "Umumiy"], chat: ["Чат", "Suhbat"], documents: ["Документы", "Hujjatlar"], analyses: ["Анализы", "Tahlillar"], plan: ["План", "Reja"], calendar: ["Сроки", "Muddatlar"], sources: ["Источники", "Manbalar"], participants: ["Участники", "Ishtirokchilar"], lawyer: ["Юрист", "Yurist"], activity: ["Активность", "Faollik"], access: ["Доступ", "Ruxsat"],
  };
  return labels[section][ru ? 0 : 1];
}

function activityLabel(eventType: string, ru: boolean) {
  const labels: Record<string, [string, string]> = { case_created: ["Дело создано", "Ish yaratildi"], step_updated: ["Шаг плана обновлён", "Reja qadami yangilandi"], plan_changes_confirmed: ["Изменения плана подтверждены", "Reja o‘zgarishlari tasdiqlandi"], tasks_created: ["Задачи из плана подтверждены", "Rejadagi vazifalar tasdiqlandi"], document_created: ["Документ добавлен", "Hujjat qo‘shildi"], document_linked: ["Документ добавлен в дело", "Hujjat ishga qo‘shildi"], document_unlinked: ["Документ удалён из дела", "Hujjat ishdan olib tashlandi"], analysis_linked: ["Анализ добавлен в дело", "Tahlil ishga qo‘shildi"], analysis_unlinked: ["Анализ удалён из дела", "Tahlil ishdan olib tashlandi"], legal_bookmark_saved: ["Правовой источник сохранён", "Huquqiy manba saqlandi"], legal_bookmark_removed: ["Правовая закладка удалена", "Huquqiy xatcho‘p olib tashlandi"], lawyer_task_created: ["Юрист добавил задачу", "Yurist vazifa qo‘shdi"], lawyer_task_updated: ["Юрист обновил задачу", "Yurist vazifani yangiladi"], lawyer_task_comment_added: ["Юрист добавил комментарий", "Yurist izoh qo‘shdi"], lawyer_document_requested: ["Юрист запросил документ", "Yurist hujjat so‘radi"], lawyer_document_provided: ["Клиент предоставил документ", "Mijoz hujjat taqdim etdi"], lawyer_document_request_cancelled: ["Запрос документа отменён", "Hujjat so‘rovi bekor qilindi"] };
  return labels[eventType]?.[ru ? 0 : 1] || (ru ? "Дело обновлено" : "Ish yangilandi");
}

function statusLabel(status: string, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    open: ["Открыто", "Ochiq"], active: ["Активно", "Faol"], completed: ["Завершено", "Yakunlangan"], archived: ["В архиве", "Arxivda"], not_started: ["Не начато", "Boshlanmagan"], in_progress: ["В работе", "Jarayonda"], waiting_information: ["Ожидает данных", "Ma’lumot kutilmoqda"], cancelled: ["Отменено", "Bekor qilingan"], queued: ["В очереди", "Navbatda"], processing: ["Обрабатывается", "Qayta ishlanmoqda"], failed: ["Ошибка", "Xato"], unassigned: ["Ожидает назначения", "Tayinlash kutilmoqda"], conflict_check_pending: ["Проверка конфликта", "Manfaatlar to‘qnashuvi tekshirilmoqda"], awaiting_user_consent: ["Ожидает подтверждения", "Tasdiq kutilmoqda"], access_granted: ["Доступ предоставлен", "Ruxsat berilgan"], access_revoked: ["Доступ отозван", "Ruxsat bekor qilingan"],
  };
  return labels[status]?.[ru ? 0 : 1] || status.replaceAll("_", " ");
}

function localizedLifecycleError(code: string, ru: boolean) {
  if (code.includes("CASE_LIFECYCLE_INVALID")) return ru ? "Это действие недоступно в текущем состоянии дела." : "Bu amal ishning joriy holatida mavjud emas.";
  if (code.includes("CASE_LIFECYCLE_CONFLICT")) return ru ? "Дело уже изменилось. Обновите страницу и повторите." : "Ish allaqachon o‘zgargan. Sahifani yangilab, qayta urinib ko‘ring.";
  if (code.includes("CASE_UNAVAILABLE")) return ru ? "Дело не найдено в текущем пространстве." : "Ish joriy makonda topilmadi.";
  return ru ? "Не удалось изменить состояние дела." : "Ish holatini o‘zgartirib bo‘lmadi.";
}

function roleLabel(role: string, ru: boolean) {
  if (role === "owner") return ru ? "Владелец" : "Egasi";
  return ru ? "Участник" : "Ishtirokchi";
}

function riskLabel(risk: string, ru: boolean) {
  const labels: Record<string, [string, string]> = { critical: ["Критический риск", "Kritik xavf"], high: ["Высокий риск", "Yuqori xavf"], medium: ["Средний риск", "O‘rta xavf"], low: ["Низкий риск", "Past xavf"] };
  return labels[risk]?.[ru ? 0 : 1] || risk;
}

function safeOfficialUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "lex.uz" || url.hostname.endsWith(".lex.uz"));
  } catch {
    return false;
  }
}
