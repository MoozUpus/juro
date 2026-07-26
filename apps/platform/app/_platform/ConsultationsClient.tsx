"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated consultation data is hydrated after the first browser render */

import { CalendarClock, LoaderCircle, ShieldAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type Slot = { id: string; specialistType: string; startsAt: string; endsAt: string; timezone: string };
type Booking = { id: string; status: string; specialistType: string; startsAt: string; endsAt: string };

export function ConsultationsClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const comparisonId = useSearchParams().get("comparisonId") || "";
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comparisonLabel, setComparisonLabel] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/consultations", { cache: "no-store" });
      const data = await response.json() as { slots?: Slot[]; bookings?: Booking[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Ошибка");
      setSlots(data.slots || []);
      setBookings(data.bookings || []);
      if (comparisonId) {
        const comparisonResponse = await fetch(`/api/platform/document-comparisons/${encodeURIComponent(comparisonId)}`, { cache: "no-store" });
        if (comparisonResponse.ok) {
          const comparisonBody = await comparisonResponse.json() as { comparison?: { versionOneName: string; versionTwoName: string } };
          if (comparisonBody.comparison) setComparisonLabel(`${comparisonBody.comparison.versionOneName} ↔ ${comparisonBody.comparison.versionTwoName}`);
        }
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [comparisonId]);

  useEffect(() => { void load(); }, [load]);

  async function book(slotId: string) {
    if (!consent) {
      setError(ru ? "Подтвердите передачу выбранного контекста." : "Tanlangan kontekstni uzatishni tasdiqlang.");
      return;
    }
    const response = await fetch("/api/platform/consultations", {
      method: "POST",
      headers: { "content-type": "application/json", "x-juro-csrf": "1" },
      body: JSON.stringify({ slotId, consent: true, comparisonId: comparisonId || undefined, locale }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setConsent(false);
    await load();
  }

  return (
    <section className="consult-workspace">
      <header><CalendarClock /><div><small>JURO</small><h1>{ru ? "Консультации" : "Maslahatlar"}</h1><p>{ru ? "Показываются только реальные слоты, заведённые командой JURO. Заявка не считается назначенной консультацией до подтверждения специалистом и стоимости." : "Faqat JURO jamoasi kiritgan haqiqiy vaqtlar ko‘rsatiladi. Mutaxassis va narx tasdiqlamaguncha so‘rov maslahat tayinlandi degani emas."}</p></div></header>
      {error && <p className="plan-error">{error}</p>}
      {loading ? <LoaderCircle className="spin" /> : (
        <>
          <label className="consult-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>{ru ? "Разрешаю передать специалисту только выбранный при оформлении контекст." : "Rasmiylashtirishda tanlangan kontekstnigina mutaxassisga berishga ruxsat beraman."}</span></label>
          {comparisonLabel && <div className="consult-selected-context"><ShieldAlert /><div><strong>{ru ? "Будет передано сравнение" : "Taqqoslash yuboriladi"}</strong><span>{comparisonLabel}</span></div></div>}
          {slots.length ? <div className="slot-grid">{slots.slice(0, 24).map(slot => <button key={slot.id} onClick={() => void book(slot.id)}><span>{slot.specialistType === "operator" ? (ru ? "Оператор" : "Operator") : (ru ? "Юрист" : "Yurist")}</span><strong>{formatDateTime(slot.startsAt, ru)}</strong><small>{ru ? "Стоимость сообщается до подтверждения" : "Narx tasdiqlashdan oldin ko‘rsatiladi"}</small></button>)}</div> : <div className="consult-empty"><ShieldAlert /><h2>{ru ? "Свободных слотов пока нет" : "Hozircha bo‘sh vaqt yo‘q"}</h2><p>{ru ? "JURO не создаёт вымышленную доступность. Новый слот появится после публикации оператором или юристом." : "JURO soxta mavjudlik yaratmaydi. Yangi vaqt operator yoki yurist e’lon qilgandan keyin paydo bo‘ladi."}</p></div>}
          {bookings.length > 0 && <section className="consult-bookings"><h2>{ru ? "Мои заявки" : "Mening so‘rovlarim"}</h2>{bookings.map(booking => <div key={booking.id}><strong>{booking.specialistType === "operator" ? (ru ? "Оператор" : "Operator") : (ru ? "Юрист" : "Yurist")}</strong><span>{booking.status}</span><time>{formatDateTime(booking.startsAt, ru)}</time></div>)}</section>}
        </>
      )}
    </section>
  );
}

function formatDateTime(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" }).format(new Date(value));
}
