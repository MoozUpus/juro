"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated consultation data is hydrated after the first browser render */

import Link from "next/link";
import { CalendarClock, LoaderCircle, ShieldAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceEntitlements } from "../../lib/billing/entitlements";
import type { PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

type Slot = {
  id: string;
  specialistType: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
};

type Booking = {
  id: string;
  status: string;
  specialistType: string;
  startsAt: string;
  endsAt: string;
};

export function ConsultationsClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const comparisonId = useSearchParams().get("comparisonId") || "";
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [entitlements, setEntitlements] = useState<WorkspaceEntitlements | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bookingSlotId, setBookingSlotId] = useState("");
  const [error, setError] = useState("");
  const [comparisonLabel, setComparisonLabel] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/consultations", { cache: "no-store" });
      const data = await response.json() as {
        slots?: Slot[];
        bookings?: Booking[];
        entitlements?: WorkspaceEntitlements;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Ошибка");
      setSlots(data.slots || []);
      setBookings(data.bookings || []);
      setEntitlements(data.entitlements ?? null);
      if (comparisonId) {
        const comparisonResponse = await fetch(
          `/api/platform/document-comparisons/${encodeURIComponent(comparisonId)}`,
          { cache: "no-store" },
        );
        if (comparisonResponse.ok) {
          const comparisonBody = await comparisonResponse.json() as {
            comparison?: { versionOneName: string; versionTwoName: string };
          };
          if (comparisonBody.comparison) {
            setComparisonLabel(
              `${comparisonBody.comparison.versionOneName} ↔ ${comparisonBody.comparison.versionTwoName}`,
            );
          }
        }
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [comparisonId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function book(slotId: string) {
    if (!entitlements?.lawyerHandoff) {
      setError(ru
        ? "Передача специалисту недоступна на бесплатном плане."
        : "Mutaxassisga topshirish bepul rejada mavjud emas.");
      return;
    }
    if (!consent) {
      setError(ru
        ? "Подтвердите передачу выбранного контекста."
        : "Tanlangan kontekstni uzatishni tasdiqlang.");
      return;
    }
    setBookingSlotId(slotId);
    setError("");
    try {
      const response = await fetch("/api/platform/consultations", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({
          slotId,
          consent: true,
          comparisonId: comparisonId || undefined,
          locale,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(data.error || (ru ? "Заявка не создана." : "So‘rov yaratilmadi."));
        return;
      }
      setConsent(false);
      await load();
    } finally {
      setBookingSlotId("");
    }
  }

  return (
    <section className="consult-workspace">
      <header>
        <CalendarClock />
        <div>
          <small>JURO</small>
          <h1>{ru ? "Консультации" : "Maslahatlar"}</h1>
          <p>{ru
            ? "Показываются только реальные слоты, заведённые командой JURO. Заявка не считается назначенной консультацией до подтверждения специалистом и стоимости."
            : "Faqat JURO jamoasi kiritgan haqiqiy vaqtlar ko‘rsatiladi. Mutaxassis va narx tasdiqlamaguncha so‘rov maslahat tayinlandi degani emas."}</p>
        </div>
      </header>
      {error && <p className="plan-error" role="alert">{error}</p>}
      {loading ? <LoaderCircle className="spin" /> : (
        <>
          {!entitlements?.lawyerHandoff && <div className="consult-plan-limit">
            <ShieldAlert />
            <div>
              <strong>{ru ? "Передача специалисту не входит в бесплатный план" : "Mutaxassisga topshirish bepul rejaga kirmaydi"}</strong>
              <p>{ru ? "Посмотрите доступные тарифы. Оплата и заявка не будут имитироваться, пока соответствующий сервис недоступен." : "Mavjud tariflarni ko‘ring. Tegishli xizmat mavjud bo‘lmaguncha to‘lov va so‘rov taqlid qilinmaydi."}</p>
              <Link href={`${base}/billing`}>{ru ? "Посмотреть тариф" : "Tarifni ko‘rish"}</Link>
            </div>
          </div>}
          <label className="consult-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={!entitlements?.lawyerHandoff}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>{ru
              ? "Разрешаю передать специалисту только выбранный при оформлении контекст."
              : "Rasmiylashtirishda tanlangan kontekstnigina mutaxassisga berishga ruxsat beraman."}</span>
          </label>
          {comparisonLabel && <div className="consult-selected-context">
            <ShieldAlert />
            <div>
              <strong>{ru ? "Будет передано сравнение" : "Taqqoslash yuboriladi"}</strong>
              <span>{comparisonLabel}</span>
            </div>
          </div>}
          {slots.length ? <div className="slot-grid">
            {slots.slice(0, 24).map((slot) => <button
              key={slot.id}
              disabled={!entitlements?.lawyerHandoff || Boolean(bookingSlotId)}
              onClick={() => void book(slot.id)}
            >
              <span>{slot.specialistType === "operator" ? (ru ? "Оператор" : "Operator") : (ru ? "Юрист" : "Yurist")}</span>
              <strong>{formatDateTime(slot.startsAt, ru)}</strong>
              <small>{bookingSlotId === slot.id
                ? (ru ? "Создаём заявку…" : "So‘rov yaratilmoqda…")
                : (ru ? "Стоимость сообщается до подтверждения" : "Narx tasdiqlashdan oldin ko‘rsatiladi")}</small>
            </button>)}
          </div> : <div className="consult-empty">
            <ShieldAlert />
            <h2>{ru ? "Свободных слотов пока нет" : "Hozircha bo‘sh vaqt yo‘q"}</h2>
            <p>{ru ? "JURO не создаёт вымышленную доступность. Новый слот появится после публикации оператором или юристом." : "JURO soxta mavjudlik yaratmaydi. Yangi vaqt operator yoki yurist e’lon qilgandan keyin paydo bo‘ladi."}</p>
          </div>}
          {bookings.length > 0 && <section className="consult-bookings">
            <h2>{ru ? "Мои заявки" : "Mening so‘rovlarim"}</h2>
            {bookings.map((booking) => <div key={booking.id}>
              <strong>{booking.specialistType === "operator" ? (ru ? "Оператор" : "Operator") : (ru ? "Юрист" : "Yurist")}</strong>
              <span>{bookingStatusLabel(booking.status, ru)}</span>
              <time dateTime={booking.startsAt}>{formatDateTime(booking.startsAt, ru)}</time>
            </div>)}
          </section>}
        </>
      )}
    </section>
  );
}

function formatDateTime(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tashkent",
  }).format(new Date(value));
}

function bookingStatusLabel(status: string, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    request_created: ["Заявка создана", "So‘rov yaratildi"],
    conflict_check: ["Проверка конфликта", "Manfaatlar to‘qnashuvi tekshirilmoqda"],
    awaiting_user_consent: ["Нужно подтверждение", "Tasdiqlash kerak"],
    confirmed: ["Подтверждено", "Tasdiqlandi"],
    cancelled: ["Отменено", "Bekor qilindi"],
    completed: ["Завершено", "Yakunlandi"],
  };
  const label = labels[status];
  return label ? label[ru ? 0 : 1] : status;
}
