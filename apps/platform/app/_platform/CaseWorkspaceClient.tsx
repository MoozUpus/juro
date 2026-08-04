"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FilePenLine,
  FileSearch2,
  FileText,
  History,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Scale,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  CASE_SECTIONS,
  type CaseSection,
  type PlatformLocale,
} from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

type Step = { id: string; title: string; status: string; dueAt?: string | null };
type CaseRecord = { id: string; title: string; description?: string | null; legalArea: string; status: string; nextDeadlineAt?: string | null; progressPercent?: number; steps?: Step[] };
type Task = { id: string; title: string; status: string; dueAt?: string | null; safeDueAt?: string | null };
type CaseDocument = { id: string; title: string; status: string; language: string; planStepId?: string | null; updatedAt: string };
type CaseActivity = { eventType: string; createdAt: string; metadata: Record<string, unknown> };
type CaseConversation = { id: string; title: string; status: string; locale: string; updatedAt: string };
type CaseComparison = { id: string; status: string; stage: string; overallRisk?: string | null; errorCode?: string | null; updatedAt: string };
type CaseAnalysis = { id: string; status: string; errorCode?: string | null; fileName: string; mimeType: string; updatedAt: string };
type CaseSource = { id: string; actTitle: string; actIdentifier?: string | null; officialUrl: string; status: string; locale: string; lastCheckedAt: string };
type CaseParticipant = { userId: string; role: string; status: string; joinedAt: string; displayName: string; currentUser: boolean };
type CaseLawyerRequest = { id: string; status: string; updatedAt: string; lawyerName?: string | null; activeGrantId?: string | null; grantedAt?: string | null; expiresAt?: string | null };
type CaseWorkspaceData = {
  documents?: CaseDocument[];
  activity?: CaseActivity[];
  conversations?: CaseConversation[];
  comparisons?: CaseComparison[];
  analyses?: CaseAnalysis[];
  sources?: CaseSource[];
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
  const base = usePlatformBasePath();
  const caseBase = `${base}/cases/${encodeURIComponent(caseId)}`;
  const [item, setItem] = useState<CaseRecord | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workspaceData, setWorkspaceData] = useState<CaseWorkspaceData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  return <section className="case-workspace" aria-labelledby="case-title">
    <header><div><p>JURO · {ru ? "Дело" : "Ish"}</p><h1 id="case-title">{item.title}</h1><span>{item.legalArea} · {statusLabel(item.status, ru)}</span>{item.description && <p className="case-workspace-description">{item.description}</p>}</div><div className="case-workspace-actions"><Link href={`${caseBase}/plan`}><ListChecks />{ru ? "План действий" : "Harakatlar rejasi"}</Link><Link href={`${caseBase}/calendar`}><CalendarDays />{ru ? "Сроки" : "Muddatlar"}</Link></div></header>
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
  if (section === "sources") return <SimpleList icon={BookOpenCheck} title={ru ? "Источники дела" : "Ish manbalari"} empty={ru ? "Подтверждённые источники появятся после AI-ответа, привязанного к делу." : "Tasdiqlangan manbalar ishga biriktirilgan AI javobidan keyin paydo bo‘ladi."} items={(data.sources ?? []).map((source) => ({ id: source.id, title: source.actTitle, meta: `${source.actIdentifier || (ru ? "Официальный источник" : "Rasmiy manba")} · ${date(source.lastCheckedAt, locale)}`, externalHref: safeOfficialUrl(source.officialUrl) ? source.officialUrl : undefined }))} />;
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

function PlanSteps({ item, locale, base, embedded = false }: { item: CaseRecord; locale: PlatformLocale; base: string; embedded?: boolean }) {
  const ru = locale === "ru";
  return <section className={embedded ? "case-workspace-embedded" : undefined}><PanelHeading icon={FilePenLine} title={ru ? "Следующие шаги" : "Keyingi qadamlar"} action={!embedded ? <Link href={`${base}/action-plan/${encodeURIComponent(item.id)}`}>{ru ? "Открыть план" : "Rejani ochish"}</Link> : undefined} />{item.steps?.length ? <ol className="case-workspace-steps">{item.steps.map((step) => <li key={step.id}><CheckCircle2 className={step.status === "completed" ? "done" : undefined} /><div><strong>{step.title}</strong><span>{date(step.dueAt, locale)} · {statusLabel(step.status, ru)}</span></div></li>)}</ol> : <p className="case-workspace-muted">{ru ? "В плане пока нет шагов." : "Rejada hozircha qadam yo‘q."}</p>}</section>;
}

