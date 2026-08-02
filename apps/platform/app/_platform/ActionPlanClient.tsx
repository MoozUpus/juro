"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated remote workspace state is hydrated after mount */

import Link from "next/link";
import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  FilePenLine,
  LoaderCircle,
  Plus,
  RotateCcw,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

type StepStatus =
  | "not_started"
  | "in_progress"
  | "waiting_user"
  | "waiting_response"
  | "overdue"
  | "completed"
  | "cancelled";

type Step = {
  id: string;
  ordinal: number;
  title: string;
  description?: string;
  status: StepStatus;
  dueAt?: string;
  actionType?: string;
  templateCode?: string;
  revision: number;
};

type Case = {
  id: string;
  title: string;
  description?: string;
  legalArea: string;
  status: string;
  updatedAt: string;
  planId: string;
  planTitle: string;
  planStatus: string;
  progressPercent: number;
  steps: Step[];
};

type PlanSnapshot = {
  version: number;
  status: string;
  progressPercent: number;
  steps: Array<{ id: string; title: string; status: string; dueAt: string | null }>;
};

type PlanVersion = {
  id: string;
  version: number;
  reason: string;
  createdAt: string;
  snapshot: PlanSnapshot | null;
};
const catalog = {
  individual: [
    { id: "unpaid-salary", ru: "Невыплата заработной платы", uz: "Ish haqi to‘lanmasligi" },
    { id: "debt", ru: "Возврат долга", uz: "Qarzni qaytarish" },
    { id: "consumer", ru: "Защита прав потребителя", uz: "Iste’molchi huquqlarini himoya qilish" },
  ],
  business: [
    { id: "debt-recovery", ru: "Взыскание задолженности", uz: "Qarzdorlikni undirish" },
    { id: "contract-breach", ru: "Нарушение договора", uz: "Shartnoma buzilishi" },
  ],
};

