"use client";

import {
  AlertTriangle,
  Clock3,
  Download,
  LoaderCircle,
  Play,
  Search,
  Square,
  TimerReset,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type Matter = { id: string; title: string; clientName: string | null };
type TimeEntry = {
  id: string;
  caseId: string;
  caseTitle: string;
  source: "timer" | "manual";
  status: "running" | "completed";
  description: string;
  billable: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
};
type ConflictMatch = {
  id: string;
  recordType: "case" | "internal_record";
  caseId: string | null;
  caseTitle: string;
  clientName: string | null;
  matches: Array<{ matchedTermType: string; source: string }>;
};

async function json<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T & { code?: string };
  if (!response.ok) throw new Error(value.code || `HTTP_${response.status}`);
  return value;
}

function localInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function duration(seconds: number) {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function LawyerProfessionalTools({
  locale,
  matters,
}: {
  locale: PlatformLocale;
  matters: Matter[];
}) {
  const ru = locale === "ru";
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [caseId, setCaseId] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(false);
  const [startedAt, setStartedAt] = useState(() =>
    localInput(new Date(Date.now() - 60 * 60_000)),
  );
  const [endedAt, setEndedAt] = useState(() => localInput(new Date()));
  const [timeBusy, setTimeBusy] = useState("");
  const [timeError, setTimeError] = useState("");
  const [tick, setTick] = useState(0);
  const [client, setClient] = useState("");
  const [opposingParty, setOpposingParty] = useState("");
  const [company, setCompany] = useState("");
  const [keyPersons, setKeyPersons] = useState("");
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictError, setConflictError] = useState("");
  const [conflictResult, setConflictResult] = useState<{
    potentialMatches: ConflictMatch[];
    searchedMatterCount: number;
    searchedInternalRecordCount: number;
    disclaimer: string;
  } | null>(null);
  useEffect(() => {
    void fetch("/api/platform/lawyer-time", { cache: "no-store" })
      .then((response) => json<{ entries: TimeEntry[] }>(response))
      .then((value) => setEntries(value.entries))
      .catch((value) =>
        setTimeError(value instanceof Error ? value.message : String(value)),
      );
  }, []);
  useEffect(() => {
    if (!entries.some((entry) => entry.status === "running")) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [entries]);
  const selectedCaseId = caseId || matters[0]?.id || "";

  async function timeAction(payload: Record<string, unknown>, key: string) {
    setTimeBusy(key);
    setTimeError("");
    try {
      const value = await json<{ entries: TimeEntry[] }>(
        await fetch("/api/platform/lawyer-time", {
          method: "POST",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify(payload),
        }),
      );
      setEntries(value.entries);
      setDescription("");
    } catch (value) {
      setTimeError(value instanceof Error ? value.message : String(value));
    } finally {
      setTimeBusy("");
    }
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!selectedCaseId) return;
    await timeAction(
      { action: "start", caseId: selectedCaseId, description: description.trim(), billable },
      "start",
    );
  }

  async function addManual(event: FormEvent) {
    event.preventDefault();
    if (!selectedCaseId) return;
    await timeAction(
      {
        action: "manual",
        caseId: selectedCaseId,
        description: description.trim(),
        billable,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
      },
      "manual",
    );
  }

  async function searchConflict(event: FormEvent) {
    event.preventDefault();
    setConflictBusy(true);
    setConflictError("");
    try {
      setConflictResult(
        (await json(
          await fetch("/api/platform/lawyer-conflicts", {
            method: "POST",
            headers: { "content-type": "application/json", "x-juro-csrf": "1" },
            body: JSON.stringify({
              ...(client.trim() ? { client: client.trim() } : {}),
              ...(opposingParty.trim()
                ? { opposingParty: opposingParty.trim() }
                : {}),
              ...(company.trim() ? { company: company.trim() } : {}),
              keyPersons: keyPersons
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            }),
          }),
        )) as {
          potentialMatches: ConflictMatch[];
          searchedMatterCount: number;
          searchedInternalRecordCount: number;
          disclaimer: string;
        },
      );
    } catch (value) {
      setConflictError(value instanceof Error ? value.message : String(value));
    } finally {
      setConflictBusy(false);
    }
  }

  const running = entries.find((entry) => entry.status === "running");
  const completedTotal = useMemo(
    () =>
      entries.reduce(
        (sum, entry) => sum + Number(entry.durationSeconds ?? 0),
        0,
      ),
    [entries],
  );
  function exportReport() {
    const header = [
      "case",
      "description",
      "source",
      "status",
      "billable",
      "started_at",
      "ended_at",
      "duration_seconds",
    ];
    const rows = entries.map((entry) => [
      entry.caseTitle,
      entry.description,
      entry.source,
      entry.status,
      Boolean(entry.billable),
      entry.startedAt,
      entry.endedAt,
      entry.durationSeconds,
    ]);
    const blob = new Blob(
      [[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `juro-lawyer-time-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="lawyer-professional-tools">
      <section className="lawyer-time-tool">
        <header>
          <TimerReset />
          <div>
            <h2>{ru ? "Учёт времени" : "Vaqt hisobi"}</h2>
            <p>
              {ru
                ? "Таймер и ручные записи привязаны только к разрешённым делам; billable-флаг не создаёт счёт."
                : "Taymer va qo‘lda yozuvlar faqat ruxsatli ishlarga bog‘lanadi; billable belgisi hisob yaratmaydi."}
            </p>
          </div>
        </header>
        {timeError && (
          <p role="alert" className="lawyer-workspace-error">
            {timeError}
          </p>
        )}
        {running ? (
          <div className="lawyer-running-timer">
            <Clock3 />
            <div>
              <strong>
                {duration(
                  Math.max(
                    0,
                    tick > 0
                      ? Math.floor((tick - Date.parse(running.startedAt)) / 1_000)
                      : Number(running.durationSeconds ?? 0),
                  ),
                )}
              </strong>
              <span>
                {running.caseTitle} · {running.description}
              </span>
            </div>
            <button
              type="button"
              disabled={timeBusy === running.id}
              onClick={() =>
                void timeAction(
                  { action: "stop", entryId: running.id },
                  running.id,
                )
              }
            >
              {timeBusy === running.id ? (
                <LoaderCircle className="spin" />
              ) : (
                <Square />
              )}
              {ru ? "Остановить" : "To‘xtatish"}
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void start(event)}>
            <label>
              {ru ? "Дело" : "Ish"}
              <select
                required
                value={selectedCaseId}
                onChange={(event) => setCaseId(event.target.value)}
              >
                <option value="">—</option>
                {matters.map((matter) => (
                  <option key={matter.id} value={matter.id}>
                    {matter.clientName ? `${matter.clientName} · ` : ""}
                    {matter.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {ru ? "Описание" : "Tavsif"}
              <input
                required
                minLength={1}
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label className="lawyer-check">
              <input
                type="checkbox"
                checked={billable}
                onChange={(event) => setBillable(event.target.checked)}
              />
              Billable
            </label>
            <button disabled={timeBusy === "start" || !matters.length}>
              {timeBusy === "start" ? (
                <LoaderCircle className="spin" />
              ) : (
                <Play />
              )}
              {ru ? "Запустить" : "Boshlash"}
            </button>
          </form>
        )}
        <details>
          <summary>{ru ? "Добавить вручную" : "Qo‘lda qo‘shish"}</summary>
          <form onSubmit={(event) => void addManual(event)}>
            <label>
              {ru ? "Начало" : "Boshlanish"}
              <input
                type="datetime-local"
                required
                value={startedAt}
                onChange={(event) => setStartedAt(event.target.value)}
              />
            </label>
            <label>
              {ru ? "Окончание" : "Tugash"}
              <input
                type="datetime-local"
                required
                value={endedAt}
                onChange={(event) => setEndedAt(event.target.value)}
              />
            </label>
            <button
              disabled={timeBusy === "manual" || !description.trim() || !selectedCaseId}
            >
              {timeBusy === "manual" ? (
                <LoaderCircle className="spin" />
              ) : (
                <Clock3 />
              )}
              {ru ? "Сохранить запись" : "Yozuvni saqlash"}
            </button>
          </form>
        </details>
        <footer>
          <span>
            {ru ? "Зафиксировано" : "Qayd etilgan"}:{" "}
            <strong>{duration(completedTotal)}</strong> ·{" "}
            {entries.filter((entry) => entry.billable).length} billable
          </span>
          <button type="button" disabled={!entries.length} onClick={exportReport}>
            <Download /> CSV
          </button>
        </footer>
      </section>
      <section className="lawyer-conflict-tool">
        <header>
          <Search />
          <div>
            <h2>Conflict Check</h2>
            <p>
              {ru
                ? "Поиск только по клиентам и делам, к которым у вас уже есть подтверждённый доступ."
                : "Faqat sizda tasdiqlangan ruxsat bor mijozlar va ishlar bo‘yicha qidiruv."}
            </p>
          </div>
        </header>
        <form onSubmit={(event) => void searchConflict(event)}>
          <label>
            {ru ? "Клиент" : "Mijoz"}
            <input
              value={client}
              onChange={(event) => setClient(event.target.value)}
            />
          </label>
          <label>
            {ru ? "Противоположная сторона" : "Qarshi tomon"}
            <input
              value={opposingParty}
              onChange={(event) => setOpposingParty(event.target.value)}
            />
          </label>
          <label>
            {ru ? "Компания" : "Kompaniya"}
            <input
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </label>
          <label>
            {ru
              ? "Ключевые лица, через запятую"
              : "Asosiy shaxslar, vergul bilan"}
            <input
              value={keyPersons}
              onChange={(event) => setKeyPersons(event.target.value)}
            />
          </label>
          <button
            disabled={
              conflictBusy ||
              ![client, opposingParty, company, keyPersons].some((value) =>
                value.trim(),
              )
            }
          >
            {conflictBusy ? <LoaderCircle className="spin" /> : <Search />}
            {ru ? "Искать совпадения" : "Mosliklarni qidirish"}
          </button>
        </form>
        {conflictError && (
          <p role="alert" className="lawyer-workspace-error">
            {conflictError}
          </p>
        )}
        {conflictResult && (
          <div className="lawyer-conflict-results">
            <p>
              <AlertTriangle />
              {conflictResult.disclaimer}
            </p>
            <small>
              {ru ? "Проверено доступных дел" : "Tekshirilgan ruxsatli ishlar"}:{" "}
              {conflictResult.searchedMatterCount}
              {" · "}
              {ru ? "внутренних записей" : "ichki yozuvlar"}: {conflictResult.searchedInternalRecordCount}
            </small>
            {conflictResult.potentialMatches.length ? (
              <ol>
                {conflictResult.potentialMatches.map((match) => (
                  <li key={match.id}>
                    <strong>{match.caseTitle}</strong>
                    <span>{match.clientName || "—"}</span>
                    <small>
                      {match.matches
                        .map(
                          (item) => `${item.matchedTermType}: ${item.source}`,
                        )
                        .join(" · ")}
                    </small>
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                {ru
                  ? "Потенциальных совпадений не найдено. Ручная проверка всё равно обязательна."
                  : "Ehtimoliy moslik topilmadi. Qo‘lda tekshirish baribir shart."}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