function TaskList({ tasks, locale, embedded = false }: { tasks: Task[]; locale: PlatformLocale; embedded?: boolean }) {
  const ru = locale === "ru";
  return <section className={embedded ? "case-workspace-embedded" : undefined}><PanelHeading icon={ListChecks} title={ru ? "Задачи" : "Vazifalar"} />{tasks.length ? <ul className="case-workspace-tasks">{tasks.map((task) => <li key={task.id}><div><strong>{task.title}</strong><span>{date(task.dueAt, locale)}</span></div><b>{statusLabel(task.status, ru)}</b></li>)}</ul> : <p className="case-workspace-muted">{ru ? "Подтвердите план, чтобы создать задачи и напоминания." : "Vazifalar va eslatmalar yaratish uchun rejani tasdiqlang."}</p>}</section>;
}

function sectionLabel(section: CaseSection, ru: boolean) {
  const labels: Record<CaseSection, [string, string]> = {
    overview: ["Обзор", "Umumiy"], chat: ["Чат", "Suhbat"], documents: ["Документы", "Hujjatlar"], analyses: ["Анализы", "Tahlillar"], plan: ["План", "Reja"], calendar: ["Сроки", "Muddatlar"], sources: ["Источники", "Manbalar"], participants: ["Участники", "Ishtirokchilar"], lawyer: ["Юрист", "Yurist"], activity: ["Активность", "Faollik"], access: ["Доступ", "Ruxsat"],
  };
  return labels[section][ru ? 0 : 1];
}

function activityLabel(eventType: string, ru: boolean) {
  const labels: Record<string, [string, string]> = { case_created: ["Дело создано", "Ish yaratildi"], step_updated: ["Шаг плана обновлён", "Reja qadami yangilandi"], plan_changes_confirmed: ["Изменения плана подтверждены", "Reja o‘zgarishlari tasdiqlandi"], tasks_created: ["Задачи из плана подтверждены", "Rejadagi vazifalar tasdiqlandi"], document_created: ["Документ добавлен", "Hujjat qo‘shildi"], document_linked: ["Документ добавлен в дело", "Hujjat ishga qo‘shildi"], document_unlinked: ["Документ удалён из дела", "Hujjat ishdan olib tashlandi"], analysis_linked: ["Анализ добавлен в дело", "Tahlil ishga qo‘shildi"], analysis_unlinked: ["Анализ удалён из дела", "Tahlil ishdan olib tashlandi"] };
  return labels[eventType]?.[ru ? 0 : 1] || (ru ? "Дело обновлено" : "Ish yangilandi");
}

function statusLabel(status: string, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    open: ["Открыто", "Ochiq"], active: ["Активно", "Faol"], completed: ["Завершено", "Yakunlangan"], not_started: ["Не начато", "Boshlanmagan"], in_progress: ["В работе", "Jarayonda"], waiting_information: ["Ожидает данных", "Ma’lumot kutilmoqda"], cancelled: ["Отменено", "Bekor qilingan"], queued: ["В очереди", "Navbatda"], processing: ["Обрабатывается", "Qayta ishlanmoqda"], failed: ["Ошибка", "Xato"], unassigned: ["Ожидает назначения", "Tayinlash kutilmoqda"], conflict_check_pending: ["Проверка конфликта", "Manfaatlar to‘qnashuvi tekshirilmoqda"], awaiting_user_consent: ["Ожидает подтверждения", "Tasdiq kutilmoqda"], access_granted: ["Доступ предоставлен", "Ruxsat berilgan"], access_revoked: ["Доступ отозван", "Ruxsat bekor qilingan"],
  };
  return labels[status]?.[ru ? 0 : 1] || status.replaceAll("_", " ");
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
    return url.protocol === "https:" && (url.hostname === "lex.uz" || url.hostname.endsWith(".lex.uz") || url.hostname === "advice.uz" || url.hostname.endsWith(".advice.uz"));
  } catch {
    return false;
  }
}
