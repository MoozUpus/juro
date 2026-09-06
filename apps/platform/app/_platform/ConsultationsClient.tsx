"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated consultation data is hydrated after the first browser render */

import Link from "next/link";
import { CalendarClock, LoaderCircle, ShieldAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { platformApiError } from "../../content/platform-ui";
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

const consultationsCopy = {
  ru: { loadError: "Не удалось загрузить консультации.", unavailable: "Передача специалисту недоступна на бесплатном плане.", confirmContext: "Подтвердите передачу выбранного контекста.", requestError: "Заявка не создана.", contextUnavailable: "Выбранный контекст недоступен.", slotUnavailable: "Это время больше недоступно. Выберите другой слот.", title: "Консультации", description: "Показываются только реальные слоты, заведённые командой JURO. Заявка не считается назначенной консультацией до подтверждения специалистом и стоимости.", planLimit: "Передача специалисту не входит в бесплатный план", planDescription: "Посмотрите доступные тарифы. Оплата и заявка не будут имитироваться, пока соответствующий сервис недоступен.", viewPlan: "Посмотреть тариф", consent: "Разрешаю передать специалисту только выбранный при оформлении контекст.", comparison: "Будет передано сравнение", operator: "Оператор", lawyer: "Юрист", creating: "Создаём заявку…", price: "Стоимость сообщается до подтверждения", noSlots: "Свободных слотов пока нет", noSlotsDescription: "JURO не создаёт вымышленную доступность. Новый слот появится после публикации оператором или юристом.", requests: "Мои заявки" },
  uz: { loadError: "Maslahatlarni yuklab bo‘lmadi.", unavailable: "Mutaxassisga topshirish bepul rejada mavjud emas.", confirmContext: "Tanlangan kontekstni uzatishni tasdiqlang.", requestError: "So‘rov yaratilmadi.", contextUnavailable: "Tanlangan kontekst mavjud emas.", slotUnavailable: "Bu vaqt endi mavjud emas. Boshqa vaqtni tanlang.", title: "Maslahatlar", description: "Faqat JURO jamoasi kiritgan haqiqiy vaqtlar ko‘rsatiladi. Mutaxassis va narx tasdiqlamaguncha so‘rov maslahat tayinlandi degani emas.", planLimit: "Mutaxassisga topshirish bepul rejaga kirmaydi", planDescription: "Mavjud tariflarni ko‘ring. Tegishli xizmat mavjud bo‘lmaguncha to‘lov va so‘rov taqlid qilinmaydi.", viewPlan: "Tarifni ko‘rish", consent: "Rasmiylashtirishda tanlangan kontekstnigina mutaxassisga berishga ruxsat beraman.", comparison: "Taqqoslash yuboriladi", operator: "Operator", lawyer: "Yurist", creating: "So‘rov yaratilmoqda…", price: "Narx tasdiqlashdan oldin ko‘rsatiladi", noSlots: "Hozircha bo‘sh vaqt yo‘q", noSlotsDescription: "JURO soxta mavjudlik yaratmaydi. Yangi vaqt operator yoki yurist e’lon qilgandan keyin paydo bo‘ladi.", requests: "Mening so‘rovlarim" },
  en: { loadError: "We could not load consultations.", unavailable: "Lawyer handoff is not available on the free plan.", confirmContext: "Confirm that you want to share the selected context.", requestError: "The request could not be created.", contextUnavailable: "The selected context is no longer available.", slotUnavailable: "This time is no longer available. Choose another slot.", title: "Consultations", description: "Only real appointment slots published by the JURO team are shown. A request is not a confirmed consultation until the specialist and price are confirmed.", planLimit: "Lawyer handoff is not included in the free plan", planDescription: "Review the available plans. JURO will not simulate a payment or request while the corresponding service is unavailable.", viewPlan: "View plans", consent: "I authorize JURO to share only the context selected while making this request.", comparison: "Comparison to be shared", operator: "Operator", lawyer: "Lawyer", creating: "Creating request…", price: "The price is shown before confirmation", noSlots: "No appointment slots are currently available", noSlotsDescription: "JURO does not invent availability. A new slot will appear after an operator or lawyer publishes it.", requests: "My requests" },
} as const;

export function ConsultationsClient({ locale }: { locale: PlatformLocale }) {
  const copy = consultationsCopy[locale];
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
      if (!response.ok) throw new Error(platformApiError(locale, data.error, copy.loadError));
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
  }, [comparisonId, copy.loadError, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  async function book(slotId: string) {
    if (!entitlements?.lawyerHandoff) {
      setError(copy.unavailable);
      return;
    }
    if (!consent) {
      setError(copy.confirmContext);
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
      const data = await response.json() as { error?: string; code?: string };
      if (!response.ok) {
        const fallback = data.code === "PLAN_LIMIT"
          ? copy.unavailable
          : data.code === "CONTEXT_UNAVAILABLE"
            ? copy.contextUnavailable
            : data.code === "SLOT_UNAVAILABLE"
              ? copy.slotUnavailable
              : copy.requestError;
        setError(platformApiError(locale, data.error, fallback));
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
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </header>
      {error && <p className="plan-error" role="alert">{error}</p>}
      {loading ? <LoaderCircle className="spin" /> : (
        <>
          {!entitlements?.lawyerHandoff && <div className="consult-plan-limit">
            <ShieldAlert />
            <div>
              <strong>{copy.planLimit}</strong>
              <p>{copy.planDescription}</p>
              <Link href={`${base}/billing`}>{copy.viewPlan}</Link>
            </div>
          </div>}
          <label className="consult-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={!entitlements?.lawyerHandoff}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>{copy.consent}</span>
          </label>
          {comparisonLabel && <div className="consult-selected-context">
            <ShieldAlert />
            <div>
              <strong>{copy.comparison}</strong>
              <span>{comparisonLabel}</span>
            </div>
          </div>}
          {slots.length ? <div className="slot-grid">
            {slots.slice(0, 24).map((slot) => <button
              key={slot.id}
              disabled={!entitlements?.lawyerHandoff || Boolean(bookingSlotId)}
              onClick={() => void book(slot.id)}
            >
              <span>{slot.specialistType === "operator" ? copy.operator : copy.lawyer}</span>
              <strong>{formatDateTime(slot.startsAt, locale)}</strong>
              <small>{bookingSlotId === slot.id
                ? copy.creating
                : copy.price}</small>
            </button>)}
          </div> : <div className="consult-empty">
            <ShieldAlert />
            <h2>{copy.noSlots}</h2>
            <p>{copy.noSlotsDescription}</p>
          </div>}
          {bookings.length > 0 && <section className="consult-bookings">
            <h2>{copy.requests}</h2>
            {bookings.map((booking) => <div key={booking.id}>
              <strong>{booking.specialistType === "operator" ? copy.operator : copy.lawyer}</strong>
              <span>{bookingStatusLabel(booking.status, locale)}</span>
              <time dateTime={booking.startsAt}>{formatDateTime(booking.startsAt, locale)}</time>
            </div>)}
          </section>}
        </>
      )}
    </section>
  );
}

function formatDateTime(value: string, locale: PlatformLocale) {
  return new Intl.DateTimeFormat({ ru: "ru-RU", uz: "uz-UZ", en: "en-GB" }[locale], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tashkent",
  }).format(new Date(value));
}

function bookingStatusLabel(status: string, locale: PlatformLocale) {
  const labels: Record<string, Record<PlatformLocale, string>> = {
    request_created: { ru: "Заявка создана", uz: "So‘rov yaratildi", en: "Request created" },
    conflict_check: { ru: "Проверка конфликта", uz: "Manfaatlar to‘qnashuvi tekshirilmoqda", en: "Conflict check" },
    awaiting_user_consent: { ru: "Нужно подтверждение", uz: "Tasdiqlash kerak", en: "Confirmation required" },
    confirmed: { ru: "Подтверждено", uz: "Tasdiqlandi", en: "Confirmed" },
    cancelled: { ru: "Отменено", uz: "Bekor qilindi", en: "Cancelled" },
    completed: { ru: "Завершено", uz: "Yakunlandi", en: "Completed" },
  };
  const label = labels[status];
  return label ? label[locale] : status;
}
