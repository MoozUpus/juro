"use client";

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
import { caseScenariosForAccount } from "../../lib/platform/case-create";
import type {
  DeadlineCalculationInput,
  DeadlineCalculationResult,
} from "../../lib/platform/deadline-calculator";
import { formatPlatformDate, formatPlatformDateTime, formatPlatformDayMonth } from "../../lib/platform/date-time";
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
  sourceDate?: string;
  safeDueAt?: string;
  deadlineType?: "calendar_days" | "business_days";
  calculationMethod?: string;
  legalBasis?: string;
  deadlineConfidence?: "unverified" | "preliminary" | "source_verified";
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
  planRevision: number;
  steps: Step[];
};

type PendingPlanChange = {
  id: string;
  status: StepStatus;
  dueAt: string | null;
  revision: number;
  deadlineCalculation?: DeadlineCalculationInput | null;
};

type DeadlineDraft = {
  sourceDate: string;
  daysCount: string;
  dayType: "calendar_days" | "business_days";
  includeSourceDate: boolean;
  rollRule: "none" | "next_business_day" | "previous_business_day";
  holidays: string;
  holidayCalendarVersion: string;
  safeMarginBusinessDays: string;
  legalBasis: string;
  loading?: boolean;
  error?: string;
  result?: DeadlineCalculationResult;
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

function initialDeadlineDraft(step: Step): DeadlineDraft {
  return {
    sourceDate: step.sourceDate?.slice(0, 10) ?? "",
    daysCount: "",
    dayType: step.deadlineType ?? "calendar_days",
    includeSourceDate: false,
    rollRule: "none",
    holidays: "",
    holidayCalendarVersion: "",
    safeMarginBusinessDays: "1",
    legalBasis: step.legalBasis ?? "",
  };
}

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
  const scenarioCatalog = caseScenariosForAccount(accountType);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(scenarioCatalog[0].id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingChangesByCase, setPendingChangesByCase] = useState<Record<string, Record<string, PendingPlanChange>>>({});
  const [applyingChangesFor, setApplyingChangesFor] = useState<string | null>(null);
  const [openCase, setOpenCase] = useState<string | null>(initialCaseId ?? null);
  const [versionsByCase, setVersionsByCase] = useState<Record<string, PlanVersion[]>>({});
  const [selectedHistoryVersionByCase, setSelectedHistoryVersionByCase] = useState<Record<string, string>>({});
  const [loadingVersionsFor, setLoadingVersionsFor] = useState<string | null>(null);
  const [creatingTasksFor, setCreatingTasksFor] = useState<string | null>(null);
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, DeadlineDraft>>({});

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

  function stageStepChange(item: Case, step: Step, patch: Partial<Pick<PendingPlanChange, "status" | "dueAt" | "deadlineCalculation">>) {
    const current = pendingChangesByCase[item.id]?.[step.id];
    const next: PendingPlanChange = {
      id: step.id,
      status: patch.status ?? current?.status ?? step.status,
      dueAt: "dueAt" in patch ? patch.dueAt ?? null : current?.dueAt ?? step.dueAt?.slice(0, 10) ?? null,
      revision: step.revision,
      deadlineCalculation: "deadlineCalculation" in patch
        ? patch.deadlineCalculation
        : current?.deadlineCalculation,
    };
    const unchanged = next.status === step.status
      && next.dueAt === (step.dueAt?.slice(0, 10) ?? null)
      && next.deadlineCalculation === undefined;
    setPendingChangesByCase((all) => {
      const caseChanges = { ...(all[item.id] || {}) };
      if (unchanged) delete caseChanges[step.id];
      else caseChanges[step.id] = next;
      return { ...all, [item.id]: caseChanges };
    });
  }

  function updateDeadlineDraft(item: Case, step: Step, patch: Partial<DeadlineDraft>) {
    const key = `${item.id}:${step.id}`;
    setDeadlineDrafts((all) => ({
      ...all,
      [key]: { ...(all[key] ?? initialDeadlineDraft(step)), ...patch, error: "" },
    }));
  }

  function clearDeadlineResultsForCase(caseId: string) {
    setDeadlineDrafts((all) => Object.fromEntries(Object.entries(all).map(([key, draft]) => [
      key,
      key.startsWith(`${caseId}:`) ? { ...draft, result: undefined, error: "" } : draft,
    ])));
  }

  async function previewDeadline(item: Case, step: Step) {
    const key = `${item.id}:${step.id}`;
    const draft = deadlineDrafts[key] ?? initialDeadlineDraft(step);
    const holidays = draft.holidays.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
    const input: DeadlineCalculationInput = {
      sourceDate: draft.sourceDate,
      daysCount: Number(draft.daysCount),
      dayType: draft.dayType,
      includeSourceDate: draft.includeSourceDate,
      rollRule: draft.rollRule,
      holidays,
      holidayCalendarVersion: draft.holidayCalendarVersion.trim() || null,
      safeMarginBusinessDays: Number(draft.safeMarginBusinessDays),
      legalBasis: draft.legalBasis.trim() || null,
    };
    setDeadlineDrafts((all) => ({ ...all, [key]: { ...draft, loading: true, error: "" } }));
    try {
      const response = await fetch(`/api/platform/cases/${item.id}/steps/${step.id}/deadline`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify(input),
      });
      const data = await response.json() as { result?: DeadlineCalculationResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || (ru ? "Не удалось рассчитать срок." : "Muddatni hisoblab bo‘lmadi."));
      setDeadlineDrafts((all) => ({ ...all, [key]: { ...draft, loading: false, result: data.result } }));
      stageStepChange(item, step, { dueAt: data.result.dueDate, deadlineCalculation: input });
    } catch (value) {
      setDeadlineDrafts((all) => ({
        ...all,
        [key]: { ...draft, loading: false, error: value instanceof Error ? value.message : String(value) },
      }));
    }
  }

  async function applyStagedChanges(item: Case) {
    const changes = Object.values(pendingChangesByCase[item.id] || {});
    if (!changes.length || applyingChangesFor === item.id) return;
    setApplyingChangesFor(item.id);
    setError("");
    try {
      const response = await fetch(`/api/platform/cases/${item.id}/plan`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ revision: item.planRevision, changes }),
      });
      const data = await response.json() as { error?: string };
      if (response.status === 409) {
        setPendingChangesByCase((all) => ({ ...all, [item.id]: {} }));
        clearDeadlineResultsForCase(item.id);
        setError(ru ? "План изменён в другой вкладке. Показаны актуальные данные." : "Reja boshqa oynada o‘zgartirilgan. Amaldagi ma’lumotlar ko‘rsatildi.");
        await load();
        return;
      }
      if (!response.ok) throw new Error(data.error || (ru ? "Не удалось применить изменения плана." : "Reja o‘zgarishlarini qo‘llab bo‘lmadi."));
      setPendingChangesByCase((all) => ({ ...all, [item.id]: {} }));
      clearDeadlineResultsForCase(item.id);
      setVersionsByCase((all) => ({ ...all, [item.id]: [] }));
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setApplyingChangesFor(null);
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
                          <button type="button" aria-pressed={selectedHistoryVersionByCase[item.id] === entry.id} onClick={() => setSelectedHistoryVersionByCase((all) => ({ ...all, [item.id]: entry.id }))}>
                            <strong>{ru ? "Версия " + entry.version : entry.version + "-versiya"}</strong>
                            <span>{formatPlatformDateTime(entry.createdAt, ru ? "ru" : "uz")}</span>
                            <small>{entry.snapshot ? entry.snapshot.progressPercent + "% · " + entry.snapshot.steps.filter((step) => step.status === "completed").length + "/" + entry.snapshot.steps.length : (ru ? "Снимок недоступен" : "Snapshot mavjud emas")}</small>
                          </button>
                        </li>)}
                      </ol> : null}
                      {(() => {
                        const versions = versionsByCase[item.id] || [];
                        const selectedId = selectedHistoryVersionByCase[item.id];
                        const index = versions.findIndex((entry) => entry.id === selectedId);
                        const selectedVersion = index >= 0 ? versions[index] : null;
                        const previousVersion = index >= 0 ? versions[index + 1] : null;
                        if (!selectedVersion?.snapshot || !previousVersion?.snapshot) return selectedVersion ? <p className="plan-history-empty">{ru ? "Для первой версии нет предыдущего снимка для сравнения." : "Birinchi versiyani solishtirish uchun oldingi snapshot yo‘q."}</p> : null;
                        const previousSteps = new Map(previousVersion.snapshot.steps.map((step) => [step.id, step]));
                        const selectedSteps = new Map(selectedVersion.snapshot.steps.map((step) => [step.id, step]));
                        const changes = selectedVersion.snapshot.steps.flatMap((step) => {
                          const before = previousSteps.get(step.id);
                          if (!before) return [`${step.title}: ${ru ? "добавлен" : "qo‘shildi"}`];
                          const detail = [before.status !== step.status ? `${before.status} → ${step.status}` : "", before.dueAt !== step.dueAt ? `${before.dueAt || (ru ? "без срока" : "muddat yo‘q")} → ${step.dueAt || (ru ? "без срока" : "muddat yo‘q")}` : ""].filter(Boolean).join(" · ");
                          return detail ? [`${step.title}: ${detail}`] : [];
                        });
                        previousVersion.snapshot.steps.forEach((step) => { if (!selectedSteps.has(step.id)) changes.push(`${step.title}: ${ru ? "удалён" : "olib tashlandi"}`); });
                        return <section className="plan-history-diff" aria-live="polite"><h4>{ru ? `Различия: версия ${selectedVersion.version} и ${previousVersion.version}` : `${selectedVersion.version}- va ${previousVersion.version}-versiyalar farqi`}</h4>{changes.length ? <ul>{changes.map((change) => <li key={change}>{change}</li>)}</ul> : <p>{ru ? "Содержимое шагов не изменилось." : "Qadamlar mazmuni o‘zgarmagan."}</p>}</section>;
                      })()}
                    </section>
                    {Object.values(pendingChangesByCase[item.id] || {}).length > 0 && <section className="plan-change-preview" aria-labelledby={`plan-preview-${item.id}`}>
                      <div>
                        <small>{ru ? "Предпросмотр версии" : "Versiyani oldindan ko‘rish"}</small>
                        <h3 id={`plan-preview-${item.id}`}>{ru ? "Изменения ещё не применены" : "O‘zgarishlar hali qo‘llanmagan"}</h3>
                        <p>{ru ? "Проверьте изменения: они будут сохранены одной новой версией плана только после подтверждения." : "O‘zgarishlarni tekshiring: ular faqat tasdiqlangandan keyin rejaning bitta yangi versiyasi sifatida saqlanadi."}</p>
                      </div>
                      <ul>
                        {item.steps.filter((step) => pendingChangesByCase[item.id]?.[step.id]).map((step) => {
                          const change = pendingChangesByCase[item.id][step.id];
                          const beforeDate = step.dueAt?.slice(0, 10) || (ru ? "не задан" : "belgilanmagan");
                          const afterDate = change.dueAt || (ru ? "не задан" : "belgilanmagan");
                          return <li key={step.id}><strong>{step.title}</strong><span>{step.status} → {change.status}{beforeDate !== afterDate ? ` · ${beforeDate} → ${afterDate}` : ""}</span></li>;
                        })}
                      </ul>
                      <div className="plan-change-actions">
                        <button type="button" onClick={() => {
                          setPendingChangesByCase((all) => ({ ...all, [item.id]: {} }));
                          clearDeadlineResultsForCase(item.id);
                        }}>{ru ? "Отменить" : "Bekor qilish"}</button>
                        <button type="button" className="plan-primary" disabled={applyingChangesFor === item.id} onClick={() => void applyStagedChanges(item)}>
                          {applyingChangesFor === item.id ? <LoaderCircle className="spin" /> : <Check />}
                          {ru ? "Подтвердить и применить" : "Tasdiqlash va qo‘llash"}
                        </button>
                      </div>
                    </section>}
                    {item.steps.map((step) => {
                      const staged = pendingChangesByCase[item.id]?.[step.id];
                      const saving = applyingChangesFor === item.id;
                      const deadlineDraftKey = `${item.id}:${step.id}`;
                      const deadlineDraft = deadlineDrafts[deadlineDraftKey] ?? initialDeadlineDraft(step);
                      const builderQuery = new URLSearchParams({ caseId: item.id, stepId: step.id });
                      if (step.templateCode) builderQuery.set("template", step.templateCode);
                      return <div className={`plan-step ${step.status === "completed" ? "done" : ""}`} key={step.id}>
                        <span>{step.status === "completed" ? <Check /> : step.ordinal}</span>
                        <div>
                          <strong>{step.title}</strong>
                          {step.dueAt && <small>{formatPlatformDate(step.dueAt, ru ? "ru" : "uz")}</small>}
                        </div>
                        <label className="plan-step-date">
                          <span>{ru ? "Срок" : "Muddat"}</span>
                          <input
                            type="date"
                            value={staged?.dueAt ?? step.dueAt?.slice(0, 10) ?? ""}
                            disabled={saving}
                            onChange={(event) => stageStepChange(item, step, { dueAt: event.target.value || null, deadlineCalculation: null })}
                          />
                        </label>
                        <label className="plan-step-status">
                          <span className="sr-only">{ru ? "Статус шага" : "Qadam holati"}</span>
                          <select
                            value={staged?.status ?? step.status}
                            disabled={saving}
                            onChange={(event) => stageStepChange(item, step, { status: event.target.value as StepStatus })}
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
                        <details className="deadline-calculator">
                          <summary>{ru ? "Рассчитать срок" : "Muddatni hisoblash"}</summary>
                          <div className="deadline-calculator-grid">
                            <label>
                              <span>{ru ? "Исходная дата" : "Boshlang‘ich sana"}</span>
                              <input type="date" required value={deadlineDraft.sourceDate} onChange={(event) => updateDeadlineDraft(item, step, { sourceDate: event.target.value, result: undefined })} />
                            </label>
                            <label>
                              <span>{ru ? "Количество дней" : "Kunlar soni"}</span>
                              <input type="number" required min="0" max="3650" inputMode="numeric" value={deadlineDraft.daysCount} onChange={(event) => updateDeadlineDraft(item, step, { daysCount: event.target.value, result: undefined })} />
                            </label>
                            <label>
                              <span>{ru ? "Тип дней" : "Kun turi"}</span>
                              <select value={deadlineDraft.dayType} onChange={(event) => updateDeadlineDraft(item, step, { dayType: event.target.value as DeadlineDraft["dayType"], result: undefined })}>
                                <option value="calendar_days">{ru ? "Календарные" : "Kalendar"}</option>
                                <option value="business_days">{ru ? "Рабочие" : "Ish kunlari"}</option>
                              </select>
                            </label>
                            <label>
                              <span>{ru ? "Перенос" : "Ko‘chirish"}</span>
                              <select value={deadlineDraft.rollRule} onChange={(event) => updateDeadlineDraft(item, step, { rollRule: event.target.value as DeadlineDraft["rollRule"], result: undefined })}>
                                <option value="none">{ru ? "Не переносить" : "Ko‘chirmaslik"}</option>
                                <option value="next_business_day">{ru ? "На следующий рабочий день" : "Keyingi ish kuniga"}</option>
                                <option value="previous_business_day">{ru ? "На предыдущий рабочий день" : "Oldingi ish kuniga"}</option>
                              </select>
                            </label>
                            <label>
                              <span>{ru ? "Безопасный запас, раб. дней" : "Xavfsiz zaxira, ish kuni"}</span>
                              <input type="number" min="0" max="30" inputMode="numeric" value={deadlineDraft.safeMarginBusinessDays} onChange={(event) => updateDeadlineDraft(item, step, { safeMarginBusinessDays: event.target.value, result: undefined })} />
                            </label>
                            <label className="deadline-calculator-wide">
                              <span>{ru ? "Праздничные даты (ГГГГ-ММ-ДД)" : "Bayram sanalari (YYYY-MM-DD)"}</span>
                              <input value={deadlineDraft.holidays} placeholder="2026-09-01, 2026-12-08" onChange={(event) => updateDeadlineDraft(item, step, { holidays: event.target.value, result: undefined })} />
                            </label>
                            <label className="deadline-calculator-wide">
                              <span>{ru ? "Версия календаря, если известна" : "Kalendar versiyasi, ma’lum bo‘lsa"}</span>
                              <input maxLength={120} value={deadlineDraft.holidayCalendarVersion} placeholder={ru ? "Это значение не подтверждает календарь" : "Bu qiymat kalendarni tasdiqlamaydi"} onChange={(event) => updateDeadlineDraft(item, step, { holidayCalendarVersion: event.target.value, result: undefined })} />
                            </label>
                            <label className="deadline-calculator-wide">
                              <span>{ru ? "Правовое основание" : "Huquqiy asos"}</span>
                              <textarea rows={2} maxLength={500} value={deadlineDraft.legalBasis} placeholder={ru ? "Укажите норму после проверки источника" : "Manba tekshirilgandan keyin normani kiriting"} onChange={(event) => updateDeadlineDraft(item, step, { legalBasis: event.target.value, result: undefined })} />
                            </label>
                            <label className="deadline-calculator-check">
                              <input type="checkbox" checked={deadlineDraft.includeSourceDate} onChange={(event) => updateDeadlineDraft(item, step, { includeSourceDate: event.target.checked, result: undefined })} />
                              <span>{ru ? "Включать исходную дату в отсчёт" : "Boshlang‘ich sanani hisobga qo‘shish"}</span>
                            </label>
                          </div>
                          <button type="button" className="deadline-calculate" disabled={deadlineDraft.loading || !deadlineDraft.sourceDate || deadlineDraft.daysCount === ""} onClick={() => void previewDeadline(item, step)}>
                            {deadlineDraft.loading ? <LoaderCircle className="spin" /> : <CalendarDays />}
                            {ru ? "Показать проверяемый расчёт" : "Tekshiriladigan hisobni ko‘rsatish"}
                          </button>
                          {deadlineDraft.error && <p className="deadline-calculator-error" role="alert">{deadlineDraft.error}</p>}
                          {deadlineDraft.result && <section className="deadline-result" aria-live="polite">
                            <strong>{ru ? "Предварительный расчёт" : "Dastlabki hisob"}</strong>
                            <dl>
                              <div><dt>{ru ? "Расчётная дата" : "Hisoblangan sana"}</dt><dd>{deadlineDraft.result.dueDate}</dd></div>
                              <div><dt>{ru ? "Безопасная дата" : "Xavfsiz sana"}</dt><dd>{deadlineDraft.result.safeEarlierDate}</dd></div>
                              <div><dt>{ru ? "Выходных в периоде" : "Davrdagi dam olish kunlari"}</dt><dd>{deadlineDraft.result.weekendDates.length}</dd></div>
                              <div><dt>{ru ? "Указанных праздников" : "Ko‘rsatilgan bayramlar"}</dt><dd>{deadlineDraft.result.holidayDates.length}</dd></div>
                            </dl>
                            <p>{ru ? "Дата добавлена в предпросмотр плана. Она сохранится только после подтверждения изменений." : "Sana reja oldindan ko‘rishiga qo‘shildi. U faqat o‘zgarishlar tasdiqlangandan keyin saqlanadi."}</p>
                            {deadlineDraft.result.warnings.length > 0 && <ul>
                              {deadlineDraft.result.warnings.map((warning) => <li key={warning}>{warning === "HOLIDAY_CALENDAR_UNVERIFIED"
                                ? (ru ? "Календарь праздников не подтверждён." : "Bayramlar kalendari tasdiqlanmagan.")
                                : warning === "LEGAL_BASIS_UNCONFIRMED"
                                  ? (ru ? "Правовое основание не подтверждено." : "Huquqiy asos tasdiqlanmagan.")
                                  : (ru ? "Дата приходится на нерабочий день без переноса." : "Sana ko‘chirilmasdan ish bo‘lmagan kunga to‘g‘ri keladi.")}</li>)}
                            </ul>}
                          </section>}
                          {step.deadlineConfidence && step.deadlineConfidence !== "unverified" && <p className="deadline-stored-evidence">
                            {ru ? `Сохранённый расчёт: ${step.deadlineConfidence === "preliminary" ? "предварительный" : "источник проверен"}.` : `Saqlangan hisob: ${step.deadlineConfidence === "preliminary" ? "dastlabki" : "manba tekshirilgan"}.`}
                            {step.safeDueAt ? ` ${ru ? "Безопасная дата" : "Xavfsiz sana"}: ${step.safeDueAt.slice(0, 10)}.` : ""}
                          </p>}
                        </details>
                      </div>;
                    })}
                  </div>}
                </article>;
              })}
        </section>
      </section>
      <aside className="plan-calendar">
        <h2>{ru ? "Ближайшие сроки" : "Yaqin muddatlar"}</h2>
        <div className="today"><CalendarDays /><div><small>{ru ? "Сегодня" : "Bugun"}</small><strong>{formatPlatformDate(new Date(), ru ? "ru" : "uz", { dateStyle: "long" })}</strong></div></div>
        {deadlines.length
          ? deadlines.slice(0, 8).map((item) => <div className="deadline" key={`${item.date}-${item.title}`}>
            <time dateTime={item.date}>{formatPlatformDayMonth(item.date, ru ? "ru" : "uz")}</time>
            <div><strong>{item.title}</strong><small>{item.caseTitle}</small></div>
          </div>)
          : <p>{ru ? "Сроки появятся после назначения дат конкретным шагам." : "Aniq qadamlar uchun sana belgilangandan keyin muddatlar ko‘rinadi."}</p>}
        <Link className="plan-consult" href={`${base}/consultations`}>{ru ? "Записаться на консультацию" : "Maslahatga yozilish"}<span>→</span></Link>
      </aside>
    </div>
  </div>;
}
