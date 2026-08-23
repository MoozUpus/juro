"use client";

/* eslint-disable react-hooks/set-state-in-effect -- consultation state is loaded from the authenticated API */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, LoaderCircle, Video } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type Consultation = {
  id: string;
  requestId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  format: "video" | "phone" | "office";
  status: "proposed" | "confirmed" | "in_progress" | "completed" | "cancelled";
  attendanceOutcome?: "no_show" | null;
  internalNote?: string | null;
  resultNote?: string | null;
};

export function LawyerConsultationPanel({
  locale,
  requestId,
  role,
}: {
  locale: PlatformLocale;
  requestId: string;
  role: "client" | "lawyer";
}) {
  const ru = locale === "ru";
  const pathname = usePathname();
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [format, setFormat] = useState<Consultation["format"]>("video");
  const [internalNote, setInternalNote] = useState("");
  const [resultNote, setResultNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [observedAt, setObservedAt] = useState(0);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/platform/lawyer-consultations?requestId=${encodeURIComponent(requestId)}`,
      { cache: "no-store" },
    );
    const body = (await response.json()) as {
      consultations?: Consultation[];
      error?: string;
    };
    if (!response.ok) throw new Error(body.error || "Ошибка");
    const next = body.consultations?.[0] || null;
    setConsultation(next);
    setObservedAt(Date.now());
    if (next && role === "lawyer") {
      setStartsAt(toLocalInput(next.startsAt));
      setEndsAt(toLocalInput(next.endsAt));
      setFormat(next.format);
      setInternalNote(next.internalNote || "");
      setResultNote(next.resultNote || "");
    }
  }, [requestId, role]);

  useEffect(() => {
    void load()
      .catch((value) =>
        setError(value instanceof Error ? value.message : String(value)),
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function mutate(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/lawyer-consultations", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ requestId, ...payload }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Ошибка");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  }

  async function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startsAt || !endsAt) return;
    await mutate({
      action: "propose",
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      format,
      internalNote: internalNote.trim() || undefined,
    });
  }

  if (loading)
    return (
      <div className="lawyer-consultation-panel is-loading">
        <LoaderCircle
          className="spin"
          aria-label={
            ru ? "Загрузка консультации" : "Konsultatsiya yuklanmoqda"
          }
        />
      </div>
    );

  return (
    <section
      className="lawyer-consultation-panel"
      aria-label={ru ? "Консультация" : "Konsultatsiya"}
    >
      <header>
        <CalendarClock aria-hidden="true" />
        <div>
          <strong>{ru ? "Консультация" : "Konsultatsiya"}</strong>
          <small>{ru ? "Время Asia/Tashkent" : "Asia/Tashkent vaqti"}</small>
        </div>
        {consultation && (
          <span data-status={consultation.status}>
            {statusLabel(consultation, ru, observedAt)}
          </span>
        )}
      </header>
      {error && (
        <p className="plan-error" role="alert">
          {error}
        </p>
      )}
      {consultation && consultation.status !== "cancelled" && (
        <div className="lawyer-consultation-summary">
          <time dateTime={consultation.startsAt}>
            {formatDate(consultation.startsAt, locale)}
          </time>
          <span>
            {formatLabel(consultation.format, ru)} ·{" "}
            {formatTime(consultation.startsAt, locale)}–
            {formatTime(consultation.endsAt, locale)}
          </span>
        </div>
      )}
      {consultation?.status === "completed" && !consultation.attendanceOutcome && consultation.resultNote && (
        <div className="lawyer-consultation-result">
          <strong>{ru ? "Итог консультации" : "Konsultatsiya yakuni"}</strong>
          <p>{consultation.resultNote}</p>
        </div>
      )}
      {role === "client" ? (
        <>
          {!consultation && (
            <p>
              {ru
                ? "Юрист ещё не предложил время."
                : "Yurist hali vaqt taklif qilmagan."}
            </p>
          )}
          {consultation?.status === "proposed" && (
            <div className="lawyer-consultation-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => void mutate({ action: "confirm" })}
              >
                {busy && <LoaderCircle className="spin" />}
                {ru ? "Подтвердить время" : "Vaqtni tasdiqlash"}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => void mutate({ action: "cancel" })}
              >
                {ru ? "Отклонить" : "Rad etish"}
              </button>
            </div>
          )}
          {consultation?.status === "confirmed" && (
            <div className="lawyer-consultation-actions">
              {consultation.format === "video" && <Link className="call-room-link" href={`${pathname.replace(/\/+$/, "")}/call/${encodeURIComponent(consultation.id)}`}><Video />{ru ? "Войти в видеокомнату" : "Video xonaga kirish"}</Link>}
              <button className="secondary" type="button" disabled={busy} onClick={() => void mutate({ action: "cancel" })}>{ru ? "Отменить консультацию" : "Konsultatsiyani bekor qilish"}</button>
            </div>
          )}
          {consultation?.status === "in_progress" && consultation.format === "video" && <Link className="call-room-link" href={`${pathname.replace(/\/+$/, "")}/call/${encodeURIComponent(consultation.id)}`}><Video />{ru ? "Вернуться в видеокомнату" : "Video xonaga qaytish"}</Link>}
        </>
      ) : (
        <>
          {consultation?.status === "confirmed" && (
            <div className="lawyer-consultation-actions">
              {consultation.format === "video" ? <Link className="call-room-link" href={`${pathname.replace(/\/+$/, "")}/call/${encodeURIComponent(consultation.id)}`}><Video />{ru ? "Начать видеозвонок" : "Video qo‘ng‘iroqni boshlash"}</Link> : <button type="button" disabled={busy} onClick={() => void mutate({ action: "start" })}>{busy && <LoaderCircle className="spin" />}{ru ? "Начать консультацию" : "Konsultatsiyani boshlash"}</button>}
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => void mutate({ action: "cancel" })}
              >
                {ru ? "Отменить" : "Bekor qilish"}
              </button>
              {Date.parse(consultation.startsAt) <= observedAt && (
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void mutate({ action: "no_show" })}
                >
                  {ru ? "Отметить неявку" : "Kelmaganini belgilash"}
                </button>
              )}
            </div>
          )}
          {consultation?.status === "in_progress" && (
            <div className="lawyer-consultation-completion">
              {consultation.format === "video" && <Link className="call-room-link" href={`${pathname.replace(/\/+$/, "")}/call/${encodeURIComponent(consultation.id)}`}><Video />{ru ? "Вернуться в видеокомнату" : "Video xonaga qaytish"}</Link>}
              <label>
                {ru ? "Итоговый комментарий клиенту" : "Mijoz uchun yakuniy izoh"}
                <textarea
                  required
                  maxLength={4_000}
                  value={resultNote}
                  onChange={(event) => setResultNote(event.target.value)}
                />
              </label>
              <div className="lawyer-consultation-actions">
                <button
                  type="button"
                  disabled={busy || !resultNote.trim()}
                  onClick={() => void mutate({ action: "complete", resultNote: resultNote.trim() })}
                >
                  {ru ? "Завершить консультацию" : "Konsultatsiyani yakunlash"}
                </button>
              </div>
            </div>
          )}
          {(!consultation ||
            consultation.status === "proposed" ||
            consultation.status === "cancelled" ||
            (consultation.status === "completed" && consultation.attendanceOutcome === "no_show")) && (
            <form onSubmit={(event) => void propose(event)}>
              <div>
                <label>
                  {ru ? "Начало" : "Boshlanishi"}
                  <input
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                  />
                </label>
                <label>
                  {ru ? "Окончание" : "Tugashi"}
                  <input
                    type="datetime-local"
                    required
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                  />
                </label>
              </div>
              <label>
                {ru ? "Формат" : "Format"}
                <select
                  value={format}
                  onChange={(event) =>
                    setFormat(event.target.value as Consultation["format"])
                  }
                >
                  <option value="video">{ru ? "Видеосвязь" : "Video"}</option>
                  <option value="phone">{ru ? "Телефон" : "Telefon"}</option>
                  <option value="office">{ru ? "В офисе" : "Ofisda"}</option>
                </select>
              </label>
              <label>
                {ru ? "Внутренняя заметка" : "Ichki izoh"}
                <textarea
                  maxLength={1_000}
                  value={internalNote}
                  onChange={(event) => setInternalNote(event.target.value)}
                />
              </label>
              <button type="submit" disabled={busy || !startsAt || !endsAt}>
                {busy && <LoaderCircle className="spin" />}
                {consultation?.status === "proposed"
                  ? ru
                    ? "Изменить предложение"
                    : "Taklifni o‘zgartirish"
                  : ru
                    ? "Предложить время"
                    : "Vaqt taklif qilish"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}

function toLocalInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
function formatDate(value: string, locale: PlatformLocale) {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    dateStyle: "medium",
    timeZone: "Asia/Tashkent",
  }).format(new Date(value));
}
function formatTime(value: string, locale: PlatformLocale) {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tashkent",
  }).format(new Date(value));
}
function statusLabel(consultation: Consultation, ru: boolean, observedAt: number) {
  if (consultation.attendanceOutcome === "no_show") {
    return ru ? "Не состоялась · неявка" : "O‘tkazilmadi · kelmadi";
  }
  if (consultation.status === "confirmed" && Date.parse(consultation.startsAt) > observedAt) {
    return ru ? "Предстоящая" : "Kutilayotgan";
  }
  const labels: Record<Consultation["status"], [string, string]> = {
    proposed: ["Ожидает подтверждения", "Tasdiq kutilmoqda"],
    confirmed: ["Подтверждена", "Tasdiqlangan"],
    in_progress: ["Идёт", "Davom etmoqda"],
    completed: ["Завершена", "Yakunlangan"],
    cancelled: ["Отменена", "Bekor qilingan"],
  };
  return labels[consultation.status][ru ? 0 : 1];
}
function formatLabel(format: Consultation["format"], ru: boolean) {
  const labels: Record<Consultation["format"], [string, string]> = {
    video: ["Видеосвязь", "Video"],
    phone: ["Телефон", "Telefon"],
    office: ["В офисе", "Ofisda"],
  };
  return labels[format][ru ? 0 : 1];
}