export function ActionPlanClient({
  locale,
  accountType,
  initialCaseId,
}: {
  locale: PlatformLocale;
  accountType: AccountType;
  initialCaseId?: string;
}) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const scenarioCatalog = accountType === "business" ? catalog.business : catalog.individual;
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(scenarioCatalog[0].id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [savingStepId, setSavingStepId] = useState<string | null>(null);
  const [openCase, setOpenCase] = useState<string | null>(initialCaseId ?? null);
  const [versionsByCase, setVersionsByCase] = useState<Record<string, PlanVersion[]>>({});
  const [loadingVersionsFor, setLoadingVersionsFor] = useState<string | null>(null);
  const [creatingTasksFor, setCreatingTasksFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(initialCaseId ? `/api/platform/cases?caseId=${encodeURIComponent(initialCaseId)}` : "/api/platform/cases", { cache: "no-store" });
      const data = await response.json() as { cases?: Case[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Ошибка загрузки");
      setCases(data.cases || []);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [initialCaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadVersionHistory(item: Case) {
    if (loadingVersionsFor === item.id) return;
    setLoadingVersionsFor(item.id);
    setError("");
    try {
      const response = await fetch("/api/platform/cases/" + item.id + "/plan-versions", { cache: "no-store" });
      const data = await response.json() as { versions?: PlanVersion[]; error?: string };
      if (!response.ok) throw new Error(data.error || (ru ? "Не удалось загрузить историю." : "Tarixni yuklab bo‘lmadi."));
      setVersionsByCase((current) => ({ ...current, [item.id]: data.versions || [] }));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoadingVersionsFor(null);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/platform/cases", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ title, description, legalArea: selected, locale, accountType }),
      });
      const data = await response.json() as { caseId?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Ошибка");
      setTitle("");
      setDescription("");
      setOpenCase(data.caseId || null);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setCreating(false);
    }
  }

  async function updateStep(
    item: Case,
    step: Step,
    status: StepStatus,
    dueAt: string | null = step.dueAt?.slice(0, 10) || null,
  ) {
    if (savingStepId === step.id) return;
    setSavingStepId(step.id);
    setError("");
    try {
      const response = await fetch(`/api/platform/cases/${item.id}/steps/${step.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ status, revision: step.revision, dueAt }),
      });
      if (response.status === 409) {
        setError(ru
          ? "План изменён в другой вкладке. Данные обновлены."
          : "Reja boshqa oynada o‘zgartirilgan. Ma’lumot yangilandi.");
        await load();
        return;
      }
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        setError(data.error || (ru ? "Не удалось сохранить шаг." : "Qadamni saqlab bo‘lmadi."));
        return;
      }
      await load();
    } finally {
      setSavingStepId(null);
    }
  }

  async function createTasks(item: Case) {
    if (creatingTasksFor === item.id) return;
    setCreatingTasksFor(item.id); setError("");
    try {
      const response = await fetch(`/api/platform/cases/${item.id}/tasks`, { method: "POST", headers: { "x-juro-csrf": "1" } });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || (ru ? "Не удалось создать задачи." : "Vazifalarni yaratib bo‘lmadi."));
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setCreatingTasksFor(null); }
  }

  const deadlines = useMemo(
    () => cases.flatMap((item) => item.steps
      .filter((step) => step.dueAt && !["completed", "cancelled"].includes(step.status))
      .map((step) => ({ date: step.dueAt!, title: step.title, caseTitle: item.title })))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [cases],
  );

  return <div className="plan-workspace">
    <section className="plan-heading">
      <div>
        <small>JURO · {ru ? "План действий" : "Harakatlar rejasi"}</small>
        <h1>{ru ? "Свяжите шаги, сроки и документы в одном деле" : "Qadamlar, muddatlar va hujjatlarni bitta ishda bog‘lang"}</h1>
        <p>{ru ? "Прогресс рассчитывается только по реально завершённым шагам." : "Jarayon faqat haqiqatan bajarilgan qadamlar asosida hisoblanadi."}</p>
      </div>
      <CalendarDays />
    </section>
    <div className="plan-layout">
      <section className="plan-main">
        {!initialCaseId && <form className="plan-create" onSubmit={create}>
          <h2>{ru ? "Создать план из сценария" : "Ssenariydan reja yaratish"}</h2>
          <div className="scenario-pills">
            {scenarioCatalog.map((item) => <button
              type="button"
              className={selected === item.id ? "active" : ""}
              onClick={() => setSelected(item.id)}
              key={item.id}
            >{ru ? item.ru : item.uz}</button>)}
          </div>
          <label>{ru ? "Название ситуации" : "Vaziyat nomi"}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={180}
              placeholder={ru ? "Например: задолженность по договору" : "Masalan: shartnoma bo‘yicha qarzdorlik"}
            />
          </label>
          <label>{ru ? "Краткое описание" : "Qisqa tavsif"}
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={2000} />
          </label>
          <button className="plan-primary" disabled={creating}>
            {creating ? <LoaderCircle className="spin" /> : <Plus />}
            {ru ? "Создать дело и план" : "Ish va reja yaratish"}
          </button>
        </form>}
        {error && <p className="plan-error" role="alert"><CircleAlert />{error}</p>}
        <section className="plan-list">
          <div className="plan-section-title">
            <h2>{ru ? "Мои активные планы" : "Faol rejalarim"}</h2>
            <button onClick={() => void load()} aria-label={ru ? "Обновить" : "Yangilash"}><RotateCcw /></button>
          </div>
          {loading
            ? <div className="plan-loading"><LoaderCircle className="spin" /></div>
            : cases.length === 0
              ? <div className="platform-empty"><CalendarDays /><p>{ru ? "Создайте первый план из проверяемого сценария." : "Tekshiriladigan ssenariydan birinchi rejangizni yarating."}</p></div>
              : cases.map((item) => {
                const panelId = `plan-${item.id}`;
                const expanded = openCase === item.id;
                return <article className="plan-card" key={item.id}>
                  <button
                    className="plan-card-head"
                    onClick={() => setOpenCase(expanded ? null : item.id)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                  >
                    <div>
                      <span>{item.legalArea}</span>
                      <h3>{item.title}</h3>
                      <p>{item.progressPercent}% · {item.steps.filter((step) => step.status === "completed").length}/{item.steps.length} {ru ? "шагов" : "qadam"}</p>
                    </div>
                    <div className="plan-progress" aria-label={`${item.progressPercent}%`}><i style={{ width: `${item.progressPercent}%` }} /></div>
                    <ChevronDown className={expanded ? "rotated" : ""} />
                  </button>
                  {expanded && <div className="plan-steps" id={panelId}>
                    <button type="button" className="plan-primary" disabled={creatingTasksFor === item.id} onClick={() => void createTasks(item)}>
                      {creatingTasksFor === item.id ? <LoaderCircle className="spin" /> : <Plus />}
                      {ru ? "Подтвердить и добавить шаги в задачи" : "Tasdiqlash va qadamlarni vazifalarga qo‘shish"}
                    </button>
                    <section className="plan-history" aria-label={ru ? "История версий плана" : "Reja versiyalari tarixi"}>
                      <button
                        type="button"
                        onClick={() => void loadVersionHistory(item)}
                        disabled={loadingVersionsFor === item.id}
                      >
                        {loadingVersionsFor === item.id ? <LoaderCircle className="spin" /> : <RotateCcw />}
                        {ru ? "Показать историю версий" : "Versiyalar tarixini ko‘rsatish"}
                      </button>
                      {versionsByCase[item.id]?.length ? <ol>
                        {versionsByCase[item.id].map((entry) => <li key={entry.id}>
                          <strong>{ru ? "Версия " + entry.version : entry.version + "-versiya"}</strong>
                          <span>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(entry.createdAt))}</span>
                          <small>{entry.snapshot ? entry.snapshot.progressPercent + "% · " + entry.snapshot.steps.filter((step) => step.status === "completed").length + "/" + entry.snapshot.steps.length : (ru ? "Снимок недоступен" : "Snapshot mavjud emas")}</small>
                        </li>)}
                      </ol> : null}
                    </section>
                    {item.steps.map((step) => {
                      const saving = savingStepId === step.id;
                      const builderQuery = new URLSearchParams({ caseId: item.id, stepId: step.id });
                      if (step.templateCode) builderQuery.set("template", step.templateCode);
                      return <div className={`plan-step ${step.status === "completed" ? "done" : ""}`} key={step.id}>
                        <span>{step.status === "completed" ? <Check /> : step.ordinal}</span>
                        <div>
                          <strong>{step.title}</strong>
                          {step.dueAt && <small>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(step.dueAt))}</small>}
                        </div>
                        <label className="plan-step-date">
                          <span>{ru ? "Срок" : "Muddat"}</span>
                          <input
                            type="date"
                            value={step.dueAt?.slice(0, 10) || ""}
                            disabled={saving}
                            onChange={(event) => void updateStep(item, step, step.status, event.target.value || null)}
                          />
                        </label>
                        <label className="plan-step-status">
                          <span className="sr-only">{ru ? "Статус шага" : "Qadam holati"}</span>
                          <select
                            value={step.status}
                            disabled={saving}
                            onChange={(event) => void updateStep(item, step, event.target.value as StepStatus)}
                          >
                            <option value="not_started">{ru ? "Не начато" : "Boshlanmagan"}</option>
                            <option value="in_progress">{ru ? "В работе" : "Jarayonda"}</option>
                            <option value="waiting_user">{ru ? "Ждёт меня" : "Meni kutmoqda"}</option>
                            <option value="waiting_response">{ru ? "Ожидает ответа" : "Javob kutilmoqda"}</option>
                            <option value="overdue">{ru ? "Просрочено" : "Muddati o‘tgan"}</option>
                            <option value="completed">{ru ? "Завершено" : "Bajarilgan"}</option>
                            <option value="cancelled">{ru ? "Отменено" : "Bekor qilingan"}</option>
                          </select>
                        </label>
                        <Link
                          href={`${base}/document-builder?${builderQuery}`}
                          aria-label={ru ? `Создать документ для шага «${step.title}»` : `«${step.title}» qadami uchun hujjat yaratish`}
                        ><FilePenLine /></Link>
                      </div>;
                    })}
                  </div>}
                </article>;
              })}
        </section>
      </section>
      <aside className="plan-calendar">
        <h2>{ru ? "Ближайшие сроки" : "Yaqin muddatlar"}</h2>
        <div className="today"><CalendarDays /><div><small>{ru ? "Сегодня" : "Bugun"}</small><strong>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "long", timeZone: "Asia/Tashkent" }).format(new Date())}</strong></div></div>
        {deadlines.length
          ? deadlines.slice(0, 8).map((item) => <div className="deadline" key={`${item.date}-${item.title}`}>
            <time dateTime={item.date}>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { day: "2-digit", month: "short", timeZone: "Asia/Tashkent" }).format(new Date(item.date))}</time>
            <div><strong>{item.title}</strong><small>{item.caseTitle}</small></div>
          </div>)
          : <p>{ru ? "Сроки появятся после назначения дат конкретным шагам." : "Aniq qadamlar uchun sana belgilangandan keyin muddatlar ko‘rinadi."}</p>}
        <Link className="plan-consult" href={`${base}/consultations`}>{ru ? "Записаться на консультацию" : "Maslahatga yozilish"}<span>→</span></Link>
      </aside>
    </div>
  </div>;
}
